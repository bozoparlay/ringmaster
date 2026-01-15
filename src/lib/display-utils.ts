/**
 * Utility functions for cleaning data for display purposes.
 * These functions strip internal metadata while preserving user-facing content.
 */

/**
 * Patterns to strip from description previews:
 * - Ringmaster task ID comments (both formats)
 * - Metadata line with Priority/Effort/Value
 * - Markdown section headers that clutter previews
 */
const METADATA_PATTERNS = [
  // Ringmaster task ID HTML comments (both old and new format)
  /<!--\s*ringmaster[-:](?:task-)?id[=:][^>]+-->\s*/gi,
  // Priority/Effort/Value metadata line
  /\*\*Priority\*\*:\s*\w+\s*\|\s*\*\*Effort\*\*:\s*\w+(?:\s*\|\s*\*\*Value\*\*:\s*\w+)?\s*/gi,
  // Standalone Priority line (alternative format)
  /---\s*\*Priority:\s*\w+\*\s*\*Effort:\s*\w+\*\s*/gi,
];

/**
 * Strips internal metadata from a description for display in UI previews.
 * The original data is preserved - this only affects how it's shown to users.
 *
 * @param description - Raw description that may contain metadata
 * @returns Cleaned description suitable for display
 */
export function cleanDescriptionForDisplay(description: string | undefined): string {
  if (!description) return '';

  let cleaned = description;

  // Remove all metadata patterns
  for (const pattern of METADATA_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Strip markdown formatting for plain text preview
  cleaned = cleaned
    // Remove markdown headers (## Header -> Header)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic (**text** or *text* -> text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove inline code (`code` -> code)
    .replace(/`([^`]+)`/g, '$1')
    // Remove links but keep text ([text](url) -> text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove list markers (-, *, +, 1.)
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '');

  // Clean up excessive whitespace left after removal
  cleaned = cleaned
    .replace(/^\s*\n+/gm, '\n')  // Remove leading empty lines
    .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
    .trim();

  return cleaned;
}

/**
 * Extracts the ringmaster task ID from a description if present.
 * Useful for syncing between local tasks and GitHub issues.
 *
 * @param description - Description that may contain task ID
 * @returns Task ID if found, undefined otherwise
 */
export function extractTaskIdFromDescription(description: string | undefined): string | undefined {
  if (!description) return undefined;

  // Match both formats: ringmaster-task-id:UUID and ringmaster:id=UUID
  const match = description.match(/<!--\s*ringmaster[-:](?:task-)?id[=:]([a-f0-9-]+)\s*-->/i);
  return match?.[1];
}
