# Threat Model: CyrusAsha_OllamaProxy

This document details the threat modeling (STRIDE methodology) and trust boundary analysis for **CyrusAsha_OllamaProxy**.

## Architecture & Trust Boundaries

```
[ Local Client: VS / Copilot / CLI ] (Untrusted / Semi-Trusted Local Process)
                 │
                 │ HTTP (localhost:11434)
                 ▼
┌──────────────────────────────────────────────┐
│  Trust Boundary 1: Local HTTP Ingress        │
│  CyrusAsha_OllamaProxy                       │
│  - Endpoint Routing & Payload Translation    │
│  - Two-Way Config Synchronization Engine     │
│  - Secret Masking & Logging                  │
└──────────────────────────────────────────────┘
                 │
                 │ HTTPS / HTTP Outbound with Bearer Token
                 ▼
┌──────────────────────────────────────────────┐
│  Trust Boundary 2: Upstream LLM Endpoints    │
│  freellmapi Instances (1 .. N)               │
└──────────────────────────────────────────────┘
```

## STRIDE Analysis

| Threat Category | Potential Threat | Mitigation in CyrusAsha_OllamaProxy |
|---|---|---|
| **Spoofing** | Attacker impersonating local client or upstream provider | Default binding is `127.0.0.1` (loopback only). Clients on external networks cannot reach proxy unless explicitly reconfigured. Upstream endpoints are validated against user-defined base URLs. |
| **Tampering** | Man-in-the-middle tampering of outbound requests/responses | When upstreams use HTTPS, TLS ensures integrity. Request bodies and responses are validated and mapped cleanly before streaming. |
| **Repudiation** | Lack of traceability for upstream failovers or errors | All incoming routes, model translations, and upstream failover events are timestamped and logged with status codes. |
| **Information Disclosure** | Leakage of upstream API keys in logs, error traces, or version control | API keys are masked in logs (`****` + last 4 characters). Local secret files (`.env`, `*.config.json`) are strictly excluded in `.gitignore`. Upstream errors truncate body excerpts in logs. |
| **Denial of Service** | Malformed requests or slow upstream hanging local proxy | AbortController enforces `REQUEST_TIMEOUT_MS` (default 120s) per request. Failover automatically bypasses unresponsive upstreams. Request streaming prevents buffering large responses in memory. |
| **Elevation of Privilege** | Arbitrary code execution or config manipulation via API | Proxy exposes only fixed read-only/completion routes. No dynamic code evaluation or remote configuration endpoints exist. |

## Operational Security Recommendations

1. **Keep HOST=127.0.0.1**: Never set `HOST=0.0.0.0` on an untrusted or public network.
2. **Never Commit Secrets**: Always use `.env.example` and `CyrusAsha_OllamaProxy.config.example.json` as templates. Keep actual keys in `.env` / `CyrusAsha_OllamaProxy.config.json`.
3. **Audit Upstream URLs**: Ensure `FREELLMAPI_BASE_URL` or `FREELLMAPI_UPSTREAMS_JSON` points to legitimate, trusted endpoints.
