/**
 * Unit tests for backlog-parser.ts
 *
 * Tests the critical functionality of preserving task metadata through
 * serialize/parse round-trips, which is essential for BACKLOG.md persistence.
 */

import { parseBacklogMd, serializeBacklogMd } from '../backlog-parser';
import type { BacklogItem } from '@/types/backlog';

describe('backlog-parser', () => {
  describe('metadata preservation (AC2)', () => {
    it('should preserve task id through round-trip', () => {
      const originalTask: BacklogItem = {
        id: 'test-uuid-12345',
        title: 'Test Task',
        description: 'Test description',
        priority: 'high',
        status: 'backlog',
        tags: ['Test Category'],
        category: 'Test Category',
        createdAt: '2026-01-12T03:00:00Z',
        updatedAt: '2026-01-12T03:00:00Z',
        order: 1,
      };

      const markdown = serializeBacklogMd([originalTask]);
      const parsedTasks = parseBacklogMd(markdown);

      expect(parsedTasks.length).toBe(1);
      expect(parsedTasks[0].id).toBe(originalTask.id);
    });

    it('should preserve githubIssueNumber through round-trip', () => {
      const originalTask: BacklogItem = {
        id: 'test-uuid-12345',
        title: 'Test Task with GitHub Issue',
        description: 'Test description',
        priority: 'medium',
        status: 'backlog',
        tags: [],
        category: 'Uncategorized',
        createdAt: '2026-01-12T03:00:00Z',
        updatedAt: '2026-01-12T03:00:00Z',
        order: 1,
        githubIssueNumber: 123,
      };

      const markdown = serializeBacklogMd([originalTask]);
      const parsedTasks = parseBacklogMd(markdown);

      expect(parsedTasks.length).toBe(1);
      expect(parsedTasks[0].githubIssueNumber).toBe(123);
    });

    it('should preserve all metadata together through round-trip', () => {
      const originalTask: BacklogItem = {
        id: 'test-uuid-complete',
        title: 'Complete Test Task',
        description: 'A task with all metadata',
        priority: 'high',
        effort: 'medium',
        value: 'high',
        status: 'backlog',
        tags: ['Feature'],
        category: 'Feature',
        createdAt: '2026-01-12T03:00:00Z',
        updatedAt: '2026-01-12T03:00:00Z',
        order: 1,
        githubIssueNumber: 456,
      };

      const markdown = serializeBacklogMd([originalTask]);
      const parsedTasks = parseBacklogMd(markdown);

      expect(parsedTasks.length).toBe(1);
      const parsed = parsedTasks[0];

      // Core fields
      expect(parsed.id).toBe(originalTask.id);
      expect(parsed.title).toBe(originalTask.title);
      expect(parsed.priority).toBe(originalTask.priority);

      // GitHub link
      expect(parsed.githubIssueNumber).toBe(originalTask.githubIssueNumber);
    });
  });

  describe('metadata comment format', () => {
    it('should generate metadata comment in correct format', () => {
      const task: BacklogItem = {
        id: 'abc-12345',
        title: 'Test Task',
        description: 'Description',
        priority: 'medium',
        status: 'backlog',
        tags: [],
        category: 'Uncategorized',
        createdAt: '2026-01-12T03:00:00Z',
        updatedAt: '2026-01-12T03:00:00Z',
        order: 1,
        githubIssueNumber: 789,
      };

      const markdown = serializeBacklogMd([task]);

      // Should contain metadata comment with id and github number
      expect(markdown).toContain('<!-- ringmaster:id=abc-12345');
      expect(markdown).toContain('github=789');
    });

    it('should parse metadata comment correctly', () => {
      const markdown = `# Backlog

## [backlog] Test

### My Task
<!-- ringmaster:id=test-id-999 github=111 -->
**Priority**: High

**Description**:
Some description here.

---
`;

      const tasks = parseBacklogMd(markdown);

      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe('test-id-999');
      expect(tasks[0].githubIssueNumber).toBe(111);
    });

    it('should generate new UUID only when no existing id in metadata', () => {
      const markdownWithoutId = `# Backlog

## [backlog] Test

### New Task Without ID
**Priority**: Medium

**Description**:
A brand new task.

---
`;

      const tasks = parseBacklogMd(markdownWithoutId);

      expect(tasks.length).toBe(1);
      // Should have a UUID (36 chars with dashes)
      expect(tasks[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('backwards compatibility', () => {
    it('should parse tasks without metadata comments (legacy format)', () => {
      const legacyMarkdown = `# Backlog

## [backlog] Features

### Legacy Task
**Priority**: High | **Effort**: Medium

**Description**:
This is a legacy task without metadata comments.

---
`;

      const tasks = parseBacklogMd(legacyMarkdown);

      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Legacy Task');
      expect(tasks[0].priority).toBe('high');
      expect(tasks[0].effort).toBe('medium');
      // Should have generated new UUID
      expect(tasks[0].id).toBeDefined();
      expect(tasks[0].id.length).toBeGreaterThan(0);
      // GitHub link should be undefined for legacy tasks
      expect(tasks[0].githubIssueNumber).toBeUndefined();
    });
  });
});
