import { NextResponse } from 'next/server';
import { getHealthStatus } from '@/lib/resilience';

/**
 * Health check endpoint for monitoring server responsiveness.
 * Returns quickly without touching external services.
 *
 * Use this to:
 * - Monitor if the server is responsive
 * - Check circuit breaker states
 * - Detect degraded service conditions
 */
export async function GET() {
  const health = getHealthStatus();

  // Return appropriate HTTP status based on health
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(health, { status: httpStatus });
}

/**
 * HEAD request for lightweight health probes.
 * Returns only status code, no body.
 */
export async function HEAD() {
  const health = getHealthStatus();
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;

  return new Response(null, { status: httpStatus });
}
