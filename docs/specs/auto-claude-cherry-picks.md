# Auto-Claude Feature Cherry-Picks: Effort Analysis

## Quick Reference

| Feature | Effort | Value | Priority |
|---------|--------|-------|----------|
| Review Score Badge | 🟢 Low | High | **Do First** |
| Task Complexity Assessment | 🟢 Low | Medium | Do First |
| Execution Phase Display | 🟢 Low | Medium | Do First |
| "Needs Action" Indicator | 🟢 Low | High | **Do First** |
| AI Review Auto-trigger | 🟡 Medium | High | Phase 2 |
| Split Review Columns | 🟡 Medium | High | Phase 2 |
| Human Review Modal | 🟡 Medium | High | Phase 2 |
| Side Panel Insights | 🔴 High | High | Later |
| Ideation Panel | 🔴 High | High | Later |
| Memory System | 🔴 Very High | Medium | Maybe Never |
| Agent Terminals | 🔴 Very High | Low | Skip |

---

## 🟢 LOW-HANGING FRUIT (1-2 hours each)

### 1. Review Score Badge on TaskCard
**What:** Display a 0-100 score badge on cards that have been reviewed.

**Why it's easy:**
- `ReviewResult` already exists in BacklogView.tsx (lines 149-159)
- Just need to persist it to BacklogItem and display on card
- Score calculation is simple math

**Implementation:**
1. Add `reviewScore?: number` and `reviewPassed?: boolean` to BacklogItem
2. Calculate score in `triggerReview()`:
   ```typescript
   const score = 100 - (critical * 25) - (major * 15) - (minor * 5);
   ```
3. Save to item when review completes
4. Add badge to TaskCard (similar to existing quality indicator)

**Files:** `backlog.ts`, `BacklogView.tsx`, `TaskCard.tsx`

---

### 2. Task Complexity Assessment
**What:** Auto-classify tasks as Simple/Standard/Complex when created.

**Why it's easy:**
- Already have Bedrock AI integration
- Just one API call per task creation
- Display is just a small badge

**Implementation:**
1. Add `complexity?: 'simple' | 'standard' | 'complex'` to BacklogItem
2. Call AI on task creation (fire-and-forget, don't block)
3. Prompt: "Given this task title and description, classify as simple (1 file, clear change), standard (2-5 files, moderate), or complex (architectural, many files). Respond with just the word."
4. Display badge on card

**Files:** `backlog.ts`, `TaskCard.tsx`, new API route or inline in create

---

### 3. Execution Phase Display
**What:** Show visual phases: Planning → Coding → QA → Complete

**Why it's easy:**
- Just UI - no new backend logic
- Map existing status to phases
- Progress bar is simple CSS

**Implementation:**
1. Add phase mapping:
   ```typescript
   const phaseMap = {
     backlog: null,
     in_progress: 'coding',
     review: 'qa',
     ready_to_ship: 'complete'
   };
   ```
2. Show phase indicator on cards in "In Progress" and "Review" columns
3. Optional: Add subtle progress bar to card bottom edge

**Files:** `TaskCard.tsx` only

---

### 4. "Needs Action" Indicator
**What:** Pulsing orange dot when a task needs attention (review failed, returned from review)

**Why it's easy:**
- Already have `reviewFeedback` field on BacklogItem
- Just check if field exists + status is in_progress
- Single CSS animation

**Implementation:**
1. Check: `item.reviewFeedback && item.status === 'in_progress'`
2. Add pulsing indicator to TaskCard (like existing quality warning)
3. Clear feedback when task returns to review

**Files:** `TaskCard.tsx` only (no data model changes)

---

## 🟡 MEDIUM EFFORT (Half day each)

### 5. AI Review Auto-trigger
**What:** Automatically start review when task is dragged to Review column.

**Complexity:**
- Logic exists in `triggerReview()` already
- Need to wire up to drag handler
- Handle loading state on card

---

### 6. Split Review into AI Review + Human Review Columns
**What:** Two separate columns for the two-stage process.

**Complexity:**
- Status enum change cascades to multiple files
- Need to update parser, column rendering, drag handlers
- But all the pieces exist - just reorganizing

---

### 7. Human Review Modal
**What:** New modal for human approval/rejection after AI review passes.

**Complexity:**
- Can start as copy of ReviewModal
- Add approve/reject actions
- Connect to state updates

---

## 🔴 BIGGER LIFTS (Multiple days)

### 8. Side Panel Insights
**What:** Collapsible panel for codebase Q&A while viewing board.

**Complexity:**
- New layout component
- Chat UI with streaming
- Context management (what codebase?)
- Session persistence

---

### 9. Ideation Panel
**What:** AI scans codebase and suggests potential tasks.

**Complexity:**
- Need codebase indexing strategy
- Background scanning job
- Suggestion UI with dismiss/promote actions
- How to avoid overwhelming user?

---

### 10. Memory System (Graphiti-lite)
**What:** Persistent context across sessions.

**Complexity:**
- Graph database or vector store
- What to remember? How to retrieve?
- Context window management
- Probably overkill for a kanban tool

---

## Recommended Order

### Phase 0: Quick Wins (This Week)
1. ✅ Review Score Badge - immediate value, shows AI already works
2. ✅ "Needs Action" Indicator - uses existing data, high visibility
3. ✅ Execution Phase Display - pure UI polish
4. ✅ Task Complexity Assessment - fun, sets expectations

### Phase 1: Review Pipeline (Next Week)
5. Split Review Columns
6. AI Review Auto-trigger
7. Human Review Modal

### Phase 2: Intelligence Layer (Future)
8. Side Panel Insights
9. Ideation Panel

### Skip
- Agent Terminals (not core to task management)
- Memory System (over-engineered for this use case)

---

## Code Locations for Quick Wins

```
src/types/backlog.ts          # Add fields: reviewScore, complexity
src/components/TaskCard.tsx   # Add badges: score, complexity, phase, needs-action
src/components/views/BacklogView.tsx  # Save score on review complete
src/app/api/assess-complexity/route.ts  # NEW: One-shot complexity call
```

All quick wins can share a single PR since they're additive and non-breaking.
