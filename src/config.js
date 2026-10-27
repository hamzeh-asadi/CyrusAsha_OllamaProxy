/*
  CyrusAsha_OllamaProxy — configuration layer
  -------------------------------------------
  این فایل تنظیمات پروژه را از دو منبع می‌خواند و آن‌ها را با هم یکی می‌کند:

    1) .env                                → سبک کلاسیک dotenv
    2) CyrusAsha_OllamaProxy.config.json   → سبک JSON

  قاعده همگام‌سازی (config sync):
  - هربار که برنامه اجرا می‌شود، هر دو فایل خوانده می‌شوند.
  - هر کلیدی که در یکی از دو فایل تغییر کرده باشد، روی فایل دیگر هم اعمال می‌شود؛
    یعنی «آخرین تغییر» برنده است و نتیجه روی هر دو فایل نوشته می‌شود.
  - اگر یک کلید در هر دو فایل و با دو مقدار متفاوت تغییر کرده باشد، فایلی که
    دیرتر ذخیره شده است (mtime جدیدتر) برنده می‌شود و یک هشدار چاپ می‌شود.
  - آخرین وضعیت همگام‌شده در فایل .config-sync.json نگه داشته می‌شود تا تشخیص
    «کدام فایل عوض شده» دقیق باشد. اگر این فایل نباشد، از mtime استفاده می‌شود.
  - کامنت‌ها و ترتیب خطوط فایل .env تا حد امکان حفظ می‌شوند.
  - متغیرهای محیطی شل (process.env) همیشه بر مقدار فایل‌ها اولویت دارند.
  - با CONFIG_SYNC=off می‌توان نوشتن روی فایل‌ها را خاموش کرد (فقط خواندن).
*/

// ماژول فایل و مسیر در Node.js.
import fs from 'node:fs';
import path from 'node:path';

// برای پیدا کردن مسیر خود فایل و در نتیجه ریشه پروژه.
import { fileURLToPath } from 'node:url';

// dotenv برای خواندن استاندارد فایل .env استفاده می‌شود.
import dotenv from 'dotenv';

// مسیر پوشه src و ریشه پروژه.
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, '..');

// نام رسمی پروژه و نام فایل‌های پیکربندی.
export const PROJECT_NAME = 'CyrusAsha_OllamaProxy';
export const ENV_FILE_NAME = '.env';
export const CONFIG_JSON_FILE_NAME = `${PROJECT_NAME}.config.json`;

// فایل داخلی وضعیت همگام‌سازی (نباید commit شود).
export const SYNC_STATE_FILE_NAME = '.config-sync.json';

// ترتیب استاندارد کلیدها در خروجی‌ها. کلیدهای ناشناخته بعد از این‌ها و به ترتیب الفبا می‌آیند.
const CANONICAL_KEY_ORDER = [
  'PORT',
  'HOST',
  'FREELLMAPI_BASE_URL',
  'FREELLMAPI_API_KEY',
  'FREELLMAPI_BASE_URLS',
  'FREELLMAPI_API_KEYS',
  'FREELLMAPI_UPSTREAMS_JSON',
  'UPSTREAM_STRATEGY',
  'RETRY_STATUS_CODES',
  'DEFAULT_MODEL',
  'OLLAMA_MODELS',
  'ADD_LATEST_TAG',
  'REQUEST_TIMEOUT_MS',
];

// کلیدهایی که در JSON به شکل ساختار واقعی (array/object) نگه داشته می‌شوند.
// بقیه کلیدها همیشه string هستند تا هر دو فایل یک‌به‌یک معادل هم بمانند.
const STRUCTURED_JSON_KEYS = new Set(['FREELLMAPI_UPSTREAMS_JSON']);

// ---------------------------------------------------------------------------
// ابزارهای کمکی
// ---------------------------------------------------------------------------

