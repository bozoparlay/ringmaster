/**
 * Hooks Status API
 *
 * GET /api/hooks/status - Check if Claude Code hooks are properly configured
 *
 * Checks:
 * - Global ~/.claude/settings.json for hooks (SubagentStop, Stop)
 * - Project .claude/settings.local.json for worktree trust (additionalDirectories)
 *
 * Returns:
 * - configured: boolean - Whether hooks are set up
 * - hasSubagentStop: boolean - SubagentStop hook configured
 * - hasSessionStop: boolean - Stop hook configured (for auto-review)
 * - trustsTaskWorktrees: boolean - .tasks in additionalDirectories
 * - globalSettingsPath: string - Path to global settings
 * - projectSettingsPath: string - Path to project settings
 * - issues: string[] - List of configuration issues
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface HookConfig {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
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
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface HookStatus {
  configured: boolean;
  hasSubagentStop: boolean;
  hasSessionStop: boolean;
  trustsTaskWorktrees: boolean;  // .tasks in additionalDirectories
  globalSettingsPath: string;
  projectSettingsPath: string;
  issues: string[];
  ringmasterUrl: string | null;
}

/**
 * Check if a hook command points to a Ringmaster endpoint.
 */
function isRingmasterHook(command: string): { isValid: boolean; url: string | null } {
  const urlMatch = command.match(/http:\/\/localhost:\d+\/api\//);
  if (urlMatch) {
    const portMatch = command.match(/localhost:(\d+)/);
    return {
      isValid: command.includes('/api/executions/hook/') || command.includes('/api/hooks/'),
      url: portMatch ? `http://localhost:${portMatch[1]}` : null,
    };
  }
  return { isValid: false, url: null };
}

/**
 * Analyze hooks in global settings.
 */
function analyzeGlobalHooks(settings: ClaudeSettings): {
  hasSubagentStop: boolean;
  hasSessionStop: boolean;
  ringmasterUrl: string | null;
  issues: string[];
} {
  const issues: string[] = [];
  let hasSubagentStop = false;
  let hasSessionStop = false;
  let ringmasterUrl: string | null = null;

  if (!settings.hooks) {
    issues.push('No hooks configured in global settings');
    return { hasSubagentStop, hasSessionStop, ringmasterUrl, issues };
  }

  // Check SubagentStop hook
  if (settings.hooks.SubagentStop && settings.hooks.SubagentStop.length > 0) {
    const hook = settings.hooks.SubagentStop[0];
    if (hook.hooks && hook.hooks.length > 0) {
      const { isValid, url } = isRingmasterHook(hook.hooks[0].command);
      if (isValid) {
        hasSubagentStop = true;
        ringmasterUrl = url;
      } else {
        issues.push('SubagentStop hook does not point to Ringmaster');
      }
    }
  }

  // Check Stop hook (for auto-review)
  if (settings.hooks.Stop && settings.hooks.Stop.length > 0) {
    const hook = settings.hooks.Stop[0];
    if (hook.hooks && hook.hooks.length > 0) {
      const { isValid, url } = isRingmasterHook(hook.hooks[0].command);
      if (isValid) {
        hasSessionStop = true;
        if (!ringmasterUrl) ringmasterUrl = url;
      } else {
        issues.push('Stop hook does not point to Ringmaster');
      }
    }
  } else {
    issues.push('Stop hook not configured (required for auto-review)');
  }

  return { hasSubagentStop, hasSessionStop, ringmasterUrl, issues };
}

/**
 * Check if .tasks is trusted in project settings.
 */
function analyzeProjectTrust(settings: ClaudeSettings): boolean {
  return settings.permissions?.additionalDirectories?.includes('.tasks') ?? false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectRoot = url.searchParams.get('projectRoot') || process.cwd();

  const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const projectSettingsPath = path.join(projectRoot, '.claude', 'settings.local.json');

  const issues: string[] = [];
  let hasSubagentStop = false;
  let hasSessionStop = false;
  let trustsTaskWorktrees = false;
  let ringmasterUrl: string | null = null;

  // Check GLOBAL settings for hooks
  try {
    const content = await fs.readFile(globalSettingsPath, 'utf-8');
    const globalSettings: ClaudeSettings = JSON.parse(content);
    const globalAnalysis = analyzeGlobalHooks(globalSettings);

    hasSubagentStop = globalAnalysis.hasSubagentStop;
    hasSessionStop = globalAnalysis.hasSessionStop;
    ringmasterUrl = globalAnalysis.ringmasterUrl;
    issues.push(...globalAnalysis.issues);
  } catch {
    issues.push('Global settings file not found or invalid');
  }

  // Check PROJECT settings for worktree trust
  try {
    const content = await fs.readFile(projectSettingsPath, 'utf-8');
    const projectSettings: ClaudeSettings = JSON.parse(content);
    trustsTaskWorktrees = analyzeProjectTrust(projectSettings);
  } catch {
    // Project settings don't exist - that's okay, just means no worktree trust
  }

  const configured = hasSubagentStop || hasSessionStop;

  const result: HookStatus = {
    configured,
    hasSubagentStop,
    hasSessionStop,
    trustsTaskWorktrees,
    globalSettingsPath,
    projectSettingsPath,
    issues: configured ? [] : issues, // Only show issues if not configured
    ringmasterUrl,
  };

  return NextResponse.json(result);
}
