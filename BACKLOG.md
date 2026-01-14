# Backlog

## [backlog] Infrastructure

### Setup docker container
<!-- ringmaster:id=9c61fdbe-e455-48a7-bd78-0da67e0b6a5e github=402 -->
**Priority**: High | **Effort**: Medium

**Description**:
**Description:**
Setup a Docker development container environment to provide a secure, isolated sandbox for running AI-assisted development tools. This containerized environment will prevent potential security risks when using automated code generation and modification tools that require elevated permissions, while ensuring consistent development environments across the team.

**Requirements:**
- Follow the reference implementation from https://github.com/anthropics/claude-code/tree/main/.devcontainer
- Create a Docker container without internet access to minimize security risks
- Configure the container to support the Bozo Parlay application stack (likely Node.js/React frontend, backend API)
- Include all necessary development dependencies and tools within the container
- Ensure the container can run AI development tools safely with bypassed permission checks
- Document the setup process and usage instructions for the development team
- Configure volume mounts to persist code changes between container sessions
- Set up appropriate user permissions within the container

**Technical Approach:**
Create a .devcontainer directory in the project root with devcontainer.json configuration. Use a base image that supports the application's tech stack. Configure Docker Compose if multiple services are needed. Include VS Code extensions and settings for optimal development experience. Set up network isolation to prevent internet access while maintaining localhost connectivity for development servers.

---

## [backlog] Technical Debt

### Improve Grading of Tasks
<!-- ringmaster:id=fecf956f-234f-454a-bbfe-3d2702f9a0db github=403 -->
**Priority**: High | **Effort**: Medium

**Description**:
**Description:**
The current task scoring algorithm is not responsive to content changes, creating an inaccurate representation of task completeness and quality. Users can remove critical information like titles and descriptions without seeing their task scores decrease appropriately. This undermines the scoring system's purpose of encouraging well-defined, complete tasks and makes it difficult to assess task quality at a glance.

**Requirements:**
- Task scores must decrease when title is removed or significantly shortened
- Task scores must decrease when description is removed or substantially reduced
- Task scores must respond proportionally to changes in acceptance criteria count (removing criteria should lower score)
- Scoring algorithm should weight different components appropriately (title, description length, acceptance criteria count, etc.)
- Score changes should be reflected in real-time as users edit tasks
- Implement minimum thresholds for each component to achieve maximum scoring
- Ensure scoring remains intuitive and predictable for users

**Technical Approach:**
Update the task scoring service to implement a weighted scoring model. Consider factors like title presence/length, description word count, acceptance criteria count, and any other relevant task attributes. Implement real-time score recalculation on task updates. May need to update both frontend scoring display and backend scoring logic. Consider adding score breakdown tooltips to help users understand how scores are calculated.

### Add ability to close github issues
<!-- ringmaster:id=41ab95af-27bd-4034-9519-7d32e22c2001 -->
**Priority**: Medium | **Effort**: Low | **Value**: Medium

**Description**:
**Description:**
Implement functionality to close GitHub issues directly from the application's task management interface. Currently, when tasks are deleted from the GitHub view within the application, the corresponding GitHub issues remain open, creating inconsistency between the application state and the GitHub repository. This enhancement will automatically close GitHub issues when tasks are removed from the application, maintaining synchronization between internal task management and external GitHub issue tracking.

**Requirements:**
- Integrate with GitHub API to programmatically close issues when tasks are deleted from the GitHub view
- Maintain existing delete functionality while adding the GitHub issue closure as an additional step
- Handle API failures gracefully without blocking the task deletion process
- Provide user feedback when GitHub issue closure succeeds or fails
- Ensure proper authentication and authorization for GitHub API calls
- Log all GitHub API interactions for debugging and audit purposes
- Support bulk operations if multiple tasks are deleted simultaneously

**Technical Approach:**
Extend the existing task deletion service to include a GitHub API call using the PATCH method to update issue state to 'closed'. Implement this as a service method that can be called after successful task deletion. Use the existing GitHub integration patterns and authentication mechanisms. Consider implementing this as an async operation to avoid blocking the UI. Add error handling to gracefully manage API rate limits and network failures.

**Notes:**
(Additional context, links, or findings to be added by the user)

---

## [backlog] UI/UX Improvements

### Fix drag and drop
<!-- ringmaster:id=6707b0dd-edf4-4b69-86a0-65f2d1bcd1c9 github=404 -->
**Priority**: High | **Effort**: Medium

