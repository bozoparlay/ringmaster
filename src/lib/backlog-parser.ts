import { v4 as uuidv4 } from 'uuid';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';

/**
 * Parses a BACKLOG.md file into BacklogItem objects
 *
 * Expected format:
 * ## [status] 🎯 Category Name
 * **ID:** ...
 * **Priority:** ...
 * > Category description
 *
 * ### Subcategory (optional)
 *
 * #### Task Title
 * **Priority**: High | **Effort**: Medium | **Value**: High
 * **Description**: ...
 * ... more content ...
 *
 * ---
 */

const STATUS_MAP: Record<string, Status> = {
  'backlog': 'backlog',
  'ready': 'backlog',           // legacy mapping
  'in progress': 'in_progress',
  'in_progress': 'in_progress',
  'review': 'review',
  'done': 'ready_to_ship',      // legacy mapping
  'ready_to_ship': 'ready_to_ship',
};

const PRIORITY_MAP: Record<string, Priority> = {
  'critical': 'critical',
  'high': 'high',
  'medium': 'medium',
  'low': 'low',
  'someday': 'someday',
};

const EFFORT_MAP: Record<string, Effort> = {
  'low': 'low',
  'medium': 'medium',
  'high': 'high',
  'very high': 'very_high',
};

const VALUE_MAP: Record<string, Value> = {
  'low': 'low',
  'medium': 'medium',
  'high': 'high',
};

interface CategorySection {
  name: string;
  status: Status;
  content: string;
}

function extractCategorySections(content: string): CategorySection[] {
  const sections: CategorySection[] = [];

  // Try two formats:
  // 1. With status: ## [status] Name
  // 2. Without status: ## Name (assumes backlog)
  const categoryWithStatusRegex = /^## \[([^\]]+)\]\s*(.+)$/gm;
  const matchesWithStatus = [...content.matchAll(categoryWithStatusRegex)];

  if (matchesWithStatus.length > 0) {
    // Format with status markers
    for (let i = 0; i < matchesWithStatus.length; i++) {
      const match = matchesWithStatus[i];
      const statusRaw = match[1].toLowerCase();
      const name = match[2].trim();
      const status = STATUS_MAP[statusRaw] || 'backlog';

      const startIndex = match.index! + match[0].length;
      const endIndex = i < matchesWithStatus.length - 1 ? matchesWithStatus[i + 1].index! : content.length;
      const sectionContent = content.slice(startIndex, endIndex);

      sections.push({ name, status, content: sectionContent });
    }
  } else {
    // Original format without status markers - treat entire file as one section
    // Parse all content starting from first ## or ### header
    const firstHeader = content.search(/^##?\s+/m);
    if (firstHeader !== -1) {
      sections.push({
        name: 'Backlog',
        status: 'backlog',
        content: content.slice(firstHeader),
      });
    }
  }

  return sections;
}

function isActualTask(title: string, content: string): boolean {
  // A header is an actual task if:
  // 1. It has **Priority**: metadata (required for real tasks)
  // 2. It's NOT just a section header with a blockquote description

  const hasPriorityMeta = /\*\*Priority\*\*:\s*\w+\s*\|/.test(content);
  const isBlockquoteSection = /^\s*>\s*[A-Z]/.test(content.trim());
  const startsWithEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅🚨🐛🎯💡🔧🏗️📊🎨🔐📱🎮🌟]/u.test(title);

  // If it has effort/value metadata, it's definitely a task
  if (hasPriorityMeta) {
    return true;
  }

  // If it starts with emoji and has only a blockquote, it's a section header
  if (startsWithEmoji && isBlockquoteSection) {
    return false;
  }

  // If it has substantial content (description, requirements, etc.), it's a task
  const hasSubstantialContent = content.includes('**Description**:') ||
                                 content.includes('**Requirements**:') ||
                                 content.includes('**Current Issue**:') ||
                                 content.includes('**Issue**:') ||
                                 content.includes('**Solution**:') ||
                                 content.includes('**Features**:') ||
                                 content.length > 200;

  return hasSubstantialContent;
}

function isSectionHeader(title: string, content: string): boolean {
  // A section header typically:
  // 1. Starts with an emoji
  // 2. Has a blockquote description (> text) as its main content
  // 3. Doesn't have substantial task content
  const startsWithEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅🚨🐛🎯💡🔧🏗️📊🎨🔐📱🎮🌟]/u.test(title);
  const hasOnlyBlockquote = /^\s*(\*\*Priority\*\*:\s*\w+\s*\n+)?>\s*.+$/m.test(content.trim());
  const isShortContent = content.trim().length < 150;

  return startsWithEmoji && (hasOnlyBlockquote || isShortContent);
}

