import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseBacklogMd } from '@/lib/backlog-parser';

const execAsync = promisify(exec);

interface SimilarityRequest {
  title: string;
  description: string;
  category?: string;
  backlogPath: string;
}

interface SimilarTask {
  id: string;
  title: string;
  similarity: number;
  recommendation: 'merge' | 'extend' | 'duplicate';
  reason: string;
}

interface SimilarityResponse {
  similar: SimilarTask[];
  recommendation: 'proceed' | 'review_similar';
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
 * Use Claude to analyze semantic similarity between tasks
 */
async function analyzeSimilarity(
  newTask: { title: string; description: string; category?: string },
  existingTasks: Array<{ id: string; title: string; description: string; category?: string }>,
  workDir: string
): Promise<SimilarityResponse> {
  // Format existing tasks for the prompt
  const tasksContext = existingTasks.map((t, i) =>
    `[${i}] ID: ${t.id}\n    Title: ${t.title}\n    Description: ${t.description?.slice(0, 200) || 'No description'}${t.description && t.description.length > 200 ? '...' : ''}\n    Category: ${t.category || 'Uncategorized'}`
  ).join('\n\n');

  const prompt = `Are any of these EXISTING tasks essentially THE SAME work as the NEW task?

NEW TASK:
Title: ${newTask.title}
Description: ${newTask.description || 'No description'}
Category: ${newTask.category || 'Uncategorized'}

EXISTING TASKS:
${tasksContext}

Return JSON:
{
  "similar": [
    {
      "index": <number>,
      "similarity": <0.0-1.0>,
      "recommendation": "duplicate" | "merge" | "extend",
      "reason": "<brief explanation>"
    }
  ],
  "recommendation": "proceed" | "review_similar"
}

STRICT SCORING - Only flag if solving one task would complete/partially complete the other:
- 0.85+ "duplicate": Identical goal, same solution needed
- 0.70-0.84 "merge": Significant overlap in implementation work
- 0.55-0.69 "extend": One task could be a subtask of the other
- Below 0.55: Do NOT include

DO NOT FLAG as similar:
- Tasks in the same feature area but different functionality
- Tasks that touch the same code/files but do different things
- Tasks with similar keywords but different outcomes
- UI task vs backend task for same feature (these are different work)

Return {"similar": [], "recommendation": "proceed"} unless you are CONFIDENT they overlap.

Return ONLY valid JSON, no other text.`;

  return new Promise((resolve, reject) => {
    // Use full path since Node.js spawn doesn't use shell PATH
    const claudePath = '/opt/homebrew/bin/claude';
    const claude = spawn(claudePath, ['-p', prompt, '--output-format', 'text'], {
      cwd: workDir,
      env: { ...process.env, FORCE_COLOR: '0' },
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
        // Return empty result on error - don't block task creation
        resolve({ similar: [], recommendation: 'proceed' });
        return;
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Map indices back to task IDs and full info
          const similar: SimilarTask[] = (parsed.similar || []).map((s: { index: number; similarity: number; recommendation: string; reason: string }) => ({
            id: existingTasks[s.index]?.id || '',
            title: existingTasks[s.index]?.title || '',
            similarity: s.similarity,
            recommendation: s.recommendation as 'merge' | 'extend' | 'duplicate',
            reason: s.reason,
          })).filter((s: SimilarTask) => s.id && s.similarity >= 0.55);

          resolve({
            similar,
            recommendation: parsed.recommendation || (similar.length > 0 ? 'review_similar' : 'proceed'),
          });
        } else {
          resolve({ similar: [], recommendation: 'proceed' });
        }
      } catch {
        console.error('Parse error:', stdout);
        resolve({ similar: [], recommendation: 'proceed' });
      }
    });

    claude.on('error', () => {
      resolve({ similar: [], recommendation: 'proceed' });
    });

    // 2 minute timeout
    setTimeout(() => {
      claude.kill();
      resolve({ similar: [], recommendation: 'proceed' });
    }, 2 * 60 * 1000);
  });
}

export async function POST(request: Request) {
  try {
    const { title, description, category, backlogPath } = await request.json() as SimilarityRequest;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!backlogPath) {
      return NextResponse.json({ error: 'Backlog path is required' }, { status: 400 });
    }

    // Check if Claude is available
    const claudeAvailable = await isClaudeCodeAvailable();
    if (!claudeAvailable) {
      // Skip similarity check if Claude isn't available
      return NextResponse.json({
        similar: [],
        recommendation: 'proceed',
        skipped: true,
        reason: 'Claude Code CLI not available',
      });
    }

    // Read and parse existing backlog
    const backlogContent = await fs.readFile(backlogPath, 'utf-8');
    const existingTasks = parseBacklogMd(backlogContent);

    // Filter to same category first, then include some from other categories
    const sameCategory = existingTasks.filter(t => t.category === category);
    const otherCategories = existingTasks.filter(t => t.category !== category).slice(0, 10);
    const tasksToCheck = [...sameCategory, ...otherCategories].slice(0, 30); // Limit to 30 tasks

    if (tasksToCheck.length === 0) {
      return NextResponse.json({
        similar: [],
        recommendation: 'proceed',
      });
    }

    const workDir = path.dirname(backlogPath);
    const result = await analyzeSimilarity(
      { title, description, category },
      tasksToCheck.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
      })),
      workDir
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Similarity check error:', error);
    // Don't block task creation on error
    return NextResponse.json({
      similar: [],
      recommendation: 'proceed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