**Description**:
Fix the broken drag and drop functionality that prevents users from moving betting tiles between the "Up Next" and "In Progress" sections. The current implementation has a usability issue where users must drag tiles to the middle of the target column rather than being able to drop them near the top where the emoji/header is located. This core interaction is essential for users to manage their parlay picks and organize their betting workflow within the Bozo Parlay application.

**Requirements:**
- Users must be able to drag tiles from the "Up Next" section to the "In Progress" section
- Users must be able to drag tiles from the "In Progress" section back to the "Up Next" section
- Drop zones must accept tiles when dropped anywhere in the column, including near the top where the emoji/header is located
- Drop zones should extend to cover the full height and width of each column for intuitive user experience
- Drag and drop should work consistently across different browsers (Chrome, Firefox, Safari, Edge)
- Visual feedback must be provided during drag operations (hover states, drop zones)
- Drop zone highlighting should clearly indicate the entire acceptable drop area
- Tiles should snap into proper positions when dropped in valid areas
- Invalid drop attempts should return tiles to their original position
- Touch devices should support drag and drop functionality for mobile users
- Drag operations should not interfere with other tile interactions (clicking, selecting)

**Technical Approach:**
- Investigate current drag and drop implementation in the tiles component
- Examine the current drop zone boundaries and expand them to cover the full column area
- Check if the emoji/header elements are blocking drop events with CSS properties like pointer-events
- Verify HTML5 drag and drop API implementation or touch event handlers
- Review CSS that might be interfering with drag operations (pointer-events, z-index, positioning)
- Test event listeners for dragstart, dragover, drop, and dragend events across the entire column
- Ensure drop zones have proper event.preventDefault() calls to allow dropping
- Update drop zone styling to provide clear visual feedback for the entire droppable area
- Ensure proper data transfer between drag source and drop target
- Consider using a drag and drop library (react-beautiful-dnd, Sortable.js) if current implementation is unreliable
- Update state management to properly handle tile position changes
- Test drop functionality specifically near column headers/emojis to ensure the fix addresses the reported issue

**Acceptance Criteria**:
- [ ] Users can successfully drag tiles from "Up Next" to "In Progress" sections
- [ ] Users can successfully drag tiles from "In Progress" back to "Up Next" sections
- [ ] Tiles can be dropped anywhere within a column, including near the top where emojis/headers are located
- [ ] Drop zones provide clear visual feedback across the entire column area
- [ ] Drag and drop works on desktop browsers (Chrome, Firefox, Safari, Edge)
- [ ] Drag and drop works on mobile devices (iOS Safari, Android Chrome)
- [ ] Visual feedback is clear during drag operations and shows the full droppable area
- [ ] No JavaScript errors occur during drag and drop operations
- [ ] Tile positions persist correctly after drag operations
- [ ] QA testing confirms functionality works for all user scenarios, specifically testing drops near column headers
- [ ] User can intuitively drop tiles without having to aim for the middle of columns

---

## [backlog] Uncategorized

### Improve Similarity Scoring
<!-- ringmaster:id=10b8dbdc-0a16-46dd-9883-37c45157764f github=407 -->
**Priority**: Medium | **Effort**: Medium | **Value**: Medium

**Description**:
Scoring a task that is pretty unique is coming back as having a ton of similarity. We should probably make things more strict as far as similarity goes

### Consolidate Kanban View Components
<!-- ringmaster:id=consolidate-kanban-views -->
**Priority**: Medium | **Effort**: Medium

**Description**:
The three kanban view components (BacklogView, GitHubIssuesView, QuickTasksView) duplicate significant logic including DndContext setup, drag handlers, state management for panels/modals, and toast handling. This duplication has already caused bugs where features added to one view weren't present in others (e.g., trash can feature).

**Requirements:**
- Extract common DnD logic into a shared hook (useKanbanDnd or similar)
- Extract common panel/modal state management into a shared hook
- Ensure all three views have feature parity (trash can, review modal, etc.)
- Reduce code duplication while maintaining view-specific customization

**Technical Approach:**
Create custom hooks that encapsulate the common patterns:
- `useKanbanDnd` - sensors, handleDragStart, handleDragEnd, activeId state
- `useKanbanPanels` - panel/modal state, open/close handlers
- Consider a HOC or wrapper component for the common DndContext structure

**Files to Refactor:**
- src/components/views/BacklogView.tsx (723 lines)
- src/components/views/GitHubIssuesView.tsx
- src/components/views/QuickTasksView.tsx

---