function extractParentCategory(content: string, taskIndex: number, allMatches: RegExpMatchArray[]): string | undefined {
  // Look backwards from this task to find its parent section header
  // A section header is a ### that starts with emoji or is followed by a blockquote
  for (let i = taskIndex - 1; i >= 0; i--) {
    const prevMatch = allMatches[i];
    const prevTitle = prevMatch[2].trim();

    // Get the content of the previous header
    const prevStartIndex = prevMatch.index! + prevMatch[0].length;
    const prevEndIndex = i < allMatches.length - 1 ? allMatches[i + 1].index! : content.length;
    const prevContent = content.slice(prevStartIndex, prevEndIndex);

    // Check if this is a section header (not a task)
    if (isSectionHeader(prevTitle, prevContent)) {
      // Return the section name (cleaned of emoji)
      return prevTitle.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅🚨🐛🎯💡🔧🏗️📊🎨🔐📱🎮🌟]+\s*/u, '').trim();
    }

    // Also check for non-emoji headers that act as categories (like "User Management")
    // These have no substantial content - just a newline before the next header
    const isEmptySection = prevContent.trim().length < 10 && !prevContent.includes('**');
    if (isEmptySection && prevMatch[1].length === 3) {
      return prevTitle;
    }
  }
  return undefined;
}

function extractTasksFromCategory(category: CategorySection, order: number): { items: BacklogItem[], nextOrder: number } {
  const items: BacklogItem[] = [];
  let currentOrder = order;

  // Clean the category name (remove emoji prefix for tag)
  const categoryTag = category.name.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅🚨🐛🎯💡🔧🏗️📊🎨🔐📱🎮🌟]+\s*/u, '').trim() || category.name;

  // Find all headers (### or ####)
  const headerRegex = /^(#{3,4})\s+(.+)$/gm;
  const allMatches = [...category.content.matchAll(headerRegex)];

  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    const headerLevel = match[1].length;
    const title = match[2].trim();

    // Get content until next header or section end
    const startIndex = match.index! + match[0].length;
    const endIndex = i < allMatches.length - 1 ? allMatches[i + 1].index! : category.content.length;
    const taskContent = category.content.slice(startIndex, endIndex);

    // Check if this is an actual task vs a section header
    if (!isActualTask(title, taskContent)) {
      continue;
    }

    // Parse metadata from inline format: **Priority**: High | **Effort**: Medium | **Value**: High
    const metaMatch = taskContent.match(/\*\*Priority\*\*:\s*(\w+)(?:\s*\|\s*\*\*Effort\*\*:\s*([^|*\n]+))?(?:\s*\|\s*\*\*Value\*\*:\s*(\w+))?/i);

    let priority: Priority = 'medium';
    let effort: Effort | undefined;
    let value: Value | undefined;

    if (metaMatch) {
      priority = PRIORITY_MAP[metaMatch[1].toLowerCase()] || 'medium';
      if (metaMatch[2]) {
        effort = EFFORT_MAP[metaMatch[2].trim().toLowerCase()];
      }
      if (metaMatch[3]) {
        value = VALUE_MAP[metaMatch[3].toLowerCase()];
      }
    }

    // Extract git workflow fields
    const branchMatch = taskContent.match(/\*\*Branch\*\*:\s*(.+)/i);
    const worktreeMatch = taskContent.match(/\*\*Worktree\*\*:\s*(.+)/i);
    const reviewFeedbackMatch = taskContent.match(/>\s*\*\*Review Feedback\*\*:\s*\n((?:>\s*.+\n?)+)/i);

    const branch = branchMatch ? branchMatch[1].trim() : undefined;
    const worktreePath = worktreeMatch ? worktreeMatch[1].trim() : undefined;
    const reviewFeedback = reviewFeedbackMatch
      ? reviewFeedbackMatch[1].replace(/^>\s*/gm, '').trim()
      : undefined;

    // Extract description - everything after the metadata line
    let description = taskContent
      .replace(/\*\*Priority\*\*:\s*[^\n]+/i, '') // Remove priority line
      .replace(/\*\*Created\*\*:\s*[^\n]+/i, '') // Remove created line
      .replace(/\*\*Branch\*\*:\s*[^\n]+/i, '') // Remove branch line
      .replace(/\*\*Worktree\*\*:\s*[^\n]+/i, '') // Remove worktree line
      .replace(/>\s*\*\*Review Feedback\*\*:\s*\n((?:>\s*.+\n?)+)/i, '') // Remove review feedback
      .replace(/^\s*\n/, '') // Remove leading newline
      .trim();

    // Determine the category for this task
    // Look backward for the nearest section header (emoji header or empty category header)
    let taskCategory = categoryTag;
    const parentCat = extractParentCategory(category.content, i, allMatches);
    if (parentCat) {
      taskCategory = parentCat;
    }

    const now = new Date().toISOString();

    items.push({
      id: uuidv4(),
      title,
      description,
      priority,
      effort,
      value,
      status: category.status,
      tags: taskCategory ? [taskCategory] : [],
      category: taskCategory || undefined,
      createdAt: now,
      updatedAt: now,
      order: currentOrder++,
      // Git workflow fields
      branch,
      worktreePath,
      reviewFeedback,
    });
  }

  return { items, nextOrder: currentOrder };
}

