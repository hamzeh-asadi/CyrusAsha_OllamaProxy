#!/usr/bin/env node

/*
  CyrusAsha_OllamaProxy
  ---------------------
  این فایل یک proxy محلی می‌سازد که از دید Visual Studio / GitHub Copilot
  شبیه Ollama یا OpenAI-compatible endpoint دیده می‌شود، اما پشت صحنه
  درخواست‌ها را با API key به یک یا چند freellmapi upstream می‌فرستد.

  نکته مهم:
  - رفتار پروکسی تغییری نکرده است؛ فقط لایه‌ی تنظیمات ساده شده است.
  - تنها فایل تنظیمات `CyrusAsha_OllamaProxy.config.json` است؛ فایل `.env` وجود ندارد.
  - سرورها فقط با یک کلید تعریف می‌شوند: آرایه‌ی `UPSTREAMS` که هر عضو آن
    `{ "url": "...", "key": "..." }` است (نام اختیاری). ترتیب اعضا، ترتیب
    failover است و proxy می‌تواند روی آن‌ها ordered یا round-robin کار کند.
  - هر سرور می‌تواند با `"models": ["..."]` اعلام کند کدام مدل‌ها را سرو می‌کند؛
    درخواست هر مدل اول به همان سرورها می‌رود و سرور بدون `models` همه‌ی مدل‌ها
    را می‌پذیرد.
  - مدل‌ها هم در همان فایل و به شکل آرایه‌ی `OLLAMA_MODELS` تعریف می‌شوند.
  - شکل‌های قدیمی (BASE_URLs + API_KEY، UPSTREAMS_JSON و نام‌های FREELLMAPI_*)
    هنگام شروع یک‌بار خودکار به همین آرایه تبدیل می‌شوند.

  جریان کلی:

    Copilot / Visual Studio
          ↓
    http://127.0.0.1:11434
          ↓
    این proxy
          ↓ Authorization: Bearer <API KEY>
    freellmapi upstream 1 / upstream 2 / ...
*/

// ماژول داخلی Node.js برای ساخت HTTP server.
import http from 'node:http';

// ماژول path برای چاپ نام فایل‌های پیکربندی در لاگ.
import path from 'node:path';

// لایه پیکربندی: تنها فایل CyrusAsha_OllamaProxy.config.json را می‌خواند.
import { loadConfig, PROJECT_NAME, CONFIG_FILE_NAME } from './config.js';

// تنظیمات برنامه از یک فایل JSON خوانده می‌شود؛ متغیرهای شل روی آن اولویت دارند.
// اگر JSON معتبر نباشد، قبل از هر نوشتنی متوقف می‌شویم تا فایل خراب نشود.
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`❌ Config error: ${err.message}`);
  console.error('   Nothing was written. Fix the file named above, then start the proxy again.');
  process.exit(1);
}

// خلاصه‌ی بارگذاری تنظیمات.
console.log(`🔧 ${PROJECT_NAME} config: ${config.configFileName}${config.syncEnabled ? '' : ' (read-only: CONFIG_SYNC=off)'}`);

if (config.wrote) {
  console.log(`💾 Config file updated: ${path.basename(config.file)}`);
}

for (const note of config.migrated) {
  console.log(`🔤 Config migration: ${note}`);
}

if (config.importedEnv) {
  console.log(`📦 ${path.basename(config.importedEnv)} kept as a backup; it is no longer read.`);
}

// پورتی که proxy روی آن گوش می‌دهد. 11434 پورت پیش‌فرض Ollama است.
const PORT = config.getNumber('PORT', 11434);

// آدرس local که server روی آن bind می‌شود. 127.0.0.1 یعنی فقط همین سیستم.
const HOST = config.get('HOST', '127.0.0.1');

// مدل پیش‌فرض upstream. برای سناریوی شما معمولاً auto است.
const DEFAULT_MODEL = config.get('DEFAULT_MODEL', 'auto');

// timeout درخواست به freellmapi. پیش‌فرض 120 ثانیه.
const REQUEST_TIMEOUT_MS = config.getNumber('REQUEST_TIMEOUT_MS', 120000);

