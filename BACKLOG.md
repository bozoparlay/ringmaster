# Backlog

## [backlog] Admin Tools

### Fix Task Rescoping
**Priority**: High | **Effort**: Medium | **Value**: High

**Description**:
## Description
The AI Rescope functionality is currently broken, preventing administrators from using AI assistance to automatically adjust task scope and requirements. When users click the "AI Rescope" button, the interface shows a loading spinner indefinitely without performing any rescoping operation or providing feedback. This blocks a key administrative workflow for task management.

## Requirements
- Fix the AI Rescope button to properly trigger the rescoping operation
- Ensure the loading spinner resolves after the operation completes or fails
- Display appropriate success/error messages to provide user feedback
- Verify the rescoped content is properly saved and displayed
- Add proper error handling for API failures or timeout scenarios
- Implement reasonable timeout limits (30-60 seconds) to prevent infinite loading
- Ensure the rescoping maintains original task context and intent
- Add logging for debugging future AI integration issues

## Technical Approach
Investigate the frontend event handler for the AI Rescope button and trace the API call chain. Check for broken API endpoints, authentication issues, or timeout problems. Examine the AI service integration for proper request formatting and response handling. Review error handling middleware and ensure proper state management for loading states.

**Acceptance Criteria**:
- [ ] AI Rescope button successfully processes requests within reasonable time
- [ ] Loading spinner properly indicates operation status
- [ ] Users receive clear feedback on success/failure
- [ ] Rescoped content is accurately saved and displayed
- [ ] No infinite loading states occur

---

## [backlog] Technical Debt

### Speed up Add Task
**Priority**: High | **Effort**: Medium | **Value**: High

**Description**:
## Description
Optimize the task creation workflow to eliminate performance bottlenecks when adding AI-assisted tasks to the backlog. Currently, users experience significant delays after clicking "Add Task", creating a poor user experience and potentially causing users to abandon task creation or attempt duplicate submissions.

## Requirements
- Reduce "Add Task" response time to under 2 seconds for 95% of requests
- Implement loading states and user feedback during task processing
- Ensure AI-generated task data is properly validated before submission
- Maintain data integrity during the optimization process
- Add error handling for failed task creation attempts
- Implement client-side validation to catch issues before server submission
- Consider implementing optimistic UI updates where appropriate
- Add performance monitoring to track improvement metrics

## Technical Approach
Profile the current task creation flow to identify bottlenecks (likely database operations, API calls, or inefficient data processing). Optimize database queries, implement proper indexing, and consider caching strategies. Review the AI assist integration for unnecessary blocking operations. Implement asynchronous processing where possible and add proper loading states in the frontend. Consider batching operations or using background jobs for heavy processing.

**Acceptance Criteria**:
- [ ] Task creation completes in under 2 seconds consistently
- [ ] Users receive immediate feedback when clicking "Add Task"
- [ ] No increase in failed task creation attempts
- [ ] Performance metrics show measurable improvement
- [ ] User experience testing confirms smoother workflow

---

## [backlog] UI/UX Improvements

### Fix drag and drop
**Priority**: High | **Effort**: Medium | **Value**: High

**Description**:
## Description
Fix the broken drag and drop functionality that prevents users from moving betting tiles between the "Up Next" and "In Progress" sections. The current implementation has a usability issue where users must drag tiles to the middle of the target column rather than being able to drop them near the top where the emoji/header is located. This core interaction is essential for users to manage their parlay picks and organize their betting workflow within the Bozo Parlay application.

## Requirements
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

## Technical Approach
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

### Up Next Should Also Be in Backlog
**Priority**: Medium | **Effort**: Low | **Value**: Medium

**Description**:
## Description
This task addresses a UI consistency issue in the project management interface where cards displayed in the "Up Next" column are not simultaneously visible in the "Backlog" column. This creates confusion for users who expect to see all pending work items in the backlog view while also having visibility into prioritized upcoming tasks. Implementing this dual-visibility will improve workflow transparency and help users better understand the relationship between backlog items and scheduled work.

## Requirements
- Cards appearing in "Up Next" column must also be visible in "Backlog" column
- Maintain visual distinction between items that are in Up Next vs. backlog-only items
- Ensure no duplication of functionality when interacting with cards that appear in both columns
- Preserve existing drag-and-drop functionality between columns
- Cards should maintain consistent data and state across both column appearances
- Visual indicators should clearly show when a backlog item is also scheduled for "Up Next"

## Technical Approach
Modify the column filtering logic to include Up Next items in the Backlog query. Update the card component to display a visual badge or styling when an item exists in both states. Consider implementing a shared state management approach to ensure data consistency. Likely files to modify include the board/kanban component, card filtering utilities, and CSS for visual indicators.

**Acceptance Criteria**:
- [ ] All Up Next cards are visible in Backlog column with appropriate visual distinction
- [ ] No duplicate actions or state conflicts when interacting with dual-visible cards
- [ ] Existing column functionality remains intact
- [ ] Visual indicators clearly communicate dual-column status to users

---
