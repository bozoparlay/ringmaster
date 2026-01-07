export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'someday';

export type Status = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  order: number; // For sorting within a column
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

export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

export const COLUMN_ORDER: Status[] = ['backlog', 'ready', 'in_progress', 'review', 'done'];