// اگر true باشد، مدل‌های نمایشی برای Ollama با :latest نمایش داده می‌شوند.
const ADD_LATEST_TAG = config.getBool('ADD_LATEST_TAG', true);

// استراتژی انتخاب upstream:
// ordered     یعنی همیشه از اولی شروع کن و فقط اگر خطا خورد برو بعدی.
// round-robin یعنی هر درخواست از upstream بعدی شروع می‌شود و در صورت خطا failover می‌کند.
const UPSTREAM_STRATEGY = String(config.get('UPSTREAM_STRATEGY', 'ordered')).toLowerCase();

// status codeهایی که اگر از upstream بگیریم، ارزش retry روی upstream بعدی دارند.
// 429 یعنی rate limit/quota؛ 5xx یعنی خطای سرور؛ 401/403 شاید key آن upstream مشکل داشته باشد.
// می‌توان CSV نوشت (429,500) یا JSON array (["429","500"]).
const RETRY_STATUS_CODES = config
  .getList('RETRY_STATUS_CODES', ['401', '403', '404', '408', '409', '429', '500', '502', '503', '504'])
  .map(item => Number(typeof item === 'object' ? item.value ?? '' : item))
  .filter(Number.isFinite);

// مدل‌هایی که Copilot/Visual Studio می‌بیند؛ از JSON array خوانده می‌شود.
// مثال:
//   OLLAMA_MODELS=[
//     "copilot-free=auto",
//     "my-fusion=fusion"
//   ]
// سمت چپ "=" چیزی است که Copilot می‌بیند؛ سمت راست چیزی است که freellmapi دریافت می‌کند.
// اگر به جای "=" دو طرف یکی باشد (مثلاً "auto")، نام همان مدل استفاده می‌شود.
// شکل object هم قبول است: { "name": "copilot-free", "upstream": "auto" }
const OLLAMA_MODELS = config.getList('OLLAMA_MODELS', [DEFAULT_MODEL]);

// شمارنده برای round-robin. هر درخواست یکی جلو می‌رود.
let roundRobinCounter = 0;

// زمان فعلی را در فرمت ISO برمی‌گرداند؛ برای log و پاسخ‌های Ollama استفاده می‌شود.
const now = () => new Date().toISOString();

