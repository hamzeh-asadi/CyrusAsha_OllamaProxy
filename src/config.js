/*
  CyrusAsha_OllamaProxy — configuration layer
  -------------------------------------------
  تنها منبع تنظیمات این پروژه یک فایل JSON است:

      CyrusAsha_OllamaProxy.config.json

  چرا فقط JSON؟
  - فایل `.env` حذف شد. همان مشکل قبلی (نوشتن آرایه‌های بلند در یک خط و
    همگام‌سازی دوطرفه) از همین‌جا می‌آمد؛ با یک فایل، یک منبع حقیقت داریم و
    دیگر هیچ نوشتنی روی فایل دیگر لازم نیست.
  - مقدارها همان نوع طبیعی خودشان را دارند: عدد، بولی و array واقعی.

  شکل ساده‌ی فایل:

      {
        "PORT": 11434,
        "UPSTREAMS": [
          { "url": "http://127.0.0.1:3001/v1", "key": "freellmapi-key-1" }
        ],
        "OLLAMA_MODELS": [
          "FreeLlmApiAuto=auto",
          "AutoAllGlm=auto:all-glm"
        ]
      }

  فقط یک راه برای تعریف سرورها وجود دارد: آرایه‌ی `UPSTREAMS` که هر عضو آن
  یک آبجکت `{ "url": ... , "key": ... }` است (و در صورت نیاز `"name"`).
  ترتیب اعضا، ترتیب failover هم هست.

  سازگاری با نسخه‌های قبلی (یک‌بار و خودکار):
  - `UPSTREAMS_JSON`              → `UPSTREAMS`
  - `BASE_URLs` + `API_KEY`       → `UPSTREAMS` (جفت‌سازی بر پایه ایندکس)
  - نام‌های قدیمی `FREELLMAPI_*`  → همان `UPSTREAMS`
  - اگر فایل JSON وجود نداشته باشد ولی `.env` قدیمی موجود باشد، یک‌بار خوانده
    و به JSON منتقل می‌شود و بعد `.env` به `.env.imported` تغییر نام می‌دهد.
  - مقدارهای شل (`process.env`) همیشه بر فایل اولویت دارند و روی دیسک نوشته
    نمی‌شوند.
  - با `CONFIG_SYNC=off` هیچ نوشتنی روی فایل انجام نمی‌شود (فقط خواندن).
*/

// ماژول فایل و مسیر در Node.js.
import fs from 'node:fs';
import path from 'node:path';

// برای پیدا کردن مسیر خود فایل و در نتیجه ریشه پروژه.
import { fileURLToPath } from 'node:url';

// dotenv فقط برای خواندن یک‌باره‌ی فایل قدیمی `.env` هنگام مهاجرت استفاده می‌شود.
import dotenv from 'dotenv';

// مسیر پوشه src و ریشه پروژه.
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, '..');

// نام رسمی پروژه و نام فایل تنظیمات.
export const PROJECT_NAME = 'CyrusAsha_OllamaProxy';
export const CONFIG_FILE_NAME = `${PROJECT_NAME}.config.json`;

// فایل قدیمی که دیگر خوانده نمی‌شود؛ فقط برای مهاجرت یک‌باره.
export const LEGACY_ENV_FILE_NAME = '.env';
export const LEGACY_ENV_IMPORTED_FILE_NAME = '.env.imported';

// ترتیب نمایش کلیدها در فایل JSON.
const CANONICAL_KEY_ORDER = [
  'PORT',
  'HOST',
  'UPSTREAMS',
  'UPSTREAM_STRATEGY',
  'RETRY_STATUS_CODES',
  'DEFAULT_MODEL',
  'OLLAMA_MODELS',
  'ADD_LATEST_TAG',
  'REQUEST_TIMEOUT_MS',
];

// مقدارهای پیش‌فرض. هر کلیدی که در فایل نباشد از این‌جا خوانده می‌شود.
const DEFAULTS = {
  PORT: 11434,
  HOST: '127.0.0.1',
  UPSTREAMS: [],
  UPSTREAM_STRATEGY: 'ordered',
  RETRY_STATUS_CODES: [401, 403, 404, 408, 409, 429, 500, 502, 503, 504],
  DEFAULT_MODEL: 'auto',
  OLLAMA_MODELS: ['auto'],
  ADD_LATEST_TAG: true,
  REQUEST_TIMEOUT_MS: 120000,
};