export function parseBacklogMd(content: string): BacklogItem[] {
  const allItems: BacklogItem[] = [];
  let order = 0;

  const categories = extractCategorySections(content);

  for (const category of categories) {
    const { items, nextOrder } = extractTasksFromCategory(category, order);
    allItems.push(...items);
    order = nextOrder;
  }

  return allItems;
}

export function serializeBacklogMd(items: BacklogItem[]): string {
  const lines: string[] = ['# Backlog\n'];

  // Group by status first, then by category within each status
  const byStatus = new Map<string, Map<string, BacklogItem[]>>();
  const statusOrder = ['backlog', 'in_progress', 'review', 'ready_to_ship'];

  for (const status of statusOrder) {
    byStatus.set(status, new Map());
  }

  for (const item of items) {
    const cat = item.category || 'Uncategorized';
    const statusMap = byStatus.get(item.status) || byStatus.get('backlog')!;
    if (!statusMap.has(cat)) {
      statusMap.set(cat, []);
    }
    statusMap.get(cat)!.push(item);
  }

  // Serialize each status section
  for (const [status, categoryMap] of byStatus) {
    if (categoryMap.size === 0) continue;

    // Sort categories alphabetically, but put Uncategorized last
    const sortedCategories = [...categoryMap.keys()].sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });

    for (const category of sortedCategories) {
      const categoryItems = categoryMap.get(category)!;
      if (categoryItems.length === 0) continue;

      // Sort items by priority weight, then order
      const sorted = [...categoryItems].sort((a, b) => {
        const priorityOrder = ['critical', 'high', 'medium', 'low', 'someday'];
        const priorityDiff = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });

      // Write status + category header
      lines.push(`## [${status}] ${category}`);
      lines.push('');

      for (const item of sorted) {
        lines.push(`### ${item.title}`);

        // Write metadata line
        const metaParts = [`**Priority**: ${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}`];
        if (item.effort) {
          const effortLabel = item.effort === 'very_high' ? 'Very High' : item.effort.charAt(0).toUpperCase() + item.effort.slice(1);
          metaParts.push(`**Effort**: ${effortLabel}`);
        }
        if (item.value) {
          metaParts.push(`**Value**: ${item.value.charAt(0).toUpperCase() + item.value.slice(1)}`);
        }
        lines.push(metaParts.join(' | '));

        // Write git workflow fields if present
        if (item.branch) {
          lines.push(`**Branch**: ${item.branch}`);
        }
        if (item.worktreePath) {
          lines.push(`**Worktree**: ${item.worktreePath}`);
        }
        lines.push('');

        if (item.description) {
          lines.push(item.description);
          lines.push('');
        }

        // Write review feedback if present (typically after failed review)
        if (item.reviewFeedback) {
          lines.push('> **Review Feedback**:');
          lines.push(`> ${item.reviewFeedback.split('\n').join('\n> ')}`);
          lines.push('');
        }
      }

      lines.push('---\n');
    }
  }

  return lines.join('\n');
}

export function createNewItem(title: string, description: string = '', category?: string): BacklogItem {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title,
    description,
    priority: 'medium',
    status: 'backlog',
    tags: category ? [category] : [],
    category,
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
  };
}
