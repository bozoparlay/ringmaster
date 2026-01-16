# Review Pipeline Spec: AI Review → Human Review

## Status
- **Phase 0 (Quick Wins)**: ✅ Complete (3 of 4 shipped, complexity removed as redundant)
- **Phase 1+ (Full Pipeline)**: Not started

## Overview

Transform ringmaster's single "Review" column into a two-stage pipeline:
1. **AI Review** - Auto-triggered, runs code analysis
2. **Human Review** - Manual approval gate before shipping

Remove the "Up Next" column but keep the gold star indicator for priority tasks.

## New Column Structure

```
Backlog → In Progress → AI Review → Human Review → Ready to Ship
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI Review trigger | Auto on drag | Reduces friction, immediate feedback |
| Review scope | Full implementation | Code + tests + lint for complete picture |
| Results display | Badge + detail modal | Quick glance + deep dive when needed |
| Failed review flow | Stay in column, needs-action indicator | Human decides when to return to coding |

---

## Phase 1: Data Model Changes

### File: `src/types/backlog.ts`

#### 1.1 Update Status Type
```typescript
// FROM:
export type Status = 'backlog' | 'up_next' | 'in_progress' | 'review' | 'ready_to_ship';

// TO:
export type Status = 'backlog' | 'in_progress' | 'ai_review' | 'human_review' | 'ready_to_ship';
```

#### 1.2 Add AI Review Result Interface
```typescript
// AI Review results (stored on BacklogItem)
aiReviewResult?: {
  passed: boolean;
  summary: string;
  score: number;  // 0-100
  issues: Array<{
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    file?: string;
    line?: number;
    message: string;
  }>;
  completedAt: string;
};

// Human review state
humanReviewStatus?: 'pending' | 'approved' | 'needs_action';
humanReviewNotes?: string;
```

#### 1.3 Update Constants
```typescript
export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  ai_review: 'AI Review',
  human_review: 'Human Review',
  ready_to_ship: 'Ready to Ship',
};

export const COLUMN_ORDER: Status[] = [
  'backlog',
  'in_progress',
  'ai_review',
  'human_review',
  'ready_to_ship'
];

// Remove UP_NEXT_LIMIT constant
```

---

## Phase 2: Remove Up Next Column Logic

### File: `src/components/views/BacklogView.tsx`

#### 2.1 Remove Up Next Utilities
Delete these functions/constants:
- `UP_NEXT_CONFIG`
- `downgradePriority()`
- `upgradePriority()`
- `calculateUpNextLimit()`

#### 2.2 Simplify Column Data
- Remove `up_next` from columns object
- Remove `upNextItemIds` computation
- Remove Up Next selection logic
- Keep sort logic for remaining columns

#### 2.3 Update Drag Handlers
- Remove backlog↔up_next priority manipulation
- Change `review` → `ai_review` in status checks
- Auto-trigger AI review when dropping into `ai_review` column

---

## Phase 3: AI Review Auto-Trigger

### File: `src/components/views/BacklogView.tsx`

#### 3.1 Auto-trigger on Drag
```typescript
if (targetStatus === 'ai_review' && activeItem.status === 'in_progress') {
  const updatedItem = { ...activeItem, status: 'ai_review' as Status };
  await onUpdateItem(updatedItem);
  triggerAIReview(updatedItem);  // Fire-and-forget
  return;
}
```

#### 3.2 Store Results on Task
Update `triggerReview()` to:
- Save `aiReviewResult` to the task
- Auto-advance to `human_review` if passed
- Keep in `ai_review` with indicator if failed

---

## Phase 4: TaskCard Updates

### File: `src/components/TaskCard.tsx`

#### 4.1 Rename Props
```typescript
interface TaskCardProps {
  item: BacklogItem;
  onClick: () => void;
  isDragging?: boolean;
  isStarred?: boolean;  // Renamed from isInUpNext
}
```

#### 4.2 AI Review Score Badge
Already implemented in Phase 0 using `reviewScore` and `reviewPassed` fields.
For Phase 1, could optionally switch to reading from `aiReviewResult.score`.

#### 4.3 Human Review Needs-Action Indicator
```tsx
{item.humanReviewStatus === 'needs_action' && (
  <div
    className="absolute top-1/2 -left-3 -translate-y-1/2 w-2 h-2 bg-orange-500 rounded-full animate-pulse"
    title="Needs attention - drag back to In Progress"
  />
)}
```

---

## Phase 5: Human Review Flow

### File: `src/components/views/BacklogView.tsx`

#### 5.1 Approve Handler
```typescript
const handleHumanApprove = async (item: BacklogItem) => {
  await onUpdateItem({
    ...item,
    status: 'ready_to_ship',
    humanReviewStatus: 'approved',
  });
  showToast('Approved! Task ready to ship.', 'success');
};
```

#### 5.2 Reject Handler
```typescript
const handleHumanReject = async (item: BacklogItem, feedback: string) => {
  await onUpdateItem({
    ...item,
    humanReviewStatus: 'needs_action',
    reviewFeedback: feedback,
  });
  showToast('Task needs attention. Drag to In Progress when ready.', 'info');
};
```

#### 5.3 Clear State on Return
When dragging from `human_review` back to `in_progress`:
```typescript
await onUpdateItem({
  ...item,
  status: 'in_progress',
  aiReviewResult: undefined,
  humanReviewStatus: undefined,
});
```

---

## Phase 6: Modal Updates

### Rename `ReviewModal.tsx` → `AIReviewModal.tsx`
- Keep existing review display
- Change "Continue" to "Send to Human Review"
- Add score display at top

### New File: `HumanReviewModal.tsx`
- Show AI Review summary (passed/score/issues count)
- Optional diff view
- Action buttons:
  - "Approve & Ship" → `ready_to_ship`
  - "Request Changes" → stays with `needs_action`
- Notes field for reviewer comments

---

## Phase 7: Column Styling

### File: `src/components/KanbanColumn.tsx`

```typescript
const columnAccents: Record<Status, string> = {
  backlog: 'from-surface-600/10',
  in_progress: 'from-blue-500/10',
  ai_review: 'from-purple-500/10',
  human_review: 'from-cyan-500/10',
  ready_to_ship: 'from-green-500/10',
};