// اگر فایل تنظیمات وجود نداشت، با همین کلیدها ساخته می‌شود تا فایل کوتاه و
// خوانا بماند؛ بقیه‌ی کلیدها از DEFAULTS می‌آیند.
const STARTER_KEYS = ['PORT', 'HOST', 'UPSTREAMS', 'DEFAULT_MODEL', 'OLLAMA_MODELS'];

// کلیدهایی که مقدارشان آرایه است.
const LIST_KEYS = new Set(['UPSTREAMS', 'OLLAMA_MODELS', 'RETRY_STATUS_CODES']);

// کلیدهای عددی و بولی، تا در فایل JSON هم نوع طبیعی خودشان را داشته باشند.
const NUMBER_KEYS = new Set(['PORT', 'REQUEST_TIMEOUT_MS']);
const BOOLEAN_KEYS = new Set(['ADD_LATEST_TAG']);

// کلیدهای نسخه‌های قبلی که هنگام خواندن به `UPSTREAMS` تبدیل و از فایل حذف می‌شوند.
const LEGACY_UPSTREAM_KEYS = [
  'UPSTREAMS_JSON',
  'BASE_URLs',
  'BASE_URL',
  'API_KEY',
  'API_KEYS',
  'FREELLMAPI_BASE_URL',
  'FREELLMAPI_BASE_URLS',
  'FREELLMAPI_API_KEY',
  'FREELLMAPI_API_KEYS',
  'FREELLMAPI_UPSTREAMS_JSON',
];

// نام‌های قدیمی و معادل جدیدشان (هم در فایل و هم در متغیرهای شل).
const LEGACY_ALIASES = {
  FREELLMAPI_BASE_URL: 'BASE_URLs',
  FREELLMAPI_BASE_URLS: 'BASE_URLs',
  BASE_URL: 'BASE_URLs',
  FREELLMAPI_API_KEY: 'API_KEY',
  FREELLMAPI_API_KEYS: 'API_KEY',
  API_KEYS: 'API_KEY',
  FREELLMAPI_UPSTREAMS_JSON: 'UPSTREAMS_JSON',
};

// توضیح ثابتی که بالای فایل تنظیمات نوشته می‌شود.
const CONFIG_COMMENT =
  'CyrusAsha_OllamaProxy settings (the only config file). ' +
  'One object per upstream: { "url": "http://host:port/v1", "key": "your-key" }; ' +
  'optional "models": ["..."] limits a server to those models, optional "name" labels it in logs. ' +
  'List order is the failover order. Restart the proxy after editing.';

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

