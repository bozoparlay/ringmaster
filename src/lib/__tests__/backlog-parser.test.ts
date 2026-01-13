/**
 * Unit tests for backlog-parser.ts
 *
 * Tests the critical functionality of preserving task metadata through
 * serialize/parse round-trips, which is essential for GitHub sync.
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

    it('should preserve lastSyncedAt through round-trip', () => {
      const syncTime = '2026-01-12T03:00:00Z';
      const originalTask: BacklogItem = {
        id: 'test-uuid-12345',
        title: 'Test Task with Sync Time',
        description: 'Test description',
        priority: 'medium',
        status: 'backlog',
        tags: [],
        category: 'Uncategorized',
        createdAt: '2026-01-12T03:00:00Z',
        updatedAt: '2026-01-12T03:00:00Z',
        order: 1,
        lastSyncedAt: syncTime,
      };

      const markdown = serializeBacklogMd([originalTask]);
      const parsedTasks = parseBacklogMd(markdown);

      expect(parsedTasks.length).toBe(1);
      expect(parsedTasks[0].lastSyncedAt).toBe(syncTime);
    });

    it('should preserve syncStatus through round-trip', () => {
      const originalTask: BacklogItem = {
        id: 'test-uuid-12345',
        title: 'Test Task with Sync Status',
        description: 'Test description',
        priority: 'medium',
        status: 'backlog',
        tags: [],
        category: 'Uncategorized',
        createdAt: '2026-01-12T03:00:00Z',
        updatedAt: '2026-01-12T03:00:00Z',
        order: 1,
        syncStatus: 'synced',
      };

      const markdown = serializeBacklogMd([originalTask]);
      const parsedTasks = parseBacklogMd(markdown);

      expect(parsedTasks.length).toBe(1);
      expect(parsedTasks[0].syncStatus).toBe('synced');
    });

    it('should preserve all sync metadata together through round-trip', () => {
      const originalTask: BacklogItem = {
        id: 'test-uuid-complete',
        title: 'Complete Sync Test Task',
        description: 'A task with all sync metadata',
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
        lastSyncedAt: '2026-01-12T04:00:00Z',
        syncStatus: 'synced',
      };

      const markdown = serializeBacklogMd([originalTask]);
      const parsedTasks = parseBacklogMd(markdown);

      expect(parsedTasks.length).toBe(1);
      const parsed = parsedTasks[0];

      // Core fields
      expect(parsed.id).toBe(originalTask.id);
      expect(parsed.title).toBe(originalTask.title);
      expect(parsed.priority).toBe(originalTask.priority);

      // Sync metadata
      expect(parsed.githubIssueNumber).toBe(originalTask.githubIssueNumber);
      expect(parsed.lastSyncedAt).toBe(originalTask.lastSyncedAt);
      expect(parsed.syncStatus).toBe(originalTask.syncStatus);
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
        lastSyncedAt: '2026-01-12T05:00:00Z',
        syncStatus: 'synced',
      };

      const markdown = serializeBacklogMd([task]);

      // Should contain metadata comment
      expect(markdown).toContain('<!-- ringmaster:id=abc-12345');
      expect(markdown).toContain('github=789');
      expect(markdown).toContain('synced=2026-01-12T05:00:00Z');
      expect(markdown).toContain('status=synced');
    });

    it('should parse metadata comment correctly', () => {
      const markdown = `# Backlog

## [backlog] Test

### My Task
<!-- ringmaster:id=test-id-999 github=111 synced=2026-01-12T06:00:00Z status=pending -->
**Priority**: High

**Description**:
Some description here.

---
`;

      const tasks = parseBacklogMd(markdown);

      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe('test-id-999');
      expect(tasks[0].githubIssueNumber).toBe(111);
      expect(tasks[0].lastSyncedAt).toBe('2026-01-12T06:00:00Z');
      expect(tasks[0].syncStatus).toBe('pending');
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
      // Sync fields should be undefined
      expect(tasks[0].githubIssueNumber).toBeUndefined();
      expect(tasks[0].lastSyncedAt).toBeUndefined();
      expect(tasks[0].syncStatus).toBeUndefined();
    });
  });
});
