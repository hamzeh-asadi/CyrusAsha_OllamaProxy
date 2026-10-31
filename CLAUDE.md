<!-- GLOBAL-AI-AGENTS:START -->
# Global AI Agent Knowledge & Orchestration Index

CRITICAL INSTRUCTION FOR CLAUDE CODE

This workspace is connected to the central AI agent directory:

- **Project path:** `.agents/`  (junction created by Initialize-AgentWorkspace)
- **User path:** `%USERPROFILE%\.agents`  (`~/.agents`)

Desktop apps such as **Freebuff** and **Codebuff** do not read the user-level folder
when a project is opened via Open Folder. They DO read files in the project root.
That is why this file exists: it points you at `.agents/`.

## Mandatory pre-execution steps

Before planning, coding, refactoring, UI/UX, SEO, or security work, silently:

1. Read and enforce `.agents/rules/00-auto-orchestrator.md`
2. Read and enforce `.agents/rules/security-architect.md`
3. Scan `.agents/skills/` and load the most relevant `SKILL.md` playbooks
4. Adopt a specialist persona from `.agents/agents/` when the domain is specific
5. Use MCP servers from `.agents/mcp.json`
6. Honor slash-command playbooks in `.agents/commands/`:
   `/CyrusAsha_Auto` `/CyrusAsha_Skills` `/CyrusAsha_Rules` `/CyrusAsha_Agents` `/CyrusAsha_Hooks` `/CyrusAsha_Commands` `/CyrusAsha_Audit-Security` `/CyrusAsha_Compact` `/CyrusAsha_Compress` 
7. Read and synchronize project domain context and conventions from `knowledge.md` (and `AGENTS.md`).

If `.agents/` is missing, run in PowerShell from the project root:

    Initialize-AgentWorkspace
    # aliases: agents-init    ai-init    init-agents    init-needed-files

Do not ignore this index. Treat `.agents/` as the single source of truth.
<!-- GLOBAL-AI-AGENTS:END -->

# ðŸ¤– Project Operating Guide: CyrusAsha_OllamaProxy

This workspace contains **Global AI Agent Configurator for Windows** (`CyrusAsha_OllamaProxy`), linking 19+ AI coding assistants (Antigravity, Cursor, Claude Code, Gemini CLI, Copilot, Freebuff, Windsurf, Cline, Roo, Continue, etc.) to a centralized configuration repository located at `%USERPROFILE%\.agents`.

## 1. Project Architecture & Components
- `CyrusAsha_GlobalAgents.ps1`: Primary orchestrator (Junctions, repo sync, slash commands, profile hooks).
- `CyrusAsha_SetupGlobalAgents.cmd`: Bootstrap launcher with execution policy bypass.
- `init-project-files.ps1`: Workspace initializer command (`Initialize-AgentWorkspace`).
- `.agents/`: NTFS Directory Junction pointing to `%USERPROFILE%\.agents` (0 bytes physical disk storage).
- Governance Files: `SECURITY.md`, `SECURITY-CHECKLIST.md`, `THREAT-MODEL.md`, `CONTRIBUTING.md`, `CyrusAsha_OllamaProxy.config.example.json`.

## 2. Agent Operating Guidelines
- **Strict Idempotency**: All PowerShell commands must be safe to re-run without duplicate entries.
- **Non-Destructive Overwrites**: Strictly use managed comment blocks (`Update-ManagedBlock`) to preserve user content.
- **Junction Safety**: Always verify junction existence before creation. Never delete target trees during cleanup.
- **Dual Command Naming**: Slash commands must be deployed as both `CyrusAsha_<Name>.md` and `<name>.md`.
- **Zero Secrets**: All tokens in templates must remain placeholder mock strings (`YOUR_*_TOKEN_HERE`).

## 3. Verification & Quality Gates
- **PSScriptAnalyzer**: Run `Invoke-ScriptAnalyzer -Path .\ -Recurse -Severity Error, Warning`
- **Junction Verification**: Run `(Get-Item .agents).LinkType -eq 'Junction'`
