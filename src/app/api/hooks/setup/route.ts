/**
 * Hooks Setup API
 *
 * POST /api/hooks/setup - Configure Claude Code hooks for Ringmaster integration
 *
 * Creates or updates .claude/settings.local.json with the required hooks:
 * - SubagentStop: Track Task tool subagents
 * - Stop: Auto-move tasks to review when session ends
 *
 * The .local.json file is used because:
 * 1. It's project-specific (not global)
 * 2. It's typically gitignored (contains localhost URLs)
 * 3. It won't conflict with team settings in settings.json
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface SetupRequest {
  projectRoot?: string;
  baseUrl?: string;
  enableSubagentStop?: boolean;
  enableSessionStop?: boolean;
}

interface HookConfig {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout: number;
  }>;
}

interface ClaudeSettings {
  hooks?: {
    SubagentStop?: HookConfig[];
    Stop?: HookConfig[];
    [key: string]: HookConfig[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * Generate the SubagentStop hook configuration.
 */
function generateSubagentStopHook(baseUrl: string): HookConfig {
  return {
    matcher: '',
    hooks: [{
      type: 'command',
      command: `curl -s -X POST ${baseUrl}/api/executions/hook/subagent-stop -H 'Content-Type: application/json' -d @-`,
      timeout: 5000,
    }],
  };
}

/**
 * Generate the Stop hook configuration (for auto-review).
 */
function generateSessionStopHook(baseUrl: string): HookConfig {
  return {
    matcher: '',
    hooks: [{
      type: 'command',
      command: `curl -s -X POST ${baseUrl}/api/executions/hook/session-stop -H 'Content-Type: application/json' -d @-`,
      timeout: 5000,
    }],
  };
}

export async function POST(request: Request) {
  try {
    const body: SetupRequest = await request.json();
    const projectRoot = body.projectRoot || process.cwd();
    const baseUrl = body.baseUrl || 'http://localhost:3000';
    const enableSubagentStop = body.enableSubagentStop !== false; // Default true
    const enableSessionStop = body.enableSessionStop !== false; // Default true

    // Ensure .claude directory exists
    const claudeDir = path.join(projectRoot, '.claude');
    try {
      await fs.mkdir(claudeDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }

    const settingsPath = path.join(claudeDir, 'settings.local.json');

    // Load existing settings or start fresh
    let settings: ClaudeSettings = {};
    try {
      const existingContent = await fs.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(existingContent);
    } catch {
      // File doesn't exist or isn't valid JSON, start fresh
    }

    // Initialize hooks object if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Configure SubagentStop hook
    if (enableSubagentStop) {
      settings.hooks.SubagentStop = [generateSubagentStopHook(baseUrl)];
    }

    // Configure Stop hook (session completion → auto-review)
    if (enableSessionStop) {
      settings.hooks.Stop = [generateSessionStopHook(baseUrl)];
    }

    // Write settings file
    await fs.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n',
      'utf-8'
    );

    console.log(`[hooks/setup] Wrote configuration to ${settingsPath}`);

    // Also ensure .claude/settings.local.json is in .gitignore
    const gitignorePath = path.join(projectRoot, '.gitignore');
    try {
      let gitignore = '';
      try {
        gitignore = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore doesn't exist
      }

      const ignorePattern = '.claude/settings.local.json';
      if (!gitignore.includes(ignorePattern)) {
        const newContent = gitignore.trimEnd() + '\n\n# Claude Code local settings (contains localhost URLs)\n' + ignorePattern + '\n';
        await fs.writeFile(gitignorePath, newContent, 'utf-8');
        console.log(`[hooks/setup] Added ${ignorePattern} to .gitignore`);
      }
    } catch (error) {
      console.warn('[hooks/setup] Could not update .gitignore:', error);
      // Non-fatal, continue
    }

    return NextResponse.json({
      success: true,
      settingsPath,
      configured: {
        subagentStop: enableSubagentStop,
        sessionStop: enableSessionStop,
      },
    });
  } catch (error) {
    console.error('[hooks/setup] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/hooks/setup - Remove Ringmaster hooks configuration
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const projectRoot = url.searchParams.get('projectRoot') || process.cwd();

    const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');

    // Load existing settings
    let settings: ClaudeSettings = {};
    try {
      const existingContent = await fs.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(existingContent);
    } catch {
      return NextResponse.json({
        success: true,
        message: 'No settings file to clean up',
      });
    }

    // Remove Ringmaster hooks
    if (settings.hooks) {
      delete settings.hooks.SubagentStop;
      delete settings.hooks.Stop;

      // If hooks object is now empty, remove it
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }

    // If settings object is empty, delete the file
    if (Object.keys(settings).length === 0) {
      await fs.unlink(settingsPath);
      return NextResponse.json({
        success: true,
        message: 'Settings file removed',
      });
    }

    // Otherwise, write updated settings
    await fs.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n',
      'utf-8'
    );

    return NextResponse.json({
      success: true,
      message: 'Ringmaster hooks removed',
    });
  } catch (error) {
    console.error('[hooks/setup] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