// اسلش‌های اضافه انتهای URL را حذف می‌کند تا آدرس‌ها تمیز ساخته شوند.
function cleanBaseURL(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/*
  سرورهای بالادست فقط از یک جا می‌آیند: آرایه‌ی `UPSTREAMS` در فایل تنظیمات.

    "UPSTREAMS": [
      { "url": "http://127.0.0.1:3001/v1", "key": "freellmapi-key-1" },
      { "name": "backup", "url": "http://127.0.0.1:3002/v1", "key": "freellmapi-key-2" }
    ]

  ترتیب اعضا همان ترتیب failover است. لایه‌ی پیکربندی، شکل‌های قدیمی
  (BASE_URLs + API_KEY یا UPSTREAMS_JSON) را یک‌بار خودش به همین آرایه تبدیل می‌کند.
*/
function parseUpstreams() {
  return config.upstreams
    .map((upstream, index) => ({
      name: upstream.name || `upstream-${index + 1}`,
      baseURL: cleanBaseURL(upstream.url),
      apiKey: String(upstream.key || ''),
      // لیست خالی یعنی این سرور همه‌ی مدل‌ها را می‌پذیرد.
      models: Array.isArray(upstream.models) ? upstream.models.map(model => String(model).trim()).filter(Boolean) : [],
    }))
    .filter(u => u.baseURL && u.apiKey);
}

// لیست upstreamهای آماده استفاده.
const UPSTREAMS = parseUpstreams();

// اگر هیچ upstream معتبری نداریم، اجرای برنامه بی‌معنی است.
if (!UPSTREAMS.length) {
  console.error(
    '❌ No valid freellmapi upstream configured. ' +
    `Add at least one { "url": "...", "key": "..." } object to "UPSTREAMS" in ${CONFIG_FILE_NAME}.`
  );
  process.exit(1);
}

// API key را برای لاگ بی‌خطر می‌کند (چند رقم آخر + طول کلید).
function maskKey(apiKey) {
  const text = String(apiKey || '');
  if (!text) return '(missing)';

  return `****${text.slice(-4)} (len=${text.length})`;
}

/*
  mapping مدل‌ها را از OLLAMA_MODELS می‌سازد.

  شکل خوانا (JSON array):
    OLLAMA_MODELS=[
      "copilot-free=auto",
      "my-fusion=fusion"
    ]
  تبدیل می‌شود به:
    { displayBase: 'copilot-free', upstream: 'auto' }

  شکل object هم پذیرفته می‌شود:
    OLLAMA_MODELS=[
      { "name": "copilot-free", "upstream": "auto" }
    ]
*/
function parseModelMappings() {
  return OLLAMA_MODELS.map(item => {
    // شکل object: {"name": "...", "upstream": "..."}
    if (item && typeof item === 'object') {
      const upstream = String(item.upstream || item.model || item.target || DEFAULT_MODEL).trim();
      const displayBase = String(item.name || item.display || item.alias || toOllamaModelName(upstream)).trim();

      return { displayBase, upstream };
    }

    // شکل رشته‌ای: "display=upstream" یا فقط "display".
    const [displayRaw, upstreamRaw] = String(item).split('=').map(s => s.trim());
    const displayBase = displayRaw || DEFAULT_MODEL;
    const upstream = upstreamRaw || displayBase.replace(/:latest$/, '');

    return { displayBase, upstream };
  });
}

// mapping مدل‌ها را یک بار هنگام شروع برنامه می‌سازیم.
const MODEL_MAPPINGS = parseModelMappings();

// headerهای CORS برای اینکه clientهای مختلف بتوانند به proxy درخواست بزنند.
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// پاسخ JSON استاندارد می‌فرستد.
function sendJSON(res, data, status = 200) {
  // status 204 یعنی No Content و نباید body داشته باشد.
  if (status === 204) {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  // headerها + Content-Type را می‌فرستیم.
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });

  // object جاوااسکریپت را به JSON string تبدیل می‌کنیم.
  res.end(JSON.stringify(data));
}

// body یک درخواست HTTP را می‌خواند.
// در Node.js body یک request به صورت stream می‌آید، نه یک‌جا.
function getBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    // هر تکه از body که رسید، به raw اضافه می‌شود.
    req.on('data', chunk => { raw += chunk; });

    // وقتی body کامل شد، تلاش می‌کنیم JSON.parse کنیم.
    req.on('end', () => {
      if (!raw) return resolve({});

      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });

    // خطای stream request.
    req.on('error', reject);
  });
}

// :latest آخر اسم مدل را حذف می‌کند.
// مثال: copilot-free:latest -> copilot-free
function stripOllamaTag(name) {
  return String(name || DEFAULT_MODEL).replace(/:latest$/, '');
}

// اسم مدل را به فرم Ollama تبدیل می‌کند.
// مثال: copilot-free -> copilot-free:latest
function toOllamaModelName(name) {
  const s = String(name || DEFAULT_MODEL);

  if (!ADD_LATEST_TAG) return s;

  return s.includes(':') ? s : `${s}:latest`;
}

// مدلی که Copilot/Visual Studio فرستاده را به مدل واقعی freellmapi تبدیل می‌کند.
// مثال: copilot-free:latest -> auto
function upstreamModelFromRequest(name) {
  const requested = String(name || '').trim();
  const requestedBase = stripOllamaTag(requested || MODEL_MAPPINGS[0]?.displayBase || DEFAULT_MODEL);

  const match = MODEL_MAPPINGS.find(m => {
    const displayWithTag = toOllamaModelName(m.displayBase);
    const displayBase = stripOllamaTag(m.displayBase);

    return requested === displayWithTag || requested === displayBase || requestedBase === displayBase;
  });

  return match?.upstream || DEFAULT_MODEL;
}

