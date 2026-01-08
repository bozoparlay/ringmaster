import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { BacklogItem } from '@/types/backlog';

const execAsync = promisify(exec);

interface CleanupRequest {
  task: BacklogItem;
  workDir: string;
}

interface CleanupSuggestion {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  notes?: string;
  priority: string;
  effort?: string;
  value?: string;
}

/**
 * Check if Claude Code CLI is available
 */
async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    await execAsync('which claude');
    return true;
  } catch {
    return false;
  }
}

/**
 * Use Claude to suggest a cleaned-up version of a task
 */
async function suggestCleanup(
  task: BacklogItem,
  workDir: string
): Promise<CleanupSuggestion | null> {
  const prompt = `Reformat this task to match the template. Preserve ALL existing information.

CURRENT TASK:
Title: ${task.title}
Priority: ${task.priority}
Effort: ${task.effort || 'Not set'}
Value: ${task.value || 'Not set'}
Description: ${task.description || 'No description'}
${task.acceptanceCriteria?.length ? `Acceptance Criteria:\n${task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}` : ''}
${task.notes ? `Notes: ${task.notes}` : ''}

TEMPLATE FORMAT:
- Title: Keep as-is unless unclear
- Description: 2-3 sentences explaining the problem or feature
- Acceptance Criteria: 3-5 specific, testable criteria extracted from the description
- Notes: Technical context, links, considerations (optional)

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "acceptanceCriteria": ["criterion 1", "criterion 2", "criterion 3"],
  "notes": "..." or null,
  "priority": "${task.priority}",
  "effort": "${task.effort || 'medium'}",
  "value": "${task.value || 'medium'}"
}

Important:
- Keep priority/effort/value from original unless clearly wrong
- Generate acceptance criteria from requirements mentioned in description
- If description is vague, make it more specific but don't invent details
- Notes should capture any technical details, links, or considerations`;

  return new Promise((resolve) => {
    const claude = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      cwd: workDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    claude.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error('Claude Code stderr:', stderr);
        resolve(null);
        return;
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as CleanupSuggestion;
          resolve(parsed);
        } else {
          resolve(null);
        }
      } catch {
        console.error('Parse error:', stdout);
        resolve(null);
      }
    });

    claude.on('error', () => {
      resolve(null);
    });

    // 2 minute timeout
    setTimeout(() => {
      claude.kill();
      resolve(null);
    }, 2 * 60 * 1000);
  });
}

export async function POST(request: Request) {
  try {
    const { task, workDir } = await request.json() as CleanupRequest;

    if (!task) {
      return NextResponse.json({ error: 'Task is required' }, { status: 400 });
    }

    // Check if Claude is available
    const claudeAvailable = await isClaudeCodeAvailable();
    if (!claudeAvailable) {
      return NextResponse.json({
        suggestion: null,
        skipped: true,
        reason: 'Claude Code CLI not available',
      });
    }

    const suggestion = await suggestCleanup(task, workDir || process.cwd());

    if (!suggestion) {
      return NextResponse.json({
        suggestion: null,
        error: 'Failed to generate cleanup suggestion',
      });
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('Cleanup suggestion error:', error);
    return NextResponse.json({
      suggestion: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
