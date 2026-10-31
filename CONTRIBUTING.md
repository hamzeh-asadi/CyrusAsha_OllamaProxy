# Contributing to CyrusAsha_OllamaProxy

Thank you for your interest in contributing to **CyrusAsha_OllamaProxy**! We welcome bug reports, feature requests, documentation improvements, and pull requests.

## Code of Conduct

Please be respectful and constructive in all discussions, issues, and pull requests.

## How Can I Contribute?

### Reporting Bugs
- Ensure the bug was not already reported by searching on GitHub under [Issues](../../issues).
- If you're unable to find an open issue addressing the problem, open a new one.
- Include a clear title and description, steps to reproduce, and your environment details (Node version, OS, client software).
- **Never include real API keys or sensitive credentials in issues or logs.**

### Suggesting Enhancements
- Open an issue explaining the proposed feature, the use case, and how it benefits users.
- Provide examples of expected request/response behavior if applicable.

### Submitting Pull Requests
1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Ensure code adheres to pure modern Node.js standards (ES modules, `node:` prefixes, minimal external dependencies).
3. Test your changes locally against both Ollama and OpenAI routes.
4. Verify that `CyrusAsha_OllamaProxy.config.json` loads without errors (`npm start`), including the one-time migration of legacy keys.
5. Commit your changes with clear, descriptive commit messages.
6. Push to your fork and submit a Pull Request.

## Development Guidelines

- **Zero unnecessary dependencies**: Keep the proxy lightweight and fast. The only runtime dependency should remain `dotenv`.
- **Dual documentation**: Any configuration or feature change must be reflected in both the English and Persian sections of `README.md`.
- **Security first**: Never log unmasked tokens or expose arbitrary file system operations.
