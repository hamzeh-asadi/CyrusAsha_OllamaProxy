# Security Checklist: CyrusAsha_OllamaProxy

Pre-release and pre-merge verification checklist for `CyrusAsha_OllamaProxy`.

## 1. Secrets & Credentials Management
- [x] `CyrusAsha_OllamaProxy.config.json` and the `.env.imported` backup are listed in `.gitignore`.
- [x] `.freebuff/` and agent caches are listed in `.gitignore`.
- [x] No plaintext API keys or credentials exist in git tracking or sample files (`*.example.json`).
- [x] Console logs mask API keys with `maskKey()` showing only last 4 characters and length.

## 2. Network & Ingress Security
- [x] Default `HOST` is strictly set to loopback (`127.0.0.1`).
- [x] `PORT` defaults to standard Ollama port (`11434`).
- [x] CORS headers are configured for local client tools (`*`) while host binding stays local.

## 3. Resilience & Denial of Service Protection
- [x] Outbound HTTP requests utilize `AbortController` bound to `REQUEST_TIMEOUT_MS`.
- [x] Configurable retry status codes (`RETRY_STATUS_CODES`) prevent infinite failover loops.
- [x] Streaming handles chunks incrementally (`for await (const chunk of upstream.body)`) to avoid memory spikes.

## 4. Input Validation & Mapping
- [x] JSON payloads parsed safely in `getBody()` with try/catch and error reporting.
- [x] Messages sanitized via `normalizeMessagesForOpenAI()` to preserve valid roles and tool calls.
- [x] Ollama options (`temperature`, `top_p`, `num_predict`, `stop`) mapped safely to OpenAI equivalents.
- [x] Model names aliased gracefully via `MODEL_MAPPINGS` to shield clients from raw model identifiers.

## 5. Configuration Integrity
- [x] A single settings file (`CyrusAsha_OllamaProxy.config.json`); no second file can drift.
- [x] Legacy keys (`UPSTREAMS_JSON`, `BASE_URLs` + `API_KEY`, `FREELLMAPI_*`) are migrated once into `UPSTREAMS`.
- [x] Invalid JSON stops startup before any write; the file is never modified.
- [x] Shell environment variables take absolute precedence over file settings and are never written to disk.
- [x] Optional dry/no-write mode available via `CONFIG_SYNC=off`.
