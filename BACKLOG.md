# Backlog

## [backlog] Infrastructure

### Setup docker container
**Priority**: High | **Effort**: Medium | **Value**: High

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
**Priority**: Medium | **Effort**: Medium | **Value**: Medium

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

---

## [backlog] UI/UX Improvements

### Fix drag and drop
**Priority**: High | **Effort**: Medium | **Value**: High

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

### Improve Needs Rescope Indicator
**Priority**: Medium | **Effort**: Medium | **Value**: Medium

**Description**:
Currently it's just a red dot on the top right, make it a caution sign on the top left in the same style as the star for the up next item

### Improve Column Labels
**Priority**: Medium | **Effort**: Medium | **Value**: Medium

**Description**:
Up Next -> Priority
Ready to Ship -> Ship it

### Improve Similarity Scoring
**Priority**: Medium | **Effort**: Medium | **Value**: Medium

**Description**:
Scoring a task that is pretty unique is coming back as having a ton of similarity. We should probably make things more strict as far as similarity goes

---

## [ready_to_ship] UI/UX Improvements

### Speed up Add Task
**Priority**: Critical | **Effort**: High | **Value**: High

**Description**:
**Description:**
Optimize the task creation workflow to eliminate performance bottlenecks when adding AI-assisted tasks to the backlog. Currently, users experience significant delays after clicking "Add Task", with the check similarity call taking up to 2 minutes for server response, creating a poor user experience and potentially causing users to abandon task creation or attempt duplicate submissions. This enhancement will implement a progressive similarity checking system with real-time feedback to keep users engaged and informed throughout the process.

**Requirements:**
- Reduce "Add Task" response time to under 2 seconds for 95% of requests
- Implement a progress bar visualization showing similarity check progress across all backlog items
- Break down the similarity check into individual item comparisons with real-time progress updates
- Display a live list of potentially similar tasks with similarity scores as they are processed
- Parallelize similarity checking operations to improve overall performance
- Allow users to view and dismiss similar tasks during the checking process
- Implement loading states and user feedback during task processing with cancel functionality
- Ensure AI-generated task data is properly validated before submission
- Maintain data integrity during the optimization process
- Add error handling for failed task creation attempts with timeout protection (30-60 seconds max)
- Implement client-side validation to catch issues before server submission
- Add performance monitoring to track improvement metrics and identify future bottlenecks
- Provide clear user feedback when similar tasks are found with options to proceed or modify

**Technical Approach:**
Profile the current task creation flow and redesign the similarity check as a progressive, parallelized process. Implement a new similarity checking service that processes backlog items in batches, returning results incrementally via WebSocket or Server-Sent Events for real-time progress updates. Create a new frontend component that displays a progress bar showing "Checking similarity against X of Y tasks" with a live-updating list of similar tasks found. Implement worker threads or async processing pools to parallelize similarity comparisons across multiple backlog items simultaneously. Add database indexing on fields used in similarity comparisons and consider pre-computing similarity hashes for faster lookups. Implement proper timeout handling with graceful degradation - if similarity check times out, allow task creation to proceed with a warning. Create a similarity results component that shows tasks with similarity scores above a threshold (e.g., 70%) with options for users to review, dismiss, or modify their task. Add caching mechanisms for recently computed similarities to avoid redundant calculations. Implement optimistic UI updates where the task appears in a "pending" state while similarity checking completes in the background. Add comprehensive error boundaries and retry mechanisms for failed similarity checks.

**Acceptance Criteria**:
- [ ] Progress bar displays real-time updates showing similarity check progress across all backlog items
- [ ] Similar tasks are displayed in a live-updating list with similarity scores as they are discovered
- [ ] Task creation completes within 2 seconds for 95% of requests with similarity checking running asynchronously
- [ ] Users can cancel the similarity check process and proceed with task creation at any time
- [ ] Performance monitoring shows measurable improvement in task creation completion rates and user engagement

---