// متن فایل را می‌خواند و اگر فایل وجود نداشت null برمی‌گرداند.
function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// زمان آخرین تغییر فایل به میلی‌ثانیه؛ اگر فایل نباشد صفر.
function mtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// BOM ابتدای فایل را حذف می‌کند (فایل‌های ویندوزی معمولاً BOM دارند).
function stripBom(text) {
  return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// یک مقدار JSON را به همان شکل string ای تبدیل می‌کند که در .env می‌نشیند.
function jsonValueToEnvString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// متن JSON یک کلید ساختاری را می‌خواند.
// نکته: dotenv هنگام خواندن، \" را به " برنمی‌گرداند؛ پس هر دو حالت
// (JSON تمیز و سبک قدیمی escape-شده) پذیرفته می‌شود.
function parseStructuredJson(text) {
  const candidates = [text, text.replace(/\\"/g, '"').replace(/\\\\/g, '\\')];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // حالت بعدی را امتحان می‌کنیم.
    }
  }

  return null;
}

// شکل یکسان‌سازی‌شده مقدار برای مقایسه و برای ذخیره در فایل وضعیت.
// برای کلیدهای ساختاری (مثل FREELLMAPI_UPSTREAMS_JSON) فاصله‌های اضافه JSON حذف می‌شود
// تا دو فایل با یک ساختار ولی فاصله‌گذاری متفاوت، «متفاوت» حساب نشوند.
function canonicalEnvValue(key, value) {
  const text = String(value ?? '');
  if (STRUCTURED_JSON_KEYS.has(key) && /^\s*[[{]/.test(text)) {
    const parsed = parseStructuredJson(text);
    if (parsed !== null) return JSON.stringify(parsed);
  }
  return text;
}

// مقدار string ای را به مقدار مناسب JSON برمی‌گرداند.
function envStringToJsonValue(key, value) {
  const text = String(value ?? '');
  if (STRUCTURED_JSON_KEYS.has(key) && /^\s*[[{]/.test(text)) {
    const parsed = parseStructuredJson(text);
    if (parsed !== null) return parsed;
  }
  return text;
}

// مقدار را برای نوشتن در .env کدگذاری می‌کند.
// نکته مهم: dotenv هنگام خواندن فقط \n و \r را برمی‌گرداند و \" را برنمی‌گرداند؛
// پس از escape داخل quote استفاده نمی‌کنیم و نوع quote را طوری انتخاب می‌کنیم که
// مقدار دقیقاً همان‌طور که هست خوانده شود (وگرنه هر اجرا یک backslash اضافه می‌شد).
function encodeEnvValue(value) {
  const text = String(value ?? '');
  if (text === '') return '';
  if (!/[\s#'"`\\]/.test(text)) return text;

  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  if (!text.includes('`')) return `\`${text}\``;

  // حالت بسیار نادر: مقدار هر دو نوع quote را دارد.
  return `"${text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

// کامنت انتهای خط .env را یکدست می‌کند.
function formatComment(comment) {
  const body = String(comment || '').replace(/^#\s*/, '').trim();
  return body ? ` # ${body}` : '';
}

// یک خط .env را به «پیشوند» (مثل `KEY=`) و «کامنت انتهای خط» تقسیم می‌کند
// تا هنگام تغییر مقدار، کامنت حفظ شود.
function splitEnvLine(line) {
  const match = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.]*\s*=\s*)([\s\S]*)$/.exec(line);
  if (!match) return null;

  const prefix = match[1];
  const rawValue = match[2];
  const trimmed = rawValue.trimStart();
  let comment = '';

  if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('`')) {
    // مقدار داخل quote: تا quote بسته جلو می‌رویم.
    const quote = trimmed[0];
    let index = 1;
    while (index < trimmed.length) {
      if (quote === '"' && trimmed[index] === '\\') {
        index += 2;
        continue;
      }
      if (trimmed[index] === quote) break;
      index += 1;
    }
    const commentMatch = /^\s*(#.*)$/.exec(trimmed.slice(index + 1));
    if (commentMatch) comment = formatComment(commentMatch[1]);
  } else {
    // مقدار بدون quote: کامنت با «فاصله + #» شروع می‌شود.
    const commentMatch = /\s(#.*)$/.exec(rawValue);
    if (commentMatch) comment = formatComment(commentMatch[1]);
  }

  return { prefix, comment };
}

// ترتیب نهایی کلیدها.
function orderKeys(keys) {
  const known = CANONICAL_KEY_ORDER.filter(key => keys.includes(key));
  const unknown = keys.filter(key => !CANONICAL_KEY_ORDER.includes(key)).sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}

// ---------------------------------------------------------------------------
// خواندن فایل‌ها
// ---------------------------------------------------------------------------

// خواندن .env و تبدیل به map «کلید → مقدار string».
function parseEnvText(text) {
  if (text == null) return null;

  const parsed = dotenv.parse(stripBom(text));
  const values = {};

  for (const [key, value] of Object.entries(parsed)) {
    values[key] = canonicalEnvValue(key, value);
  }

  return values;
}

// خواندن فایل JSON پیکربندی. کلیدهای شروع‌شده با $ فقط متا هستند و sync نمی‌شوند.
function parseConfigJsonText(text) {
  if (text == null) return null;

  const trimmed = stripBom(text).trim();
  const values = {};
  if (!trimmed) return values;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `${CONFIG_JSON_FILE_NAME} is not valid JSON (${err.message}). ` +
      `Fix it or delete it so it can be rebuilt from ${ENV_FILE_NAME}.`
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${CONFIG_JSON_FILE_NAME} must contain a JSON object of "KEY": "value" pairs.`);
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('$')) continue;
    values[key] = canonicalEnvValue(key, jsonValueToEnvString(value));
  }

  return values;
}

// کلیدهای متا (مثل $comment) که فقط در فایل JSON می‌مانند.
function readJsonMetaKeys(text) {
  if (text == null) return {};

  try {
    const parsed = JSON.parse(stripBom(text).trim() || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const meta = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith('$')) meta[key] = value;
    }
    return meta;
  } catch {
    return {};
  }
}

// خواندن وضعیت آخرین همگام‌سازی.
function readStateValues(file) {
  const text = readTextIfExists(file);
  if (text == null) return null;

  try {
    const parsed = JSON.parse(stripBom(text).trim() || '{}');
    const values = parsed?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;

    const out = {};
    for (const [key, value] of Object.entries(values)) {
      out[key] = canonicalEnvValue(key, jsonValueToEnvString(value));
    }
    return out;
  } catch {
    // فایل وضعیت اگر خراب باشد، مهم نیست؛ از mtime استفاده می‌شود.
    return null;
  }
}

// ---------------------------------------------------------------------------
// نوشتن فایل‌ها
// ---------------------------------------------------------------------------

// ساخت متن کامل .env با اعمال تغییرات روی متن فعلی.
// مقادیر undefined یعنی «این کلید حذف شده است».
function serializeEnvFile(existingText, unified) {
  const deleting = new Set(
    Object.entries(unified).filter(([, value]) => value === undefined).map(([key]) => key)
  );
  const pending = new Map(Object.entries(unified).filter(([, value]) => value !== undefined));
  const replaced = new Set();
  const out = [];

  const lines = existingText == null ? [] : stripBom(existingText).split(/\r?\n/);

  for (const line of lines) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=/.exec(line);

    if (!match) {
      out.push(line);
      continue;
    }

    const key = match[1];

    // کلید حذف‌شده: همه خطوط مربوط به آن حذف می‌شوند.
    if (deleting.has(key)) continue;

    if (!pending.has(key) || replaced.has(key)) {
      out.push(line);
      continue;
    }

    const value = pending.get(key);
    pending.delete(key);
    replaced.add(key);

    const parts = splitEnvLine(line);
    out.push(parts ? `${parts.prefix}${encodeEnvValue(value)}${parts.comment}` : `${key}=${encodeEnvValue(value)}`);
  }

  // اول خطوط خالی انتهای فایل حذف می‌شوند، بعد کلیدهای جدید اضافه می‌شوند.
  while (out.length && out[out.length - 1].trim() === '') out.pop();

  for (const key of orderKeys([...pending.keys()])) {
    out.push(`${key}=${encodeEnvValue(pending.get(key))}`);
  }

  return `${out.join('\n')}\n`;
}

// ساخت متن کامل فایل JSON.
function serializeJsonFile(values, metaKeys) {
  const out = { ...metaKeys };

  for (const key of orderKeys(Object.keys(values))) {
    out[key] = envStringToJsonValue(key, values[key]);
  }

  return `${JSON.stringify(out, null, 2)}\n`;
}

// نوشتن فایل وضعیت همگام‌سازی.
function writeStateFile(file, values) {
  const payload = {
    $comment: `Managed by ${PROJECT_NAME} config sync. Safe to delete; it is rebuilt on the next run.`,
    syncedAt: new Date().toISOString(),
    values: {},
  };

  for (const key of orderKeys(Object.keys(values))) {
    payload.values[key] = envStringToJsonValue(key, values[key]);
  }

  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

// فقط زمانی فایل را می‌نویسد که محتوا واقعاً تغییر کرده باشد
// (تا mtime فایل‌ها بی‌دلیل عوض نشود).
function writeIfChanged(file, nextText) {
  const current = readTextIfExists(file);
  if (current != null && current === nextText) return false;

  fs.writeFileSync(file, nextText, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// هسته همگام‌سازی
// ---------------------------------------------------------------------------

// ترکیب مقادیر دو فایل با اولویت «آخرین تغییر».
function mergeConfigValues({ envValues, jsonValues, lastValues, envNewer, conflicts }) {
  const unified = {};
  const keys = new Set([
    ...Object.keys(envValues),
    ...Object.keys(jsonValues),
    ...(lastValues ? Object.keys(lastValues) : []),
  ]);

  for (const key of keys) {
    const inEnv = Object.prototype.hasOwnProperty.call(envValues, key);
    const inJson = Object.prototype.hasOwnProperty.call(jsonValues, key);
    const envValue = inEnv ? envValues[key] : undefined;
    const jsonValue = inJson ? jsonValues[key] : undefined;

    // هر دو فایل یکسان‌اند.
    if (inEnv && inJson && envValue === jsonValue) {
      unified[key] = envValue;
      continue;
    }

    // در هیچ‌کدام نیست؛ یعنی از هر دو فایل حذف شده است.
    if (!inEnv && !inJson) continue;

    let winner;

    if (lastValues && Object.prototype.hasOwnProperty.call(lastValues, key)) {
      const base = lastValues[key];
      const envChanged = envValue !== base;
      const jsonChanged = jsonValue !== base;

      if (envChanged && !jsonChanged) {
        winner = 'env';
      } else if (jsonChanged && !envChanged) {
        winner = 'json';
      } else if (envChanged && jsonChanged) {
        // هر دو عوض شده‌اند: جدیدترین فایل برنده است.
        winner = envNewer ? 'env' : 'json';
        conflicts.push({ key, winner, reason: 'changed-in-both-files' });
      } else {
        winner = envNewer ? 'env' : 'json';
      }
    } else if (inEnv && inJson) {
      // سابقه‌ای از مقدار قبلی نداریم؛ جدیدترین فایل برنده است.
      winner = envNewer ? 'env' : 'json';
      conflicts.push({ key, winner, reason: 'no-sync-history' });
    } else {
      // کلید فقط در یکی از دو فایل وجود دارد؛ همان به دیگری اضافه می‌شود.
      winner = inEnv ? 'env' : 'json';
    }

    // ممکن است مقدار undefined باشد؛ یعنی حذف کلید اعمال می‌شود.
    unified[key] = winner === 'env' ? envValue : jsonValue;
  }

  return unified;
}

/*
  همگام‌سازی .env و CyrusAsha_OllamaProxy.config.json.

  خروجی:
    values    → مقادیر نهایی (map «کلید → مقدار»)
    files     → مسیر فایل‌ها
    source    → منبع نهایی: 'merged' | 'env' | 'json' | 'none'
    wrote     → فایل‌هایی که در این اجرا نوشته شدند
    conflicts → کلیدهایی که در هر دو فایل تغییر کرده بودند
*/
export function synchronizeConfigFiles({ baseDir = PROJECT_ROOT, enabled = true } = {}) {
  const files = {
    env: path.join(baseDir, ENV_FILE_NAME),
    json: path.join(baseDir, CONFIG_JSON_FILE_NAME),
    state: path.join(baseDir, SYNC_STATE_FILE_NAME),
  };

  const envText = readTextIfExists(files.env);
  const jsonText = readTextIfExists(files.json);

  const envValues = parseEnvText(envText);
  const jsonValues = parseConfigJsonText(jsonText);

  // هیچ فایلی نیست: همه چیز از متغیرهای محیطی و مقدارهای پیش‌فرض می‌آید.
  if (envValues == null && jsonValues == null) {
    return { values: {}, files, source: 'none', wrote: [], conflicts: [] };
  }

  const bothExist = envValues != null && jsonValues != null;
  const conflicts = [];
  let unified;

  if (!bothExist) {
    // فقط یکی از فایل‌ها هست؛ همان منبع حقیقت است و دیگری از آن ساخته می‌شود.
    unified = { ...(envValues || jsonValues) };
  } else {
    const lastValues = readStateValues(files.state);
    const envNewer = mtimeMs(files.env) >= mtimeMs(files.json);

    unified = mergeConfigValues({ envValues, jsonValues, lastValues, envNewer, conflicts });
  }

  const values = {};
  for (const [key, value] of Object.entries(unified)) {
    if (value !== undefined) values[key] = value;
  }

  const wrote = [];

  if (enabled) {
    if (writeIfChanged(files.env, serializeEnvFile(envText, unified))) wrote.push(files.env);
    if (writeIfChanged(files.json, serializeJsonFile(values, readJsonMetaKeys(jsonText)))) wrote.push(files.json);
    writeStateFile(files.state, values);
  }

  const source = bothExist ? 'merged' : envValues != null ? 'env' : 'json';

  return { values, files, source, wrote, conflicts };
}

// ---------------------------------------------------------------------------
// بارگذاری پیکربندی برای برنامه
// ---------------------------------------------------------------------------

/*
  پیکربندی نهایی برنامه را می‌سازد:
    1) فایل‌های .env و JSON همگام می‌شوند.
    2) متغیرهای محیطی شل روی مقدار فایل‌ها می‌نشینند.

  با CONFIG_SYNC=off نوشتن روی فایل‌ها خاموش می‌شود و فقط خواندن انجام می‌گیرد.
*/
export function loadConfig({ baseDir, sync } = {}) {
  const resolvedBaseDir = baseDir
    ? path.resolve(baseDir)
    : process.env.CYRUSASHA_CONFIG_DIR
      ? path.resolve(process.env.CYRUSASHA_CONFIG_DIR)
      : PROJECT_ROOT;

  const syncEnabled = sync === undefined
    ? String(process.env.CONFIG_SYNC || 'on').toLowerCase() !== 'off'
    : Boolean(sync);

  const result = synchronizeConfigFiles({ baseDir: resolvedBaseDir, enabled: syncEnabled });

  // مقادیر فایل‌ها.
  const values = { ...result.values };

  // متغیرهای محیطی شل اولویت دارند (چه کلید در فایل باشد چه نباشد).
  for (const key of new Set([...Object.keys(values), ...CANONICAL_KEY_ORDER])) {
    if (process.env[key] !== undefined) values[key] = canonicalEnvValue(key, process.env[key]);
  }

  return {
    // مقادیر خام.
    values,

    // اطلاعات همگام‌سازی برای لاگ و عیب‌یابی.
    source: result.source,
    files: result.files,
    wrote: result.wrote,
    conflicts: result.conflicts,
    syncEnabled,
    envFileName: ENV_FILE_NAME,
    jsonFileName: CONFIG_JSON_FILE_NAME,

    // مقدار متنی؛ اگر خالی باشد مقدار پیش‌فرض برگردانده می‌شود.
    get(key, fallback = undefined) {
      const value = values[key];
      return value === undefined || String(value).trim() === '' ? fallback : value;
    },

    // مقدار عددی.
    getNumber(key, fallback = undefined) {
      const value = values[key];
      if (value === undefined || String(value).trim() === '') return fallback;

      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    },

    // مقدار بولی؛ مقادیر false/0/no/off مساوی false هستند.
    getBool(key, fallback = false) {
      const value = values[key];
      if (value === undefined || String(value).trim() === '') return fallback;

      return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
    },

    // مقدار CSV به شکل آرایه. مثال: "a,b,c" → ['a', 'b', 'c']
    getCSV(key, fallback = []) {
      const list = String(values[key] ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      return list.length ? list : fallback;
    },
  };
}
