/**
 * Streaming similarity check API endpoint using Bedrock.
 * Uses Server-Sent Events (SSE) to stream progress updates and results in real-time.
 */

import * as fs from 'fs/promises';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { parseBacklogMd } from '@/lib/backlog-parser';
import { bedrockCircuitBreaker, CircuitOpenError, withTimeout } from '@/lib/resilience';

// Initialize Bedrock client with profile support
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: fromIni({
    profile: process.env.AWS_PROFILE || 'bozo',
  }),
});

// Use Haiku for fast similarity checks (much faster than Sonnet)
const CLAUDE_MODEL_ID = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

interface ExistingItem {
  id: string;
  title: string;
  description: string;
  category?: string;
}

interface SimilarityRequest {
  title: string;
  description: string;
  category?: string;
  /** Path to local BACKLOG.md file (for backlog mode) */
  backlogPath?: string;
  /** Pre-loaded items to check against (for GitHub mode) */
  existingItems?: ExistingItem[];
}

interface SimilarTask {
  id: string;
  title: string;
  similarity: number;
  recommendation: 'merge' | 'extend' | 'duplicate';
  reason: string;
}

interface StreamEvent {
  type: 'progress' | 'similar' | 'complete' | 'error' | 'skipped';
  data: unknown;
}

// Configuration
const BATCH_SIZE = 5; // Tasks per batch
const BATCH_TIMEOUT_MS = 10000; // 10 seconds per batch (Bedrock is faster)
const TOTAL_TIMEOUT_MS = 30000; // 30 seconds total

/**
 * Format a Server-Sent Event message
 */
function formatSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Analyze a batch of tasks for similarity using Bedrock
 */
async function analyzeBatch(
  newTask: { title: string; description: string; category?: string },
  batch: Array<{ id: string; title: string; description: string; category?: string }>,
  batchIndex: number
): Promise<SimilarTask[]> {
  const tasksContext = batch.map((t, i) =>
    `[${i}] ID: ${t.id}\n    Title: ${t.title}\n    Description: ${t.description?.slice(0, 150) || 'No description'}${t.description && t.description.length > 150 ? '...' : ''}`
  ).join('\n\n');

  const prompt = `Quickly check if this NEW task is similar to any of these ${batch.length} EXISTING tasks.

NEW TASK:
Title: ${newTask.title}
Description: ${newTask.description?.slice(0, 200) || 'No description'}

EXISTING TASKS:
${tasksContext}

Return ONLY JSON (no other text):
{"similar": [{"index": <number>, "similarity": <0.0-1.0>, "recommendation": "merge"|"extend"|"duplicate", "reason": "<10 words max>"}]}

Rules:
- Only include tasks with similarity >= 0.4
- similarity >= 0.8 = "duplicate"
- 0.6-0.8 = "merge"
- 0.4-0.6 = "extend"
- Empty array if no matches: {"similar": []}`;

  try {
    console.log(`[similarity-batch-${batchIndex}] Calling Bedrock with ${batch.length} tasks`);
    const command = new ConverseCommand({
      modelId: CLAUDE_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 512,
        temperature: 0.1, // Low temperature for consistent results
      },
    });

    const response = await withTimeout(
      bedrockClient.send(command),
      BATCH_TIMEOUT_MS,
      `Similarity batch ${batchIndex + 1}`
    );
    console.log(`[similarity-batch-${batchIndex}] Got response from Bedrock`);

    const responseText = response.output?.message?.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const similar: SimilarTask[] = (parsed.similar || [])
        .map((s: { index: number; similarity: number; recommendation: string; reason: string }) => ({
          id: batch[s.index]?.id || '',
          title: batch[s.index]?.title || '',
          similarity: s.similarity,
          recommendation: s.recommendation as 'merge' | 'extend' | 'duplicate',
          reason: s.reason,
        }))
        .filter((s: SimilarTask) => s.id && s.similarity >= 0.4);
      return similar;
    }
    return [];
  } catch (err) {
    console.error(`[similarity-batch-${batchIndex}] Error:`, err);
    return [];
  }
}