// BOM ابتدای فایل را حذف می‌کند (فایل‌های ویندوزی معمولاً BOM دارند).
function stripBom(text) {
  return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// آدرس سرور را تمیز می‌کند: فاصله‌های اضافه و اسلش‌های انتهایی حذف می‌شوند.
function cleanUrl(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

// اگر متن JSON باشد آن را تجزیه می‌کند؛ در غیر این صورت همان متن را برمی‌گرداند.
function parseMaybeJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || (trimmed[0] !== '[' && trimmed[0] !== '{')) return text;

  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

// یک مقدار را به آرایه تبدیل می‌کند (آرایه، CSV یا مقدار تکی).
function toList(value) {
  if (value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return value
      .map(item => (item && typeof item === 'object' ? item : String(item).trim()))
      .filter(item => item !== '' && !(typeof item === 'string' && item.length === 0));
  }

  if (typeof value === 'object') return [value];

  const text = String(value).trim();
  if (!text) return [];

  const parsed = parseMaybeJson(text);
  if (Array.isArray(parsed)) return parsed;

  return text.split(',').map(item => item.trim()).filter(Boolean);
}

// یک عضو آرایه‌ی UPSTREAMS را به شکل استاندارد `{ name?, url, key, models? }`
// درمی‌آورد. نام‌های دیگری که کاربران ممکن است بنویسند هم پذیرفته می‌شوند.
function normalizeUpstream(item) {
  const source = item && typeof item === 'object' ? item : { url: item };

  const out = {};

  // نام اختیاری است و فقط وقتی نوشته می‌شود که کاربر خودش داده باشد.
  const name = String(source.name ?? '').trim();
  if (name) out.name = name;

  out.url = cleanUrl(
    source.url ?? source.baseURL ?? source.baseUrl ?? source.base_url ?? source.endpoint ?? ''
  );

  out.key = String(
    source.key ?? source.apiKey ?? source.api_key ?? source.token ?? source.accessKey ?? ''
  ).trim();

  // مدل‌های مجاز این سرور: اگر خالی باشد یعنی همه‌ی مدل‌ها مجازند.
  const models = toList(source.models ?? source.model).map(entry => String(entry).trim()).filter(Boolean);
  if (models.length) out.models = models;

  return out.url || out.key ? out : null;
}

// آرایه‌ی سرورها را یکدست می‌کند و عضوهای خالی را حذف می‌کند.
function normalizeUpstreams(raw) {
  return toList(raw).map(item => normalizeUpstream(item)).filter(Boolean);
}

// آدرس‌ها و کلیدها را بر پایه ایندکس جفت می‌کند (سازگاری با نسخه‌ی قبلی).
function pairUrlsAndKeys(urlsRaw, keysRaw) {
  const urls = toList(urlsRaw).map(item => (typeof item === 'object' ? item.url || '' : String(item)));
  const keys = toList(keysRaw).map(item => (typeof item === 'object' ? item.key || '' : String(item)));

  const count = Math.max(urls.length, keys.length);

  return Array.from({ length: count }, (_, index) => ({
    url: urls[index] || urls[0] || '',
    key: keys[index] || keys[0] || '',
  }));
}

// کلیدهای متایی که با `$` شروع می‌شوند (مثل $comment) فقط در فایل می‌مانند.
const META_KEYS = new Set(['$comment', '$comment_fa']);

// فایل JSON تنظیمات را می‌خواند. اگر JSON نامعتبر باشد، با نام فایل خطا می‌دهد.
// کلیدهای متا (مثل $comment) خوانده نمی‌شوند و هنگام نوشتن دوباره ساخته می‌شوند.
function parseConfigJsonText(text) {
  const trimmed = stripBom(text).trim();
  if (!trimmed) return {};

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`${CONFIG_FILE_NAME} is not valid JSON (${err.message}). Fix it and start again.`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${CONFIG_FILE_NAME} must contain one JSON object of "KEY": value pairs.`);
  }

  const values = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!META_KEYS.has(key)) values[key] = value;
  }

  return values;
}

// متن کامل فایل JSON را می‌سازد (توضیح کوتاه بالای فایل، بقیه به ترتیب).
function serializeConfig(values) {
  const out = { $comment: CONFIG_COMMENT };

  const keys = Object.keys(values).filter(key => values[key] !== undefined && !META_KEYS.has(key));
  const known = CANONICAL_KEY_ORDER.filter(key => keys.includes(key));
  const unknown = keys.filter(key => !CANONICAL_KEY_ORDER.includes(key)).sort((a, b) => a.localeCompare(b));

  for (const key of [...known, ...unknown]) out[key] = values[key];

  return `${JSON.stringify(out, null, 2)}\n`;
}

// فقط زمانی فایل را می‌نویسد که محتوا واقعاً تغییر کرده باشد.
function writeIfChanged(file, nextText) {
  const current = readTextIfExists(file);
  if (current != null && current === nextText) return false;

  fs.writeFileSync(file, nextText, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// خواندن فایل قدیمی `.env` (فقط برای مهاجرت یک‌باره)
// ---------------------------------------------------------------------------

// جای «]» یا «}»ِ بستنِ یک مقدار JSON را پیدا می‌کند؛ کاراکترهای داخل رشته
// («...») شمارش نمی‌شوند.
function findJsonEnd(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[' || char === '{') {
      depth += 1;
      continue;
    }

    if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

// الگوی یک خط «کلید = مقدار» در .env.
const ENV_LINE_PATTERN = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.]*\s*=\s*)([\s\S]*)$/;

// آرایه‌ی JSON چندخطی .env را به یک خط قابل‌خواندن برای dotenv تبدیل می‌کند.
function flattenWrappedJsonLines(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const match = ENV_LINE_PATTERN.exec(lines[index]);

    if (!match) {
      out.push(lines[index]);
      index += 1;
      continue;
    }

    const prefix = match[1];
    const raw = match[2].trimStart();
    const quote = raw[0] === '"' || raw[0] === "'" || raw[0] === '`' ? raw[0] : '';
    const body = quote ? raw.slice(1) : raw;

    if ((body[0] !== '[' && body[0] !== '{') || findJsonEnd(body) >= 0) {
      out.push(lines[index]);
      index += 1;
      continue;
    }

    let accumulated = body;
    let endIndex = index;

    while (findJsonEnd(accumulated) < 0 && endIndex + 1 < lines.length) {
      endIndex += 1;
      accumulated += ` ${lines[endIndex]}`;
    }

    const closedAt = findJsonEnd(accumulated);

    if (closedAt < 0) {
      out.push(lines[index]);
      index += 1;
      continue;
    }

    out.push(`${prefix}${quote}${accumulated.slice(0, closedAt + 1)}${quote}`);
    index = endIndex + 1;
  }

  return out.join('\n');
}

