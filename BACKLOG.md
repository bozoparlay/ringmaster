# Backlog

## [backlog] UI/UX Improvements

### Fix drag and drop
**Priority**: High | **Effort**: Medium | **Value**: High

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

## Success Criteria
- Users can successfully drag tiles from "Up Next" to "In Progress" sections
- Users can successfully drag tiles from "In Progress" back to "Up Next" sections
- Tiles can be dropped anywhere within a column, including near the top where emojis/headers are located
- Drop zones provide clear visual feedback across the entire column area
- Drag and drop works on desktop browsers (Chrome, Firefox, Safari, Edge)
- Drag and drop works on mobile devices (iOS Safari, Android Chrome)
- Visual feedback is clear during drag operations and shows the full droppable area
- No JavaScript errors occur during drag and drop operations
- Tile positions persist correctly after drag operations
- QA testing confirms functionality works for all user scenarios, specifically testing drops near column headers
- User can intuitively drop tiles without having to aim for the middle of columns

### Resize Up Next column
**Priority**: Low | **Effort**: Low | **Value**: Low

**Description**:
## Description
Adjust the width of the "Up Next" column to maintain visual consistency with other table columns in the application interface.

## Requirements
- Resize "Up Next" column to match width proportions of adjacent columns
- Ensure responsive behavior across different screen sizes
- Maintain readability of column content after resize
- Verify alignment with overall table design system

## Technical Approach
- Update CSS width properties for the "Up Next" column
- Test column proportions on desktop, tablet, and mobile viewports
- Ensure no content overflow or truncation issues

## Success Criteria
- "Up Next" column width is visually balanced with other columns
- Table maintains proper alignment and spacing
- No horizontal scrolling introduced on standard screen sizes
- Content remains fully readable and accessible

---

## [in_progress] Technical Debt

### Fix Task Creation/Rescope
**Priority**: High | **Effort**: Medium | **Value**: High

**Description**:
## Description
Investigate and fix the task creation and rescoping pipeline to ensure AI-generated tasks meet quality criteria and are not incorrectly flagged for rescoping.

## Requirements
- Analyze current task creation workflow and AI assist functionality
- Review rescoping criteria and validation logic
- Identify gaps between AI-generated task quality and rescope requirements
- Fix pipeline to prevent false positive rescope flags for AI-assisted tasks

## Technical Approach
1. Audit the task creation process and AI assist integration
2. Review rescope detection algorithms and criteria
3. Analyze recent AI-generated tasks that were incorrectly flagged
4. Implement fixes to align AI output with rescope validation
5. Add logging/monitoring to track pipeline health

## Success Criteria
- AI-generated tasks pass rescope validation without false positives
- Task creation pipeline operates smoothly
- Clear documentation of updated criteria and processes
- Monitoring in place to detect future pipeline issues

---
