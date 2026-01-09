import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { parseBacklogMd, serializeBacklogMd } from '@/lib/backlog-parser';
import { validateTaskQuality } from '@/lib/task-quality';
import type { BacklogItem } from '@/types/backlog';

// Default path to BACKLOG.md - can be overridden via query param or BACKLOG_PATH env var
// When running from worktree (.tasks/task-xxx), go up two levels to find main BACKLOG.md
const DEFAULT_BACKLOG_PATH = process.env.BACKLOG_PATH || './BACKLOG.md';

function getBacklogPath(customPath?: string | null): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  return path.resolve(process.cwd(), DEFAULT_BACKLOG_PATH);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customPath = searchParams.get('path');
    const backlogPath = getBacklogPath(customPath);

    if (!existsSync(backlogPath)) {
      // Return empty backlog if file doesn't exist
      return NextResponse.json({
        items: [],
        path: backlogPath,
        exists: false,
      });
    }

    const content = await readFile(backlogPath, 'utf-8');
    const items = parseBacklogMd(content);

    // Compute quality scores for each item (catches offline-created tasks)
    const itemsWithQuality = items.map(item => {
      const quality = validateTaskQuality(item.title, item.description || '', item.acceptanceCriteria);
      return {
        ...item,
        qualityScore: quality.score,
        qualityIssues: quality.issues,
      };
    });

    // Log any low-quality tasks found
    const lowQualityCount = itemsWithQuality.filter(i => (i.qualityScore ?? 100) < 50).length;
    if (lowQualityCount > 0) {
      console.log(`[backlog] Found ${lowQualityCount} low-quality tasks that may need improvement`);
    }

    return NextResponse.json({
      items: itemsWithQuality,
      path: backlogPath,
      exists: true,
    });
  } catch (error) {
    console.error('Error reading backlog:', error);
    return NextResponse.json(
      { error: 'Failed to read backlog file' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customPath = searchParams.get('path');
    const backlogPath = getBacklogPath(customPath);

    const { items } = (await request.json()) as { items: BacklogItem[] };

    console.log('Serializing items:', items.length, 'items');
    console.log('Item statuses:', items.map(i => i.status));

    const content = serializeBacklogMd(items);
    await writeFile(backlogPath, content, 'utf-8');

    return NextResponse.json({
      success: true,
      path: backlogPath,
      itemCount: items.length,
    });
  } catch (error) {
    console.error('Error writing backlog:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Failed to write backlog file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customPath = searchParams.get('path');
    const backlogPath = getBacklogPath(customPath);

    const { item } = (await request.json()) as { item: BacklogItem };

    // Read existing items
    let items: BacklogItem[] = [];
    if (existsSync(backlogPath)) {
      const content = await readFile(backlogPath, 'utf-8');
      items = parseBacklogMd(content);
    }

    // Update or add item
    const existingIndex = items.findIndex(i => i.id === item.id);
    if (existingIndex >= 0) {
      items[existingIndex] = { ...item, updatedAt: new Date().toISOString() };
    } else {
      items.push(item);
    }

    // Write back
    const content = serializeBacklogMd(items);
    await writeFile(backlogPath, content, 'utf-8');

    return NextResponse.json({
      success: true,
      item: items.find(i => i.id === item.id),
    });
  } catch (error) {
    console.error('Error updating backlog item:', error);
    return NextResponse.json(
      { error: 'Failed to update backlog item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customPath = searchParams.get('path');
    const itemId = searchParams.get('id');
    const backlogPath = getBacklogPath(customPath);

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Read existing items
    if (!existsSync(backlogPath)) {
      return NextResponse.json(
        { error: 'Backlog file not found' },
        { status: 404 }
      );
    }

    const content = await readFile(backlogPath, 'utf-8');
    let items = parseBacklogMd(content);

    // Remove item
    items = items.filter(i => i.id !== itemId);

    // Write back
    const newContent = serializeBacklogMd(items);
    await writeFile(backlogPath, newContent, 'utf-8');

    return NextResponse.json({
      success: true,
      itemCount: items.length,
    });
  } catch (error) {
    console.error('Error deleting backlog item:', error);
    return NextResponse.json(
      { error: 'Failed to delete backlog item' },
      { status: 500 }
    );
  }
}