// اگر `.env` قدیمی موجود باشد، یک‌بار می‌خواند و به شکل مقدارهای تنظیمات
// برمی‌گرداند. اگر فایل نباشد null برمی‌گردد.
function readLegacyEnvValues(file) {
  const text = readTextIfExists(file);
  if (text == null) return null;

  const parsed = dotenv.parse(flattenWrappedJsonLines(stripBom(text)));
  const values = {};

  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    if (rawKey === 'CONFIG_SYNC' || rawKey === 'ENV_JSON_STYLE') continue;

    const key = LEGACY_ALIASES[rawKey] || rawKey;
    values[key] = parseMaybeJson(rawValue);
  }

  return { file, values };
}

// `.env` قدیمی را بعد از مهاجرت کنار می‌گذارد تا دیگر گمراه‌کننده نباشد.
function archiveLegacyEnv(file) {
  const target = path.join(path.dirname(file), LEGACY_ENV_IMPORTED_FILE_NAME);

  try {
    if (fs.existsSync(target)) fs.rmSync(target);
    fs.renameSync(file, target);
    return target;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// مقدارهای شل (process.env)
// ---------------------------------------------------------------------------

// مقدارهای شل را می‌خواند. نام‌های قدیمی به نام جدید تبدیل می‌شوند.
function readShellOverrides() {
  const values = {};

  for (const [rawKey, rawValue] of Object.entries(process.env)) {
    if (rawValue === undefined) continue;

    const key = LEGACY_ALIASES[rawKey] || rawKey;
    const known = CANONICAL_KEY_ORDER.includes(key) || LEGACY_UPSTREAM_KEYS.includes(key);

    if (!known) continue;

    values[key] = LIST_KEYS.has(key) ? toList(rawValue) : parseMaybeJson(rawValue);
  }

  return values;
}

// ---------------------------------------------------------------------------
// هسته‌ی بارگذاری
// ---------------------------------------------------------------------------

// سرورها را از هر شکلی که در فایل/شل آمده باشد استخراج می‌کند.
function pickUpstreams(values) {
  if (toList(values.UPSTREAMS).length) return { raw: values.UPSTREAMS, source: 'UPSTREAMS' };
  if (toList(values.UPSTREAMS_JSON).length) return { raw: values.UPSTREAMS_JSON, source: 'UPSTREAMS_JSON' };

  if (toList(values.BASE_URLs).length || toList(values.API_KEY).length) {
    return { raw: pairUrlsAndKeys(values.BASE_URLs, values.API_KEY), source: 'BASE_URLs + API_KEY' };
  }

  return { raw: values.UPSTREAMS, source: null };
}

/*
  پیکربندی نهایی برنامه را می‌سازد.

  ترتیب اولویت:
    1) فایل CyrusAsha_OllamaProxy.config.json
    2) متغیرهای شل (process.env) — روی فایل، بدون نوشتن روی دیسک
    3) مقدارهای پیش‌فرض درون کد

  اگر فایل تنظیمات وجود نداشته باشد ولی `.env` قدیمی موجود باشد، یک‌بار مقدارها
  از آن خوانده و به JSON منتقل می‌شوند.

  خروجی:
    values       → مقدارهای نهایی (map «کلید → مقدار»)
    upstreams    → آرایه‌ی یکدست‌شده‌ی { name?, url, key }
    file         → مسیر فایل تنظیمات
    wrote        → آیا فایل در این اجرا نوشته شد
    migrated     → توضیح مهاجرت‌های انجام‌شده
    importedEnv  → مسیر `.env.imported` اگر مهاجرت از .env انجام شد
    syncEnabled  → آیا نوشتن روی فایل مجاز است
*/
export function loadConfig({ baseDir, sync } = {}) {
  // مسیر پوشه‌ی تنظیمات: آرگومان، بعد متغیر شل، بعد ریشه‌ی پروژه.
  const resolvedBaseDir = baseDir
    ? path.resolve(baseDir)
    : process.env.CYRUSASHA_CONFIG_DIR
      ? path.resolve(process.env.CYRUSASHA_CONFIG_DIR)
      : PROJECT_ROOT;

  const syncEnabled = sync === undefined
    ? String(process.env.CONFIG_SYNC || 'on').toLowerCase() !== 'off'
    : Boolean(sync);

  const file = path.join(resolvedBaseDir, CONFIG_FILE_NAME);
  const fileText = readTextIfExists(file);
  const fileValues = fileText == null ? null : parseConfigJsonText(fileText);

  const migrated = [];

  // 1) مهاجرت یک‌باره از .env قدیمی، فقط وقتی فایل JSON وجود ندارد.
  const legacyEnvValues = fileValues == null
    ? readLegacyEnvValues(path.join(resolvedBaseDir, LEGACY_ENV_FILE_NAME))
    : null;

  if (legacyEnvValues) migrated.push(`${LEGACY_ENV_FILE_NAME} → ${CONFIG_FILE_NAME}`);

  // 2) ادغام فایل‌ها: .env قدیمی < فایل JSON
  const stored = {};
  for (const layer of [legacyEnvValues?.values, fileValues]) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) stored[key] = value;
  }

  // 3) همه‌ی راه‌های قدیمی به یک آرایه‌ی واحد UPSTREAMS تبدیل می‌شوند.
  const storedPicked = pickUpstreams(stored);
  if (storedPicked.source && storedPicked.source !== 'UPSTREAMS') {
    migrated.push(`${storedPicked.source} → UPSTREAMS`);
  }

  stored.UPSTREAMS = normalizeUpstreams(storedPicked.raw);

  // کلیدهای نسخه‌ی قبلی دیگر در فایل نوشته نمی‌شوند.
  for (const key of LEGACY_UPSTREAM_KEYS) delete stored[key];

  // آرایه‌های متنی (CSV یا JSON در یک خط) به آرایه‌ی واقعی تبدیل می‌شوند.
  for (const key of LIST_KEYS) {
    if (stored[key] !== undefined) stored[key] = toList(stored[key]);
  }

  // عدد و بولی هم به نوع طبیعی خودشان نوشته می‌شوند.
  for (const key of NUMBER_KEYS) {
    if (stored[key] !== undefined && stored[key] !== '' && Number.isFinite(Number(stored[key]))) {
      stored[key] = Number(stored[key]);
    }
  }

  for (const key of BOOLEAN_KEYS) {
    if (stored[key] === undefined) continue;

    const text = String(stored[key]).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(text)) stored[key] = true;
    else if (['false', '0', 'no', 'off'].includes(text)) stored[key] = false;
  }

  // فایل تازه: کلیدهای اصلی با مقدار پیش‌فرض نوشته می‌شوند تا فایل خودتوضیح باشد.
  if (fileText == null) {
    for (const key of STARTER_KEYS) {
      if (stored[key] === undefined) stored[key] = DEFAULTS[key];
    }
  }

  const wrote = syncEnabled ? writeIfChanged(file, serializeConfig(stored)) : false;

  // مهاجرت از .env فقط بعد از نوشته شدن موفق فایل JSON نهایی می‌شود.
  let importedEnv = null;
  if (legacyEnvValues && wrote) {
    importedEnv = archiveLegacyEnv(legacyEnvValues.file);
  }

  // 4) متغیرهای شل روی مقدارهای فایل می‌نشینند (و روی دیسک نوشته نمی‌شوند).
  const shellValues = readShellOverrides();
  const values = { ...stored, ...shellValues };

  const shellPicked = pickUpstreams(shellValues);
  if (shellPicked.source) values.UPSTREAMS = normalizeUpstreams(shellPicked.raw);

  const upstreams = values.UPSTREAMS;

  return {
    // مقادیر خام و شکل‌یافته.
    values,
    upstreams,
    file,

    // اطلاعات بارگذاری برای لاگ و عیب‌یابی.
    wrote,
    migrated,
    importedEnv,
    syncEnabled,
    configFileName: CONFIG_FILE_NAME,

    // مقدار متنی؛ اگر خالی باشد مقدار پیش‌فرض برگردانده می‌شود.
    get(key, fallback = DEFAULTS[key]) {
      const value = values[key];
      return value === undefined || String(value).trim() === '' ? fallback : value;
    },

    // مقدار عددی.
    getNumber(key, fallback = DEFAULTS[key]) {
      const value = values[key];
      if (value === undefined || String(value).trim() === '') return fallback;

      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    },

    // مقدار بولی؛ مقادیر false/0/no/off مساوی false هستند.
    getBool(key, fallback = DEFAULTS[key]) {
      const value = values[key];
      if (value === undefined || String(value).trim() === '') return fallback;

      return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
    },

    // یک لیست را همیشه به شکل آرایه برمی‌گرداند (آرایه، CSV یا مقدار تکی).
    getList(key, fallback = DEFAULTS[key] ?? []) {
      const items = toList(values[key]);
      return items.length ? items : fallback;
    },
  };
}
