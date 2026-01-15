/**
 * CRUD operations for workspaces table.
 */

import { eq, and, lt, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb, workspaces, type Workspace, type NewWorkspace } from './index';
import type { TaskSource } from './executions';

export type CleanupPolicy = 'auto' | 'pinned' | 'manual';

interface CreateWorkspaceParams {
  taskSource: TaskSource;
  taskId: string;
  worktreePath: string;
  branch: string;
  cleanupPolicy?: CleanupPolicy;
}

/**
 * Create or update a workspace record.
 */
export async function upsertWorkspace(params: CreateWorkspaceParams): Promise<Workspace> {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if workspace already exists for this task
  const existing = await db
    .select()
    .from(workspaces)
    .where(
      and(eq(workspaces.taskSource, params.taskSource), eq(workspaces.taskId, params.taskId))
    );

  if (existing[0]) {
    // Update existing workspace
    await db
      .update(workspaces)
      .set({
        worktreePath: params.worktreePath,
        branch: params.branch,
        touchedAt: now,
      })
      .where(eq(workspaces.id, existing[0].id));

    return {
      ...existing[0],
      worktreePath: params.worktreePath,
      branch: params.branch,
      touchedAt: now,
    };
  }

  // Create new workspace
  const id = uuidv4();
  const newWorkspace: NewWorkspace = {
    id,
    taskSource: params.taskSource,
    taskId: params.taskId,
    worktreePath: params.worktreePath,
    branch: params.branch,
    cleanupPolicy: params.cleanupPolicy || 'auto',
    createdAt: now,
    touchedAt: now,
  };

  await db.insert(workspaces).values(newWorkspace);

  return newWorkspace as Workspace;
}

/**
 * Get a workspace by task.
 */
export async function getWorkspaceForTask(
  taskSource: TaskSource,
  taskId: string
): Promise<Workspace | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.taskSource, taskSource), eq(workspaces.taskId, taskId)));
  return result[0] || null;
}

/**
 * Get all workspaces.
 */
export async function getAllWorkspaces(): Promise<Workspace[]> {
  const db = getDb();
  return db.select().from(workspaces);
}

/**
 * Update the touched_at timestamp (called when task is viewed).
 */
export async function touchWorkspace(workspaceId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.update(workspaces).set({ touchedAt: now }).where(eq(workspaces.id, workspaceId));
}

/**
 * Update cleanup policy for a workspace.
 */
export async function setCleanupPolicy(
  workspaceId: string,
  policy: CleanupPolicy
): Promise<void> {
  const db = getDb();
  await db.update(workspaces).set({ cleanupPolicy: policy }).where(eq(workspaces.id, workspaceId));
}

/**
 * Pin a workspace (prevent auto-cleanup).
 */
export async function pinWorkspace(workspaceId: string): Promise<void> {
  await setCleanupPolicy(workspaceId, 'pinned');
}

/**
 * Unpin a workspace (allow auto-cleanup).
 */
export async function unpinWorkspace(workspaceId: string): Promise<void> {
  await setCleanupPolicy(workspaceId, 'auto');
}

/**
 * Get workspaces eligible for cleanup based on retention policy.
 */
export async function getCleanupCandidates(retentionHours: number): Promise<Workspace[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();

  return db
    .select()
    .from(workspaces)
    .where(and(lt(workspaces.touchedAt, cutoff), ne(workspaces.cleanupPolicy, 'pinned')));
}

/**
 * Delete a workspace record (after worktree is removed).
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const db = getDb();
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

/**
 * Delete workspace by task reference.
 */
export async function deleteWorkspaceByTask(
  taskSource: TaskSource,
  taskId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(workspaces)
    .where(and(eq(workspaces.taskSource, taskSource), eq(workspaces.taskId, taskId)));
}
