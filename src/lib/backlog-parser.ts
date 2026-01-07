import { v4 as uuidv4 } from 'uuid';
import type { BacklogItem, Priority, Status, PRIORITY_WEIGHT } from '@/types/backlog';

/**
 * Parses a BACKLOG.md file into BacklogItem objects
 *
 * Expected format:
 * # Backlog
 *
 * ## [status] Task Title
 * **Priority:** high
 * **Tags:** tag1, tag2
 *
 * Description text here...
 *
 * ---
 */

const STATUS_MAP: Record<string, Status> = {
  'backlog': 'backlog',
  'ready': 'ready',
  'in progress': 'in_progress',
  'in_progress': 'in_progress',
  'review': 'review',
  'done': 'done',
};

const PRIORITY_MAP: Record<string, Priority> = {
  'critical': 'critical',
  'high': 'high',
  'medium': 'medium',
  'low': 'low',
  'someday': 'someday',
};

export function parseBacklogMd(content: string): BacklogItem[] {
  const items: BacklogItem[] = [];
  const sections = content.split(/^---+$/m).filter(s => s.trim());

  let order = 0;

  for (const section of sections) {
    const lines = section.trim().split('\n');

    // Look for ## [status] Title pattern
    const headerMatch = lines.find(l => l.startsWith('## '));
    if (!headerMatch) continue;

    const titleMatch = headerMatch.match(/^## \[([^\]]+)\]\s*(.+)$/);
    if (!titleMatch) {
      // Try without status bracket
      const simpleTitleMatch = headerMatch.match(/^## (.+)$/);
      if (simpleTitleMatch) {
        const item = parseSimpleSection(lines, simpleTitleMatch[1], order++);
        if (item) items.push(item);
      }
      continue;
    }

    const [, statusRaw, title] = titleMatch;
    const status = STATUS_MAP[statusRaw.toLowerCase()] || 'backlog';

    // Extract priority
    const priorityLine = lines.find(l => l.toLowerCase().startsWith('**priority:**'));
    const priorityMatch = priorityLine?.match(/\*\*priority:\*\*\s*(\w+)/i);
    const priority: Priority = priorityMatch
      ? (PRIORITY_MAP[priorityMatch[1].toLowerCase()] || 'medium')
      : 'medium';

    // Extract tags
    const tagsLine = lines.find(l => l.toLowerCase().startsWith('**tags:**'));
    const tagsMatch = tagsLine?.match(/\*\*tags:\*\*\s*(.+)/i);
    const tags = tagsMatch
      ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
      : [];

    // Extract ID if present
    const idLine = lines.find(l => l.toLowerCase().startsWith('**id:**'));
    const idMatch = idLine?.match(/\*\*id:\*\*\s*(.+)/i);
    const id = idMatch ? idMatch[1].trim() : uuidv4();

    // Everything else is description
    const descriptionLines = lines.filter(l =>
      !l.startsWith('## ') &&
      !l.toLowerCase().startsWith('**priority:**') &&
      !l.toLowerCase().startsWith('**tags:**') &&
      !l.toLowerCase().startsWith('**id:**') &&
      !l.toLowerCase().startsWith('**created:**') &&
      !l.toLowerCase().startsWith('**updated:**')
    );
    const description = descriptionLines.join('\n').trim();

    // Extract dates if present
    const createdLine = lines.find(l => l.toLowerCase().startsWith('**created:**'));
    const createdMatch = createdLine?.match(/\*\*created:\*\*\s*(.+)/i);
    const createdAt = createdMatch ? createdMatch[1].trim() : new Date().toISOString();

    const updatedLine = lines.find(l => l.toLowerCase().startsWith('**updated:**'));
    const updatedMatch = updatedLine?.match(/\*\*updated:\*\*\s*(.+)/i);
    const updatedAt = updatedMatch ? updatedMatch[1].trim() : new Date().toISOString();

    items.push({
      id,
      title: title.trim(),
      description,
      priority,
      status,
      tags,
      createdAt,
      updatedAt,
      order: order++,
    });
  }

  return items;
}

function parseSimpleSection(lines: string[], title: string, order: number): BacklogItem | null {
  const description = lines
    .filter(l => !l.startsWith('## ') && !l.startsWith('# '))
    .join('\n')
    .trim();

  if (!title.trim()) return null;

  return {
    id: uuidv4(),
    title: title.trim(),
    description,
    priority: 'medium',
    status: 'backlog',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order,
  };
}

export function serializeBacklogMd(items: BacklogItem[]): string {
  const lines: string[] = ['# Backlog\n'];

  // Sort by status, then priority, then order
  const sorted = [...items].sort((a, b) => {
    const statusOrder = ['backlog', 'ready', 'in_progress', 'review', 'done'];
    const statusDiff = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    if (statusDiff !== 0) return statusDiff;

    const priorityOrder = ['critical', 'high', 'medium', 'low', 'someday'];
    const priorityDiff = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    return a.order - b.order;
  });

  for (const item of sorted) {
    lines.push(`## [${item.status}] ${item.title}`);
    lines.push(`**ID:** ${item.id}`);
    lines.push(`**Priority:** ${item.priority}`);
    if (item.tags.length > 0) {
      lines.push(`**Tags:** ${item.tags.join(', ')}`);
    }
    lines.push(`**Created:** ${item.createdAt}`);
    lines.push(`**Updated:** ${item.updatedAt}`);
    lines.push('');
    if (item.description) {
      lines.push(item.description);
      lines.push('');
    }
    lines.push('---\n');
  }

  return lines.join('\n');
}

export function createNewItem(title: string, description: string = ''): BacklogItem {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title,
    description,
    priority: 'medium',
    status: 'backlog',
    tags: [],
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
  };
}
