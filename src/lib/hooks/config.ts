/**
 * Claude Code hook configuration utilities.
 *
 * Generates hook configurations for tracking subagent executions
 * and provides helpers for managing user's Claude Code settings.
 */

/**
 * Hook types supported by Claude Code.
 */
export type HookType = 'SubagentStop' | 'SessionStart' | 'SessionEnd' | 'Stop';

/**
 * Generate the SubagentStop hook configuration for a given Ringmaster URL.
 */
export function generateSubagentStopHook(baseUrl: string = 'http://localhost:3000') {
  return {
    matcher: '', // Match all - no filtering
    hooks: [
      {
        type: 'command',
        command: `curl -s -X POST ${baseUrl}/api/executions/hook/subagent-stop -H 'Content-Type: application/json' -d @-`,
        timeout: 5000, // 5 second timeout
      },
    ],
  };
}

/**
 * Generate complete hooks configuration for Ringmaster integration.
 */
export function generateRingmasterHooksConfig(
  baseUrl: string = 'http://localhost:3000',
  options: {
    subagentStop?: boolean;
    sessionStart?: boolean;
    sessionEnd?: boolean;
  } = {}
) {
  const hooks: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }>> = {};

  // SubagentStop - track Task tool subagents
  if (options.subagentStop !== false) {
    hooks.SubagentStop = [generateSubagentStopHook(baseUrl)];
  }

  // Future: SessionStart - track when any Claude Code session begins
  // Future: SessionEnd - track when session completes
  // These can be enabled later for broader tracking

  return { hooks };
}

/**
 * Generate JSON string of hooks config for display/copy.
 */
export function getHooksConfigJson(baseUrl: string = 'http://localhost:3000'): string {
  const config = generateRingmasterHooksConfig(baseUrl);
  return JSON.stringify(config, null, 2);
}

/**
 * Path to Claude Code settings file.
 */
export function getClaudeSettingsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  return `${home}/.claude/settings.json`;
}

/**
 * Path to project-level Claude settings.
 */
export function getProjectClaudeSettingsPath(projectRoot: string): string {
  return `${projectRoot}/.claude/settings.json`;
}

/**
 * Check if we're likely on localhost based on request headers.
 */
export function inferBaseUrl(requestHost?: string): string {
  if (!requestHost) {
    return 'http://localhost:3000';
  }

  // If running locally, use localhost
  if (requestHost.includes('localhost') || requestHost.includes('127.0.0.1')) {
    const port = requestHost.split(':')[1] || '3000';
    return `http://localhost:${port}`;
  }

  // Otherwise use the actual host
  return `https://${requestHost}`;
}

/**
 * Instructions for manual setup.
 */
export const SETUP_INSTRUCTIONS = `
## Setting up Ringmaster Hooks

To enable subagent tracking, add the following to your Claude Code settings:

### Option 1: Global settings (~/.claude/settings.json)
Tracks subagents across all projects.

### Option 2: Project settings (.claude/settings.json)
Tracks subagents only in this project.

### Steps:

1. Open your settings file
2. Merge the hooks configuration below
3. Restart Claude Code if running

### Configuration:

\`\`\`json
{
  "hooks": {
    "SubagentStop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://localhost:3000/api/executions/hook/subagent-stop -H 'Content-Type: application/json' -d @-",
        "timeout": 5000
      }]
    }]
  }
}
\`\`\`

### Verifying it works:

1. Start Ringmaster: \`npm run dev\`
2. Run Claude Code with a task that uses the Task tool
3. Check Ringmaster's execution history for subagent entries
`.trim();