// نام مدلی که در پاسخ به client برمی‌گردد.
function requestedModelForResponse(name) {
  if (name) return name;

  return toOllamaModelName(MODEL_MAPPINGS[0]?.displayBase || DEFAULT_MODEL);
}

// گزینه‌های Ollama را به گزینه‌های OpenAI-compatible تبدیل می‌کند.
function ollamaOptionsToOpenAI(body = {}) {
  const options = body.options || {};
  const out = {};

  const temperature = body.temperature ?? options.temperature;
  const topP = body.top_p ?? options.top_p;
  const maxTokens = body.max_tokens ?? body.num_predict ?? options.num_predict;
  const stop = body.stop ?? options.stop;

  if (typeof temperature === 'number') out.temperature = temperature;
  if (typeof topP === 'number') out.top_p = topP;
  if (typeof maxTokens === 'number' && maxTokens > 0) out.max_tokens = maxTokens;
  if (Array.isArray(stop) || typeof stop === 'string') out.stop = stop;

  return out;
}

// پیام‌های دریافتی از Ollama/Copilot را برای OpenAI-compatible endpoint تمیز می‌کند.
function normalizeMessagesForOpenAI(messages = []) {
  return messages
    .map(m => {
      // role معتبر باید یکی از این‌ها باشد.
      let role = m.role || 'user';
      if (!['system', 'user', 'assistant', 'tool'].includes(role)) role = 'user';

      const out = { role };

      // فیلدهای مربوط به tool calling را حفظ می‌کنیم.
      if (m.name) out.name = m.name;
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      if (m.tool_calls) out.tool_calls = m.tool_calls;

      // حالت معمول: content متن ساده است.
      if (typeof m.content === 'string') {
        out.content = m.content;
      } else if (Array.isArray(m.content)) {
        // اگر content آرایه‌ای از blockها باشد، فعلاً فقط متن‌ها را استخراج می‌کنیم.
        out.content = m.content
          .map(p => typeof p === 'string' ? p : (p?.text || ''))
          .filter(Boolean)
          .join('\n');
      } else if (m.content == null && m.tool_calls) {
        // پیام assistant ممکن است فقط tool_calls داشته باشد و content آن null باشد.
        out.content = null;
      } else {
        // fallback: هر چیز دیگری را string می‌کنیم.
        out.content = String(m.content ?? '');
      }

      return out;
    })
    // پیام خالی حذف می‌شود، مگر اینکه tool_calls داشته باشد.
    .filter(m => m.content !== '' || m.tool_calls);
}

// آیا این status code باید روی upstream بعدی retry شود؟
function shouldRetryStatus(status) {
  return RETRY_STATUS_CODES.includes(Number(status));
}

// نام مدل را برای مقایسه یکدست می‌کند (فاصله، بزرگی حروف و :latest مهم نیست).
function normalizeModelName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/:latest$/, '');
}

// آیا این upstream مدل درخواستی را پوشش می‌دهد؟
// عضو بدون models یعنی «همه‌ی مدل‌ها». هر دو شکل نام مدل - نام upstream و نام
// نمایشی (سمت چپ OLLAMA_MODELS) - پذیرفته می‌شود.
function upstreamServesModel(upstream, model) {
  if (!upstream.models.length) return true;

  const wanted = new Set([normalizeModelName(model)]);

  for (const mapping of MODEL_MAPPINGS) {
    if (normalizeModelName(mapping.upstream) === normalizeModelName(model)) {
      wanted.add(normalizeModelName(mapping.displayBase));
    }
  }

  return upstream.models.some(entry => wanted.has(normalizeModelName(entry)));
}

// سرورهایی که مدل درخواستی را پوشش می‌دهند. اگر هیچ سروری مدلی اعلام نکرده باشد
// یا مدل ناشناخته باشد، همه‌ی سرورها برمی‌گردند تا رفتار قبلی حفظ شود.
function upstreamsForModel(model) {
  if (!model) return UPSTREAMS;
  if (!UPSTREAMS.some(upstream => upstream.models.length)) return UPSTREAMS;

  const matching = UPSTREAMS.filter(upstream => upstreamServesModel(upstream, model));

  if (matching.length) return matching;

  console.warn(`${now()} no upstream declares model=${model}; trying every upstream.`);
  return UPSTREAMS;
}

