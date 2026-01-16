/**
 * Hooks Status API
 *
 * GET /api/hooks/status - Check if Claude Code hooks are properly configured
 *
 * Returns:
 * - configured: boolean - Whether hooks are set up
 * - hasSubagentStop: boolean - SubagentStop hook configured
 * - hasSessionStop: boolean - Stop hook configured (for auto-review)
 * - settingsPath: string - Path to settings file
 * - issues: string[] - List of configuration issues
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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
  [key: string]: unknown;
}

interface HookStatus {
  configured: boolean;
  hasSubagentStop: boolean;
  hasSessionStop: boolean;
  settingsPath: string | null;
  settingsSource: 'project-local' | 'project' | 'global' | 'none';
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
 * Analyze hooks configuration and return status.
 */
function analyzeHooks(settings: ClaudeSettings, settingsPath: string): Omit<HookStatus, 'settingsPath' | 'settingsSource'> {
  const issues: string[] = [];
  let hasSubagentStop = false;
  let hasSessionStop = false;
  let ringmasterUrl: string | null = null;

  if (!settings.hooks) {
    issues.push('No hooks configured');
    return { configured: false, hasSubagentStop, hasSessionStop, issues, ringmasterUrl };
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

  const configured = hasSubagentStop || hasSessionStop;

  return { configured, hasSubagentStop, hasSessionStop, issues, ringmasterUrl };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectRoot = url.searchParams.get('projectRoot') || process.cwd();

  // Check settings files in priority order
  const settingsLocations = [
    { path: path.join(projectRoot, '.claude', 'settings.local.json'), source: 'project-local' as const },
    { path: path.join(projectRoot, '.claude', 'settings.json'), source: 'project' as const },
    { path: path.join(process.env.HOME || '~', '.claude', 'settings.json'), source: 'global' as const },
  ];

  let result: HookStatus = {
    configured: false,
    hasSubagentStop: false,
    hasSessionStop: false,
    settingsPath: null,
    settingsSource: 'none',
    issues: ['No Claude Code settings file found'],
    ringmasterUrl: null,
  };

  for (const { path: settingsPath, source } of settingsLocations) {
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings: ClaudeSettings = JSON.parse(content);

      const analysis = analyzeHooks(settings, settingsPath);

      result = {
        ...analysis,
        settingsPath,
        settingsSource: source,
      };

      // If we found a configured settings file, stop searching
      if (analysis.configured) {
        break;
      }
    } catch {
      // File doesn't exist or isn't valid JSON, continue to next
      continue;
    }
  }

  return NextResponse.json(result);
}
