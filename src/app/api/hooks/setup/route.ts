/**
 * Hooks Setup API
 *
 * POST /api/hooks/setup - Configure Claude Code hooks for Ringmaster integration
 *
 * Writes hooks to GLOBAL ~/.claude/settings.json because:
 * - Hooks need to work in worktrees, which have their own .claude/settings.local.json
 * - Global hooks apply everywhere (worktrees, main repo, any project)
 * - The session-stop handler filters non-Ringmaster directories, so global is safe
 *
 * Writes worktree trust to PROJECT-level .claude/settings.local.json because:
 * - additionalDirectories is project-specific
 * - Different projects have different .tasks locations
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface SetupRequest {
  projectRoot?: string;
  baseUrl?: string;
  enableSubagentStop?: boolean;
  enableSessionStop?: boolean;
  trustTaskWorktrees?: boolean;  // Add .tasks to additionalDirectories
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
  permissions?: {
    additionalDirectories?: string[];
    allow?: string[];
    [key: string]: unknown;
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
    const trustTaskWorktrees = body.trustTaskWorktrees !== false; // Default true

    // ===== GLOBAL HOOKS =====
    // Write hooks to ~/.claude/settings.json so they work in worktrees
    const globalClaudeDir = path.join(os.homedir(), '.claude');
    const globalSettingsPath = path.join(globalClaudeDir, 'settings.json');

    // Ensure global .claude directory exists
    try {
      await fs.mkdir(globalClaudeDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Load existing global settings
    let globalSettings: ClaudeSettings = {};
    try {
      const existingContent = await fs.readFile(globalSettingsPath, 'utf-8');
      globalSettings = JSON.parse(existingContent);
    } catch {
      // File doesn't exist or isn't valid JSON, start fresh
    }

    // Initialize hooks object if needed
    if (!globalSettings.hooks) {
      globalSettings.hooks = {};
    }

    // Configure SubagentStop hook globally
    if (enableSubagentStop) {
      globalSettings.hooks.SubagentStop = [generateSubagentStopHook(baseUrl)];
    }

    // Configure Stop hook globally (session completion → auto-review)
    if (enableSessionStop) {
      globalSettings.hooks.Stop = [generateSessionStopHook(baseUrl)];
    }

    // Write global settings
    await fs.writeFile(
      globalSettingsPath,
      JSON.stringify(globalSettings, null, 2) + '\n',
      'utf-8'
    );
    console.log(`[hooks/setup] Wrote hooks to global settings: ${globalSettingsPath}`);

    // ===== PROJECT-LEVEL WORKTREE TRUST =====
    // Write additionalDirectories to project-level settings (project-specific)
    let projectSettingsPath: string | undefined;
    if (trustTaskWorktrees) {
      const projectClaudeDir = path.join(projectRoot, '.claude');
      projectSettingsPath = path.join(projectClaudeDir, 'settings.local.json');

      // Ensure project .claude directory exists
      try {
        await fs.mkdir(projectClaudeDir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      // Load existing project settings
      let projectSettings: ClaudeSettings = {};
      try {
        const existingContent = await fs.readFile(projectSettingsPath, 'utf-8');
        projectSettings = JSON.parse(existingContent);
      } catch {
        // File doesn't exist or isn't valid JSON, start fresh
      }

      // Configure permissions for task worktrees
      if (!projectSettings.permissions) {
        projectSettings.permissions = {};
      }
      const tasksDir = '.tasks';
      if (!projectSettings.permissions.additionalDirectories) {
        projectSettings.permissions.additionalDirectories = [];
      }
      if (!projectSettings.permissions.additionalDirectories.includes(tasksDir)) {
        projectSettings.permissions.additionalDirectories.push(tasksDir);
      }

      // Write project settings
      await fs.writeFile(
        projectSettingsPath,
        JSON.stringify(projectSettings, null, 2) + '\n',
        'utf-8'
      );
      console.log(`[hooks/setup] Wrote worktree trust to project settings: ${projectSettingsPath}`);

      // Ensure .claude/settings.local.json is in .gitignore
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
          const newContent = gitignore.trimEnd() + '\n\n# Claude Code local settings\n' + ignorePattern + '\n';
          await fs.writeFile(gitignorePath, newContent, 'utf-8');
          console.log(`[hooks/setup] Added ${ignorePattern} to .gitignore`);
        }
      } catch (error) {
        console.warn('[hooks/setup] Could not update .gitignore:', error);
        // Non-fatal, continue
      }
    }

    return NextResponse.json({
      success: true,
      globalSettingsPath,
      projectSettingsPath,
      configured: {
        subagentStop: enableSubagentStop,
        sessionStop: enableSessionStop,
        trustTaskWorktrees,
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
 *
 * Removes hooks from global settings and worktree trust from project settings.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const projectRoot = url.searchParams.get('projectRoot') || process.cwd();

    // ===== REMOVE GLOBAL HOOKS =====
    const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

    try {
      const existingContent = await fs.readFile(globalSettingsPath, 'utf-8');
      const globalSettings: ClaudeSettings = JSON.parse(existingContent);

      // Remove Ringmaster hooks
      if (globalSettings.hooks) {
        delete globalSettings.hooks.SubagentStop;
        delete globalSettings.hooks.Stop;

        // If hooks object is now empty, remove it
        if (Object.keys(globalSettings.hooks).length === 0) {
          delete globalSettings.hooks;
        }
      }

      // Write updated global settings (don't delete file - may have other settings)
      await fs.writeFile(
        globalSettingsPath,
        JSON.stringify(globalSettings, null, 2) + '\n',
        'utf-8'
      );
      console.log(`[hooks/setup] Removed hooks from global settings`);
    } catch {
      // Global settings don't exist, nothing to clean up
    }

    // ===== REMOVE PROJECT WORKTREE TRUST =====
    const projectSettingsPath = path.join(projectRoot, '.claude', 'settings.local.json');

    try {
      const existingContent = await fs.readFile(projectSettingsPath, 'utf-8');
      const projectSettings: ClaudeSettings = JSON.parse(existingContent);

      // Remove .tasks from additionalDirectories
      if (projectSettings.permissions?.additionalDirectories) {
        projectSettings.permissions.additionalDirectories =
          projectSettings.permissions.additionalDirectories.filter(d => d !== '.tasks');

        // If additionalDirectories is now empty, remove it
        if (projectSettings.permissions.additionalDirectories.length === 0) {
          delete projectSettings.permissions.additionalDirectories;
        }

        // If permissions is now empty, remove it
        if (Object.keys(projectSettings.permissions).length === 0) {
          delete projectSettings.permissions;
        }
      }

      // If settings object is empty, delete the file
      if (Object.keys(projectSettings).length === 0) {
        await fs.unlink(projectSettingsPath);
        console.log(`[hooks/setup] Deleted empty project settings file`);
      } else {
        // Otherwise, write updated settings
        await fs.writeFile(
          projectSettingsPath,
          JSON.stringify(projectSettings, null, 2) + '\n',
          'utf-8'
        );
        console.log(`[hooks/setup] Updated project settings`);
      }
    } catch {
      // Project settings don't exist, nothing to clean up
    }

    return NextResponse.json({
      success: true,
      message: 'Ringmaster configuration removed',
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
