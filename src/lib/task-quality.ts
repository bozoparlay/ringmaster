/**
 * Task Quality Validation
 *
 * Validates task descriptions to ensure they have enough detail
 * to be actionable and avoid rescope issues during implementation.
 *
 * This runs both:
 * - On save: immediate feedback when creating/editing tasks
 * - On load: catches tasks created offline/manually edited
 */

export interface QualityCheck {
  isValid: boolean;
  score: number; // 0-100
  issues: string[];
}

export const QUALITY_THRESHOLD = 50; // Tasks below this score show warnings

/**
 * Validates task description quality.
 * Returns a quality score and any issues found.
 */
export function validateTaskQuality(
  title: string,
  description: string
): QualityCheck {
  const issues: string[] = [];
  let score = 100;

  // Check 1: Description exists and has minimum length
  if (!description || description.trim().length === 0) {
    issues.push('Missing description');
    score -= 40;
  } else if (description.length < 50) {
    issues.push('Description is too brief - needs more detail');
    score -= 30;
  } else if (description.length < 100) {
    issues.push('Description could be more detailed');
    score -= 15;
  }

  // Check 2: Has actionable content (requirements, approach, or success criteria)
  const hasRequirements = /requirements?|must|should|needs? to/i.test(description);
  const hasApproach = /approach|implementation|steps?|how to|technical/i.test(description);
  const hasCriteria = /success|criteria|acceptance|done when|complete when/i.test(description);

  if (!hasRequirements && !hasApproach && !hasCriteria) {
    issues.push('Missing actionable content (requirements, approach, or success criteria)');
    score -= 25;
  }

  // Check 3: Has structured sections (markdown formatting indicates thoughtfulness)
  const hasStructure = /^#{1,4}\s|^\*\*[^*]+\*\*:|^-\s|^\d+\./m.test(description);
  if (!hasStructure && description.length > 100) {
    issues.push('Consider adding structured sections for clarity');
    score -= 10;
  }

  // Check 4: Description expands on title (not just a repeat)
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  // If the entire description is basically just the title repeated
  if (description.length < 80 && descLower.includes(titleLower.replace(/\s+/g, ' ').trim())) {
    issues.push('Description should expand beyond the title');
    score -= 15;
  }

  // Check 5: Not just a one-liner complaint/symptom
  const isJustSymptom = description.split('\n').filter(l => l.trim()).length === 1 &&
                        description.length < 100 &&
                        !hasRequirements && !hasApproach;
  if (isJustSymptom) {
    issues.push('Describe the expected behavior, not just the symptom');
    score -= 20;
  }

  return {
    isValid: score >= QUALITY_THRESHOLD,
    score: Math.max(0, Math.min(100, score)),
    issues,
  };
}

/**
 * Get a quality label based on score
 */
export function getQualityLabel(score: number): 'good' | 'fair' | 'poor' {
  if (score >= 70) return 'good';
  if (score >= QUALITY_THRESHOLD) return 'fair';
  return 'poor';
}

/**
 * Get quality badge color classes
 */
export function getQualityStyles(score: number): string {
  if (score >= 70) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (score >= QUALITY_THRESHOLD) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}
