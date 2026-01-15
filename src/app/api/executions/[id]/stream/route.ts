/**
 * SSE endpoint for streaming execution logs.
 * GET - Returns a Server-Sent Events stream of log chunks.
 */

import { NextRequest } from 'next/server';
import { getExecution, getLogsAfterChunk } from '@/lib/db/executions';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  // Verify execution exists
  const execution = await getExecution(id);
  if (!execution) {
    return new Response('Execution not found', { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let lastChunkIndex = -1;
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial status
      const statusEvent = `event: status\ndata: ${JSON.stringify({ status: execution.status })}\n\n`;
      controller.enqueue(encoder.encode(statusEvent));

      // Poll for new logs
      const poll = async () => {
        while (isActive) {
          try {
            // Check if execution is still running
            const currentExecution = await getExecution(id);
            if (!currentExecution) {
              controller.close();
              return;
            }

            // Get new log chunks
            const newLogs = await getLogsAfterChunk(id, lastChunkIndex);
            for (const log of newLogs) {
              const event = `event: log\ndata: ${JSON.stringify(log)}\n\n`;
              controller.enqueue(encoder.encode(event));
              lastChunkIndex = Math.max(lastChunkIndex, log.chunkIndex);
            }

            // Check if execution completed
            if (currentExecution.status !== 'running') {
              const completeEvent = `event: complete\ndata: ${JSON.stringify({
                status: currentExecution.status,
                exitCode: currentExecution.exitCode,
              })}\n\n`;
              controller.enqueue(encoder.encode(completeEvent));
              controller.close();
              return;
            }

            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error('[stream] Error polling logs:', error);
            controller.error(error);
            return;
          }
        }
      };

      poll();
    },
    cancel() {
      isActive = false;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
