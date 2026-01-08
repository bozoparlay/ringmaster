import type { BacklogItem } from '@/types/backlog';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  completeness: number; // 0-100 percentage
}

/**
 * Validates a task against the strict template requirements
 */
export function validateTask(task: BacklogItem): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let filledFields = 0;
  const totalFields = 5; // title, description, priority, effort, value, acceptanceCriteria

  // Required: Title
  if (!task.title || task.title.trim().length < 5) {
    errors.push({
      field: 'title',
      message: 'Title must be at least 5 characters',
      severity: 'error',
    });
  } else {
    filledFields++;
  }

  // Required: Description (at least 20 chars)
  if (!task.description || task.description.trim().length < 20) {
    errors.push({
      field: 'description',
      message: 'Description must be at least 20 characters',
      severity: 'error',
    });
  } else {
    filledFields++;
  }

  // Required: Priority (always has a default, so just check it's set)
  if (task.priority) {
    filledFields++;
  }

  // Recommended: Effort
  if (!task.effort) {
    warnings.push({
      field: 'effort',
      message: 'Effort estimate is recommended',
      severity: 'warning',
    });
  } else {
    filledFields++;
  }

  // Recommended: Value
  if (!task.value) {
    warnings.push({
      field: 'value',
      message: 'Value estimate is recommended',
      severity: 'warning',
    });
  } else {
    filledFields++;
  }

  // Required: Acceptance Criteria (at least 1)
  if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
    errors.push({
      field: 'acceptanceCriteria',
      message: 'At least one acceptance criterion is required',
      severity: 'error',
    });
  } else {
    filledFields++;
  }

  const completeness = Math.round((filledFields / totalFields) * 100);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completeness,
  };
}

/**
 * Checks if a task needs cleanup (doesn't follow the strict template)
 */
export function taskNeedsCleanup(task: BacklogItem): boolean {
  const result = validateTask(task);
  return !result.valid || result.completeness < 100;
}

/**
 * Returns a list of missing or incomplete fields for a task
 */
export function getMissingFields(task: BacklogItem): string[] {
  const missing: string[] = [];

  if (!task.description || task.description.trim().length < 20) {
    missing.push('description');
  }

  if (!task.effort) {
    missing.push('effort');
  }

  if (!task.value) {
    missing.push('value');
  }

  if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
    missing.push('acceptanceCriteria');
  }

  return missing;
}

/**
 * Generates a template for what a task should look like
 */
export function getTaskTemplate(): string {
  return `### Task Title
**Priority**: Medium | **Effort**: Medium | **Value**: High

**Description**:
[What is this task? 2-3 sentences explaining the problem or feature]

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Notes**:
[Additional context, links, technical considerations]`;
}
