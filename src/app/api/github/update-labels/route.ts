/**
 * GitHub Update Labels API Endpoint
 *
 * POST /api/github/update-labels - Update metadata labels on a GitHub issue
 *
 * This handles updating priority:*, effort:*, and value:* labels on GitHub issues.
 * It removes old labels of the same type and adds the new ones.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubCredentials } from '@/lib/config/github-credentials';
import type { Priority, Effort, Value } from '@/types/backlog';

interface UpdateLabelsRequest {
  repo: string;
  issueNumber: number;
  priority?: { old?: Priority; new: Priority };
  effort?: { old?: Effort; new: Effort };
  value?: { old?: Value; new: Value };
}

// Label prefix mappings
const LABEL_PREFIXES = {
  priority: 'priority:',
  effort: 'effort:',
  value: 'value:',
} as const;

export async function POST(request: NextRequest) {
  try {
    // Get auth token - priority: server-side config > Authorization header
    let token: string | null = null;

    // 1. Check server-side credentials (env var or config file)
    const serverCredentials = await getGitHubCredentials();
    if (serverCredentials) {
      token = serverCredentials.token;
    }

    // 2. Fall back to Authorization header (client-side/legacy)
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as UpdateLabelsRequest;
    const { repo, issueNumber, priority, effort, value } = body;

    if (!repo || !issueNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: repo, issueNumber' },
        { status: 400 }
      );
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    const labelsToRemove: string[] = [];
    const labelsToAdd: string[] = [];

    // Process priority change
    if (priority) {
      if (priority.old) {
        labelsToRemove.push(`${LABEL_PREFIXES.priority}${priority.old}`);
      }
      labelsToAdd.push(`${LABEL_PREFIXES.priority}${priority.new}`);
    }

    // Process effort change
    if (effort) {
      if (effort.old) {
        labelsToRemove.push(`${LABEL_PREFIXES.effort}${effort.old}`);
      }
      labelsToAdd.push(`${LABEL_PREFIXES.effort}${effort.new}`);
    }

    // Process value change
    if (value) {
      if (value.old) {
        labelsToRemove.push(`${LABEL_PREFIXES.value}${value.old}`);
      }
      labelsToAdd.push(`${LABEL_PREFIXES.value}${value.new}`);
    }

    // Remove old labels
    for (const label of labelsToRemove) {
      const encodedLabel = encodeURIComponent(label);
      const removeResponse = await fetch(
        `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels/${encodedLabel}`,
        { method: 'DELETE', headers }
      );

      // 404 is OK - label might not exist
      if (!removeResponse.ok && removeResponse.status !== 404) {
        console.warn(`[update-labels] Failed to remove label ${label}:`, removeResponse.status);
      }
    }

    // Add new labels
    if (labelsToAdd.length > 0) {
      const addResponse = await fetch(
        `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ labels: labelsToAdd }),
        }
      );

      if (!addResponse.ok) {
        const errorText = await addResponse.text();
        console.error(`[update-labels] Failed to add labels:`, errorText);
        return NextResponse.json(
          { error: `Failed to add labels: ${addResponse.status}` },
          { status: addResponse.status }
        );
      }
    }

    console.log(`[update-labels] Updated issue #${issueNumber}:`, { priority, effort, value });
    return NextResponse.json({
      success: true,
      issueNumber,
      labelsRemoved: labelsToRemove,
      labelsAdded: labelsToAdd,
    });
  } catch (error) {
    console.error('[update-labels] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
