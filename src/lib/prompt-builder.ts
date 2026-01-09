/**
 * Canonical prompt builder for Claude Code task context.
 *
 * This is the SINGLE SOURCE OF TRUTH for generating task prompts.
 * Used by both the tackle-task API and the TackleModal preview.
 */

export interface TaskPromptInput {
  title: string;
  priority?: string;
  category?: string;
  tags?: string[];
  description?: string;
  acceptanceCriteria?: string[];
  notes?: string;
  effort?: string;
  value?: string;
  branch?: string;
}

export interface TaskPromptOptions {
  /**
   * Show placeholder text for empty optional fields.
   * When true (default for preview), shows "No description provided." etc.
   * When false (for API), omits empty sections entirely.
   */
  showPlaceholders?: boolean;

  /**
   * Show branch placeholder when branch is not yet assigned.
   * Useful for preview mode before worktree creation.
   */
  showBranchPlaceholder?: boolean;
}

/**
 * Builds a structured prompt for Claude Code from task data.
 *
 * The prompt follows a consistent format:
 * - H1 header with task title
 * - Metadata line (Priority | Effort | Value)
 * - Category and tags
 * - Branch (if assigned or placeholder)
 * - Description section
 * - Acceptance Criteria section (numbered list)
 * - Notes section
 */
export function buildTaskPrompt(
  task: TaskPromptInput,
  options: TaskPromptOptions = {}
): string {
  const { showPlaceholders = false, showBranchPlaceholder = false } = options;
  const sections: string[] = [];

  // Header
  sections.push(`# Task: ${task.title}`);

  // Metadata line - compact display of key metrics
  const metadata: string[] = [];
  if (task.priority) metadata.push(`Priority: ${task.priority}`);
  if (task.effort) metadata.push(`Effort: ${task.effort}`);
  if (task.value) metadata.push(`Value: ${task.value}`);
  if (metadata.length > 0) {
    sections.push(metadata.join(' | '));
  }

  if (task.category) {
    sections.push(`Category: ${task.category}`);
  }

  if (task.tags && task.tags.length > 0) {
    sections.push(`Tags: ${task.tags.join(', ')}`);
  }

  // Branch - show actual branch or placeholder for preview
  if (task.branch) {
    sections.push(`Branch: ${task.branch}`);
  } else if (showBranchPlaceholder) {
    sections.push(`Branch: Auto-generated on launch`);
  }

  // Description section
  if (task.description) {
    sections.push('');
    sections.push('## Description');
    sections.push(task.description);
  } else if (showPlaceholders) {
    sections.push('');
    sections.push('## Description');
    sections.push('No description provided.');
  }

  // Acceptance Criteria - critical for Claude to understand success conditions
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    sections.push('');
    sections.push('## Acceptance Criteria');
    task.acceptanceCriteria.forEach((criterion, index) => {
      sections.push(`${index + 1}. ${criterion}`);
    });
  }

  // Notes - additional context, links, findings
  if (task.notes) {
    sections.push('');
    sections.push('## Notes');
    sections.push(task.notes);
  }

  return sections.join('\n');
}

/**
 * Builds a conversational prompt for pasting into an existing Claude chat.
 * This wraps the task data in natural language context.
 */
export function buildConversationalPrompt(task: TaskPromptInput): string {
  const parts: string[] = [];

  parts.push(`I need to work on the following task from my backlog:`);
  parts.push('');
  parts.push(`**Task:** ${task.title}`);
  if (task.priority) parts.push(`**Priority:** ${task.priority}`);
  if (task.effort) parts.push(`**Effort:** ${task.effort}`);
  if (task.value) parts.push(`**Value:** ${task.value}`);
  if (task.tags && task.tags.length > 0) {
    parts.push(`**Tags:** ${task.tags.join(', ')}`);
  }
  parts.push('');
  parts.push(`**Description:**`);
  parts.push(task.description || 'No description provided.');

  // Include acceptance criteria - critical context for understanding success
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    parts.push('');
    parts.push(`**Acceptance Criteria:**`);
    task.acceptanceCriteria.forEach((criterion, index) => {
      parts.push(`${index + 1}. ${criterion}`);
    });
  }

  // Include notes if present
  if (task.notes) {
    parts.push('');
    parts.push(`**Notes:**`);
    parts.push(task.notes);
  }

  parts.push('');
  parts.push(`Please help me:`);
  parts.push(`1. Understand what needs to be done`);
  parts.push(`2. Create a detailed implementation plan`);
  parts.push(`3. Identify the files that need to be modified`);
  parts.push(`4. Start implementing the solution`);
  parts.push('');
  parts.push(`Let's begin by exploring the codebase to understand the current state and then create a plan.`);

  return parts.join('\n');
}
