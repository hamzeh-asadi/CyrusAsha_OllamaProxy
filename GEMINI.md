<!-- GLOBAL-AI-AGENTS:START -->
# Global AI Agent Knowledge & Orchestration Index

CRITICAL INSTRUCTION FOR GEMINI CLI

This workspace is connected to the central AI agent directory:

- **Project path:** .agents/  (junction created by Initialize-AgentWorkspace)
- **User path:** %USERPROFILE%\.agents  (~/.agents)

Desktop apps such as **Freebuff** and **Codebuff** do not read the user-level folder
when a project is opened via Open Folder. They DO read files in the project root.
That is why this file exists: it points you at .agents/.

## Mandatory pre-execution steps

Before planning, coding, refactoring, UI/UX, SEO, or security work, silently:

1. Read and enforce .agents/rules/00-auto-orchestrator.md
2. Read and enforce .agents/rules/security-architect.md
3. Scan .agents/skills/ and load the most relevant SKILL.md playbooks
4. Adopt a specialist persona from .agents/agents/ when the domain is specific
5. Use MCP servers from .agents/mcp.json
6. Honor slash-command playbooks in .agents/commands/
   (/CyrusAsha_Auto /CyrusAsha_Skills /CyrusAsha_Rules /CyrusAsha_Agents /CyrusAsha_Hooks /CyrusAsha_Commands /CyrusAsha_Audit-Security /CyrusAsha_Compact)

If .agents/ is missing, run in PowerShell from the project root:

    Initialize-AgentWorkspace
    # aliases: agents-init    ai-init    init-agents    init-needed-files

Do not ignore this index. Treat .agents/ as the single source of truth.
<!-- GLOBAL-AI-AGENTS:END -->
