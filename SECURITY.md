# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of `CyrusAsha_OllamaProxy` seriously. If you discover a security vulnerability, please report it responsibly:

1. **Do not create a public GitHub issue** for undisclosed security vulnerabilities.
2. Please report security issues directly to the repository maintainer or via private security advisories on GitHub.
3. Provide a clear description of the vulnerability, reproduction steps, and potential impact.
4. Maintainers will review the submission promptly and release a fix in a coordinated manner.

## Key Security Architecture Principles

- **Loopback Default:** By default, the proxy binds strictly to `127.0.0.1` (loopback). It must NOT be exposed directly to the public internet without an authentication layer and reverse proxy (such as Nginx/Caddy with TLS).
- **Secrets Management:** Upstream API keys are stored only in local configuration files (`.env` / `CyrusAsha_OllamaProxy.config.json`), which are excluded from version control via `.gitignore`.
- **Log Masking:** The proxy never logs full API keys. Only the last 4 characters and the key length are displayed (`****abcd (len=36)`).
- **Bearer Token Isolation:** API keys are injected exclusively in outbound requests to configured upstreams in the standard `Authorization: Bearer <key>` header.
- **Failover Safety:** Failover happens transparently across trusted upstreams specified by the operator.