export async function POST(request: Request) {
  // Parse request body BEFORE setting up streaming (avoids race condition)
  let body: SimilarityRequest;
  try {
    body = await request.json() as SimilarityRequest;
    console.log('[similarity-stream] Request body:', JSON.stringify(body));
  } catch (err) {
    console.error('[similarity-stream] JSON parse error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { title, description, category, backlogPath, existingItems } = body;

  // Require title AND either backlogPath or existingItems
  if (!title || (!backlogPath && !existingItems)) {
    console.error('[similarity-stream] Missing required fields - title:', title, 'backlogPath:', backlogPath, 'existingItems:', existingItems?.length);
    return new Response(JSON.stringify({ error: 'Title and either backlogPath or existingItems are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Set up SSE response
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async (event: StreamEvent) => {
    try {
      await writer.write(encoder.encode(formatSSE(event)));
    } catch {
      // Stream closed, ignore
    }
  };

  // Start processing in background
  (async () => {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalTasks = 0;
    const allSimilar: SimilarTask[] = [];

    console.log('[similarity-stream] Starting for task:', title);

    try {
      // Check circuit breaker first
      if (bedrockCircuitBreaker.getState().isOpen) {
        await send({
          type: 'skipped',
          data: {
            reason: 'AI similarity check temporarily unavailable. Please try again in a minute.',
            recommendation: 'proceed',
          },
        });
        await writer.close();
        return;
      }

      // Get existing tasks - either from backlogPath or pre-loaded existingItems
      let existingTasks: Array<{ id: string; title: string; description: string; category?: string }>;

      if (existingItems && existingItems.length > 0) {
        // Use pre-loaded items (GitHub mode)
        console.log('[similarity-stream] Using', existingItems.length, 'pre-loaded items');
        existingTasks = existingItems;
      } else if (backlogPath) {
        // Read from local file (Backlog mode)
        console.log('[similarity-stream] Reading backlog from:', backlogPath);
        const backlogContent = await fs.readFile(backlogPath, 'utf-8');
        existingTasks = parseBacklogMd(backlogContent);
        console.log('[similarity-stream] Found', existingTasks.length, 'tasks in backlog');
      } else {
        existingTasks = [];
      }

      // Filter tasks by category (same category first, then others)
      const sameCategory = existingTasks.filter(t => t.category === category);
      const otherCategories = existingTasks.filter(t => t.category !== category).slice(0, 10);
      const tasksToCheck = [...sameCategory, ...otherCategories].slice(0, 25);

      totalTasks = tasksToCheck.length;

      if (totalTasks === 0) {
        await send({ type: 'complete', data: { similar: [], recommendation: 'proceed', totalChecked: 0 } });
        await writer.close();
        return;
      }

      // Send initial progress
      await send({ type: 'progress', data: { checked: 0, total: totalTasks, phase: 'starting' } });

      // Process in batches
      const batches: Array<Array<{ id: string; title: string; description: string; category?: string }>> = [];
      for (let i = 0; i < tasksToCheck.length; i += BATCH_SIZE) {
        batches.push(
          tasksToCheck.slice(i, i + BATCH_SIZE).map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category,
          }))
        );
      }

      const newTask = { title, description, category };

      // Process batches sequentially
      for (let i = 0; i < batches.length; i++) {
        // Check total timeout
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.warn('[similarity-stream] Total timeout reached, stopping early');
          await send({
            type: 'progress',
            data: { checked: totalProcessed, total: totalTasks, phase: 'timeout', message: 'Check timed out, proceeding with partial results' },
          });
          break;
        }

        const batch = batches[i];

        await send({
          type: 'progress',
          data: { checked: totalProcessed, total: totalTasks, phase: 'checking', batchIndex: i + 1, batchTotal: batches.length },
        });

        try {
          // Use circuit breaker for the batch analysis
          const batchResults = await bedrockCircuitBreaker.execute(async () => {
            return await analyzeBatch(newTask, batch, i);
          });

          totalProcessed += batch.length;

          // Send any similar tasks found in this batch immediately
          for (const similar of batchResults) {
            allSimilar.push(similar);
            await send({ type: 'similar', data: similar });
          }
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            console.warn('[similarity-stream] Circuit breaker opened');
            break;
          }
          console.error(`[similarity-stream] Batch ${i} failed:`, error);
          totalProcessed += batch.length;
          // Continue with next batch on error
        }

        // Update progress after each batch
        await send({
          type: 'progress',
          data: { checked: totalProcessed, total: totalTasks, phase: 'checking' },
        });
      }

      // Determine recommendation based on results
      const hasDuplicates = allSimilar.some(s => s.recommendation === 'duplicate');
      const hasMerge = allSimilar.some(s => s.recommendation === 'merge');
      const recommendation = hasDuplicates || hasMerge ? 'review_similar' : 'proceed';

      await send({
        type: 'complete',
        data: {
          similar: allSimilar.sort((a, b) => b.similarity - a.similarity),
          recommendation,
          totalChecked: totalProcessed,
          duration: Date.now() - startTime,
        },
      });
    } catch (error) {
      console.error('[similarity-stream] Error:', error);
      await send({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Unknown error',
          recommendation: 'proceed', // Don't block on errors
        },
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // Already closed
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