// ترتیب upstreamها برای هر درخواست را می‌سازد.
function getUpstreamOrder(model) {
  const pool = upstreamsForModel(model);

  // اگر فقط یک upstream داریم، همان را برمی‌گردانیم.
  if (pool.length <= 1) return pool;

  // حالت round-robin: هر request از upstream بعدی شروع می‌شود.
  if (UPSTREAM_STRATEGY === 'round-robin') {
    const start = roundRobinCounter++ % pool.length;
    return [...pool.slice(start), ...pool.slice(0, start)];
  }

  // حالت پیش‌فرض: همیشه از اولی شروع کن.
  return pool;
}

// یک درخواست را به upstreamها می‌فرستد.
// اگر upstream اول خطای قابل retry بدهد، روی upstream بعدی امتحان می‌کند.
async function requestUpstream(pathName, init = {}, { signal, model } = {}) {
  const order = getUpstreamOrder(model);
  let lastError = null;

  for (let i = 0; i < order.length; i++) {
    const upstream = order[i];
    const isLast = i === order.length - 1;
    const url = `${upstream.baseURL}${pathName}`;

    try {
      console.log(`${now()} upstream try: ${upstream.name} ${url}`);

      const response = await fetch(url, {
        ...init,
        signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${upstream.apiKey}`,
          ...(init.headers || {}),
        },
      });

      // اگر موفق بود، همین response را برمی‌گردانیم.
      if (response.ok) {
        console.log(`${now()} upstream ok: ${upstream.name} status=${response.status}`);
        return { response, upstream };
      }

      // اگر خطا قابل retry است و upstream بعدی داریم، body خطا را مصرف می‌کنیم و ادامه می‌دهیم.
      if (!isLast && shouldRetryStatus(response.status)) {
        const text = await response.text().catch(() => '');
        console.warn(`${now()} upstream retry: ${upstream.name} status=${response.status} body=${text.slice(0, 300)}`);
        lastError = new Error(`${upstream.name} returned ${response.status}: ${text.slice(0, 300)}`);
        continue;
      }

      // اگر قابل retry نیست یا آخرین upstream است، همان response را برمی‌گردانیم تا handler تصمیم بگیرد.
      console.warn(`${now()} upstream final non-ok: ${upstream.name} status=${response.status}`);
      return { response, upstream };
    } catch (err) {
      // خطای network یا abort یا موارد مشابه.
      lastError = err;

      if (!isLast) {
        console.warn(`${now()} upstream network retry: ${upstream.name} error=${err.message}`);
        continue;
      }

      throw new Error(`All upstreams failed. Last error from ${upstream.name}: ${err.message}`);
    }
  }

  throw lastError || new Error('All upstreams failed');
}

// درخواست chat/completions را به upstreamها می‌فرستد و اگر هیچ upstream موفق نشد خطا می‌دهد.
async function callOpenAIChatCompletions(payload, { signal } = {}) {
  const { response } = await requestUpstream('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { signal, model: payload.model });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`freellmapi returned ${response.status}: ${text.slice(0, 1000)}`);
  }

  return response;
}

// پاسخ مدل‌ها برای OpenAI-compatible clients مثل GET /v1/models.
function openAIModelList() {
  return {
    object: 'list',
    data: MODEL_MAPPINGS.map(({ displayBase }) => ({
      id: toOllamaModelName(displayBase),
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'freellmapi-proxy',
    })),
  };
}

// body درخواست OpenAI-compatible را mapping می‌کند.
// فقط model تغییر می‌کند و بقیه فیلدها حفظ می‌شوند.
function mapOpenAIRequestBody(body = {}) {
  const requestedModel = body.model || toOllamaModelName(MODEL_MAPPINGS[0]?.displayBase || DEFAULT_MODEL);
  const upstreamModel = upstreamModelFromRequest(requestedModel);

  const mapped = {
    ...body,
    model: upstreamModel,
  };

  console.log(`${now()} OpenAI model map: requested=${requestedModel} -> upstream=${upstreamModel}`);
  return { mapped, requestedModel, upstreamModel };
}

// handler برای OpenAI-compatible route: POST /v1/chat/completions و مسیرهای مشابه.
async function handleOpenAIChatCompletions(req, res) {
  const body = await getBody(req);
  const { mapped } = mapOpenAIRequestBody(body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { response: upstream } = await requestUpstream('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(mapped),
    }, { signal: controller.signal, model: mapped.model });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error(`${now()} freellmapi OpenAI endpoint error ${upstream.status}: ${text.slice(0, 500)}`);
      return sendJSON(res, {
        error: {
          message: text || `freellmapi returned ${upstream.status}`,
          type: 'upstream_error',
          code: upstream.status,
        },
      }, upstream.status);
    }

    if (mapped.stream) {
      // در حالت OpenAI-compatible، کلاینت خودش SSE اوپن‌ای‌آی می‌خواهد.
      // پس stream را تبدیل نمی‌کنیم و همان را عبور می‌دهیم.
      res.writeHead(200, {
        ...corsHeaders(),
        'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      for await (const chunk of upstream.body) {
        res.write(chunk);
      }

      return res.end();
    }

    // non-stream: پاسخ را همان‌طور که از freellmapi آمده عبور می‌دهیم.
    const text = await upstream.text();
    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    return res.end(text);
  } finally {
    clearTimeout(timer);
  }
}

// handler برای OpenAI Responses API: POST /v1/responses.
async function handleOpenAIResponses(req, res) {
  const body = await getBody(req);
  const { mapped } = mapOpenAIRequestBody(body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { response: upstream } = await requestUpstream('/responses', {
      method: 'POST',
      body: JSON.stringify(mapped),
    }, { signal: controller.signal, model: mapped.model });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return sendJSON(res, {
        error: {
          message: text || `freellmapi returned ${upstream.status}`,
          type: 'upstream_error',
          code: upstream.status,
        },
      }, upstream.status);
    }

    const headers = {
      ...corsHeaders(),
      'Content-Type': upstream.headers.get('content-type') || (mapped.stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8'),
    };

    if (mapped.stream) {
      headers['Cache-Control'] = 'no-cache';
      headers['Connection'] = 'keep-alive';
    }

    res.writeHead(200, headers);

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }

    return res.end();
  } finally {
    clearTimeout(timer);
  }
}

// payload مخصوص freellmapi را از body اولاما می‌سازد.
function createChatPayload(body) {
  const messages = normalizeMessagesForOpenAI(body.messages || []);

  const payload = {
    model: upstreamModelFromRequest(body.model),
    messages,
    stream: body.stream !== false,
    ...ollamaOptionsToOpenAI(body),
  };

  // Copilot ممکن است tools/tool_choice بفرستد. آن‌ها را حذف نمی‌کنیم.
  if (body.tools) payload.tools = body.tools;
  if (body.tool_choice) payload.tool_choice = body.tool_choice;

  console.log(`${now()} Ollama model map: requested=${body.model || '(none)'} -> upstream=${payload.model}`);
  return payload;
}

// handler اصلی Ollama chat: POST /api/chat.
async function handleChat(req, res) {
  const body = await getBody(req);
  const responseModel = requestedModelForResponse(body.model);
  const payload = createChatPayload(body);

  if (!payload.messages.length) {
    return sendJSON(res, { error: 'No messages provided' }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await callOpenAIChatCompletions(payload, { signal: controller.signal });

    if (payload.stream) {
      return await streamOpenAIToOllamaChat(upstream, res, responseModel);
    }

    const json = await upstream.json();
    const choice = json.choices?.[0] || {};
    const msg = choice.message || {};

    return sendJSON(res, {
      model: responseModel,
      created_at: now(),
      message: {
        role: 'assistant',
        content: msg.content || '',
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      },
      done: true,
      done_reason: choice.finish_reason || 'stop',
      total_duration: 0,
      load_duration: 0,
      prompt_eval_count: json.usage?.prompt_tokens || 0,
      eval_count: json.usage?.completion_tokens || 0,
    });
  } finally {
    clearTimeout(timer);
  }
}

// OpenAI SSE stream را به Ollama NDJSON برای /api/chat تبدیل می‌کند.
async function streamOpenAIToOllamaChat(upstream, res, responseModel) {
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const decoder = new TextDecoder();
  let buffer = '';
  let doneReason = 'stop';

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }

      const choice = parsed.choices?.[0] || {};
      const delta = choice.delta || {};

      if (choice.finish_reason) doneReason = choice.finish_reason;

      const content = delta.content || '';
      const toolCalls = delta.tool_calls;
      if (!content && !toolCalls) continue;

      res.write(JSON.stringify({
        model: responseModel,
        created_at: now(),
        message: {
          role: 'assistant',
          content,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        done: false,
      }) + '\n');
    }
  }

  res.write(JSON.stringify({
    model: responseModel,
    created_at: now(),
    message: { role: 'assistant', content: '' },
    done: true,
    done_reason: doneReason,
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 0,
    eval_count: 0,
  }) + '\n');

  res.end();
}

// handler اولاما generate: POST /api/generate.
async function handleGenerate(req, res) {
  const body = await getBody(req);
  const responseModel = requestedModelForResponse(body.model);

  const payload = {
    model: upstreamModelFromRequest(body.model),
    messages: [{ role: 'user', content: body.prompt || '' }],
    stream: body.stream !== false,
    ...ollamaOptionsToOpenAI(body),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await callOpenAIChatCompletions(payload, { signal: controller.signal });

    if (payload.stream) {
      return await streamOpenAIToOllamaGenerate(upstream, res, responseModel);
    }

    const json = await upstream.json();
    const choice = json.choices?.[0] || {};
    const content = choice.message?.content || '';

    return sendJSON(res, {
      model: responseModel,
      created_at: now(),
      response: content,
      done: true,
      done_reason: choice.finish_reason || 'stop',
      total_duration: 0,
      load_duration: 0,
      prompt_eval_count: json.usage?.prompt_tokens || 0,
      eval_count: json.usage?.completion_tokens || 0,
    });
  } finally {
    clearTimeout(timer);
  }
}

// OpenAI SSE stream را به Ollama NDJSON برای /api/generate تبدیل می‌کند.
async function streamOpenAIToOllamaGenerate(upstream, res, responseModel) {
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const decoder = new TextDecoder();
  let buffer = '';
  let doneReason = 'stop';

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }

      const choice = parsed.choices?.[0] || {};
      const delta = choice.delta?.content || '';

      if (choice.finish_reason) doneReason = choice.finish_reason;
      if (!delta) continue;

      res.write(JSON.stringify({
        model: responseModel,
        created_at: now(),
        response: delta,
        done: false,
      }) + '\n');
    }
  }

  res.write(JSON.stringify({
    model: responseModel,
    created_at: now(),
    response: '',
    done: true,
    done_reason: doneReason,
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 0,
    eval_count: 0,
  }) + '\n');

  res.end();
}

// اطلاعات ظاهری مدل برای سازگاری با Ollama.
function modelDetails() {
  return {
    parent_model: '',
    format: 'gguf',
    family: 'llama',
    families: ['llama'],
    parameter_size: 'unknown',
    quantization_level: 'unknown',
  };
}

// لیست مدل‌هایی که /api/tags برمی‌گرداند.
function modelList() {
  return MODEL_MAPPINGS.map(({ displayBase }) => {
    const name = toOllamaModelName(displayBase);
    const digest = Buffer.from(name).toString('hex').slice(0, 64).padEnd(64, '0');

    return {
      name,
      model: name,
      modified_at: now(),
      size: 1000000000,
      digest: `sha256:${digest}`,
      details: modelDetails(),
    };
  });
}

// پاسخ /api/show برای Ollama-compatible clients.
function showModel(name) {
  const ollamaName = toOllamaModelName(stripOllamaTag(name || MODEL_MAPPINGS[0]?.displayBase || DEFAULT_MODEL));

  return {
    license: 'proxy',
    modelfile: `FROM ${ollamaName}`,
    parameters: '',
    template: '{{ .Prompt }}',
    details: modelDetails(),
    model_info: {
      'general.architecture': 'llama',
      'llama.context_length': 131072,
      'llama.embedding_length': 4096,
    },
    // Copilot گاهی capabilities را چک می‌کند؛ tools را نگه می‌داریم.
    capabilities: ['completion', 'tools'],
  };
}

// HTTP server اصلی.
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const route = `${req.method} ${pathname}`;

  console.log(`${now()} ${route}`);

  // پاسخ به preflight CORS.
  if (req.method === 'OPTIONS') return sendJSON(res, {}, 204);

  try {
    // تست ساده سلامت.
    if (route === 'GET /') return res.end('Ollama is running');

    // route نسخه اولاما.
    if (route === 'GET /api/version') return sendJSON(res, { version: '0.5.0' });

    // OpenAI-compatible model list.
    if (route === 'GET /v1/models' || route === 'GET /models') {
      return sendJSON(res, openAIModelList());
    }

    // OpenAI-compatible chat completions.
    if (
      route === 'POST /v1/chat/completions' ||
      route === 'POST /chat/completions' ||
      route === 'POST /api/chat/completions' ||
      route === 'POST /api/v1/chat/completions'
    ) {
      return await handleOpenAIChatCompletions(req, res);
    }

    // OpenAI-compatible responses API.
    if (
      route === 'POST /v1/responses' ||
      route === 'POST /responses' ||
      route === 'POST /api/responses' ||
      route === 'POST /api/v1/responses'
    ) {
      return await handleOpenAIResponses(req, res);
    }

    // Ollama model list.
    if (route === 'GET /api/tags') return sendJSON(res, { models: modelList() });
    if (route === 'POST /api/tags') return sendJSON(res, { models: modelList() });

    // Ollama process list؛ برای سازگاری خالی برمی‌گردانیم.
    if (route === 'GET /api/ps') return sendJSON(res, { models: [] });

    // Ollama model show.
    if (route === 'POST /api/show') {
      const body = await getBody(req);
      return sendJSON(res, showModel(body.model || body.name));
    }

    // Ollama chat.
    if (route === 'POST /api/chat') return await handleChat(req, res);

    // Ollama generate.
    if (route === 'POST /api/generate') return await handleGenerate(req, res);

    // اگر هیچ route‌ای match نشد.
    return sendJSON(res, { error: `not found: ${pathname}` }, 404);
  } catch (err) {
    console.error(err);

    // اگر هنوز header ارسال نشده، خطای JSON برگردان.
    if (!res.headersSent) {
      return sendJSON(res, { error: err.message || 'Internal server error' }, 500);
    }

    // اگر stream شروع شده باشد، فقط response را ببند.
    res.end();
  }
});

// server را روشن می‌کنیم.
server.listen(PORT, HOST, () => {
  console.log(`🦅 ${PROJECT_NAME} listening on http://${HOST}:${PORT} (Ollama + OpenAI compatible)`);
  console.log(`🤖 Upstream default model: ${DEFAULT_MODEL}`);
  console.log(`📋 Exposed models: ${modelList().map(m => m.name).join(', ')}`);
  console.log(`🧭 Model mappings: ${MODEL_MAPPINGS.map(m => `${toOllamaModelName(m.displayBase)} -> ${m.upstream}`).join(', ')}`);
  console.log(`🔁 Upstream strategy: ${UPSTREAM_STRATEGY}`);
  console.log(
    `🌐 Upstreams: ${UPSTREAMS.map(u => `${u.name}=${u.baseURL} key=${maskKey(u.apiKey)} models=${u.models.length ? u.models.join(',') : '*'}`).join(' | ')}`
  );
});

// خاموش کردن تمیز با Ctrl+C یا signalهای سیستم.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}, shutting down...`);
    server.close(() => process.exit(0));
  });
}
