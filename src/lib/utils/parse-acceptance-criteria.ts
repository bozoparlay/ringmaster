/**
 * Parse acceptance criteria from GitHub issue body markdown
 *
 * Extracts checkbox items (- [ ] or - [x]) from markdown and returns
 * the text of each criterion.
 */

/**
 * Parse acceptance criteria from markdown body text
 * @param body - The GitHub issue body (markdown)
 * @returns Array of criterion text strings
 */
export function parseAcceptanceCriteriaFromMarkdown(body: string | null): string[] {
  if (!body) return [];

  // Remove HTML comments (e.g., ringmaster metadata)
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, '');

  // Match all checkbox items: - [ ] text or - [x] text (case insensitive for x)
  // This regex captures the text after the checkbox
  const checkboxRegex = /^[\s]*[-*]\s*\[[xX\s]\]\s*(.+)$/gm;

  const criteria: string[] = [];
  let match;

  while ((match = checkboxRegex.exec(withoutComments)) !== null) {
    const text = match[1].trim();
    // Only include non-empty criteria
    if (text.length > 0) {
      criteria.push(text);
    }
  }

  return criteria;
}

/**
 * Check if a markdown body contains acceptance criteria
 * Useful for quick checks without full parsing
 */
export function hasAcceptanceCriteria(body: string | null): boolean {
  if (!body) return false;
  return /[-*]\s*\[[xX\s]\]/.test(body);
}