const columnDots: Record<Status, string> = {
  backlog: 'bg-surface-500',
  in_progress: 'bg-blue-500',
  ai_review: 'bg-purple-500',
  human_review: 'bg-cyan-500',
  ready_to_ship: 'bg-green-500',
};
```

---

## State Machine

```
                    ┌─────────────┐
                    │   Backlog   │
                    └──────┬──────┘
                           │ drag
                           ▼
                    ┌─────────────┐
                    │ In Progress │◄────────────────┐
                    └──────┬──────┘                 │
                           │ drag (auto-trigger)   │
                           ▼                        │
                    ┌─────────────┐                 │
                    │  AI Review  │                 │
                    └──────┬──────┘                 │
                           │                        │
              ┌────────────┴────────────┐          │
           Pass                      Fail          │
              │                         │          │
              ▼                         └──────────┘
       ┌─────────────┐                 (drag back to fix)
       │Human Review │
       └──────┬──────┘
              │
    ┌─────────┴─────────┐
    │                   │
 Approve            Reject
    │                   │
    ▼                   ▼
┌─────────────┐   stays in column
│Ready to Ship│   (needs_action)
└─────────────┘        │
                       │ drag back
                       ▼
                 In Progress
```

---

## Implementation Order

1. **Types** - Update `backlog.ts` (Status, BacklogItem, constants)
2. **Column cleanup** - Remove Up Next from BacklogView
3. **Basic flow** - Get 5 columns rendering and draggable
4. **AI auto-trigger** - Wire up auto-review on drop
5. **TaskCard badges** - Verify existing badges work with new fields
6. **Review modals** - Split/enhance for two-stage flow
7. **Human actions** - Approve/reject handlers
8. **Polish** - Column colors, testing, edge cases

---

## Critical Files

| File | Changes |
|------|---------|
| `src/types/backlog.ts` | Status enum, BacklogItem fields, constants |
| `src/components/views/BacklogView.tsx` | Remove Up Next, update drag handlers, add review handlers |
| `src/components/TaskCard.tsx` | Verify badges, update prop names |
| `src/components/KanbanColumn.tsx` | Column colors for new statuses |
| `src/components/ReviewModal.tsx` | Rename to AIReviewModal |
| `src/components/HumanReviewModal.tsx` | NEW - Human review UI |
| `src/app/api/review-task/route.ts` | Structured response with score |
| `src/lib/backlog-parser.ts` | Update status mappings |

---

## Migration Notes

### Existing Tasks
- Tasks with `status: 'up_next'` → migrate to `status: 'backlog'` with high priority
- Tasks with `status: 'review'` → migrate to `status: 'ai_review'`

### Star Indicator
The gold star (currently for Up Next) will be repurposed as a general "priority" indicator that users can toggle on any backlog item.
