export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'someday';

export type Effort = 'trivial' | 'low' | 'medium' | 'high' | 'very_high';

export type Value = 'low' | 'medium' | 'high';

export type Status = 'backlog' | 'up_next' | 'in_progress' | 'review' | 'ready_to_ship';

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  effort?: Effort;
  value?: Value;
  status: Status;
  tags: string[];
  category?: string; // Parent category like "High Priority Features"
  createdAt: string;
  updatedAt: string;
  order: number;
  // Structured task fields
  acceptanceCriteria?: string[];  // List of acceptance criteria (checkboxes)
  notes?: string;                 // Additional context, links, technical notes
  // Git workflow fields
  branch?: string;           // Git branch name (e.g., "task/abc12345-feature-name")
  worktreePath?: string;     // Path to git worktree (e.g., ".tasks/task-abc12345")
  reviewFeedback?: string;   // Feedback from code review if it failed
  // GitHub issue reference (for linking, not sync)
  githubIssueNumber?: number;    // Linked GitHub issue number (simple reference)
  githubIssueUrl?: string;       // Full URL for quick access
  // Quality tracking (computed on load, not persisted)
  qualityScore?: number;     // 0-100 quality score
  qualityIssues?: string[];  // List of quality issues found
}

export interface Column {
  id: Status;
  title: string;
  items: BacklogItem[];
}

export interface BacklogState {
  items: BacklogItem[];
  columns: Column[];
  selectedItem: BacklogItem | null;
  isEditing: boolean;
}

// Priority weights for sorting
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  someday: 4,
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  someday: 'Someday',
};

export const EFFORT_LABELS: Record<Effort, string> = {
  trivial: 'Trivial',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very High',
};

export const VALUE_LABELS: Record<Value, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  up_next: 'Up Next',
  in_progress: 'In Progress',
  review: 'Review',
  ready_to_ship: 'Ready to Ship',
};

export const COLUMN_ORDER: Status[] = ['backlog', 'up_next', 'in_progress', 'review', 'ready_to_ship'];

// Maximum items shown in Up Next column
export const UP_NEXT_LIMIT = 5;
