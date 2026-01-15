/**
 * Task Quality Validation
 *
 * Validates task descriptions to ensure they have enough detail
 * to be actionable and avoid rescope issues during implementation.
 *
 * This runs both:
 * - On save: immediate feedback when creating/editing tasks
 * - On load: catches tasks created offline/manually edited
 *
 * Scoring Model (weighted components):
 * - Title: 20 points (required, meaningful length)
 * - Description: 35 points (presence, length, quality)
 * - Acceptance Criteria: 30 points (presence, count, specificity)
 * - Actionability: 15 points (requirements/approach keywords, structure)
 */

export interface QualityCheck {
  isValid: boolean;
  score: number; // 0-100
  issues: string[];
  breakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  title: number;        // 0-20
  description: number;  // 0-35
  criteria: number;     // 0-30
  actionability: number; // 0-15
}

export const QUALITY_THRESHOLD = 50; // Tasks below this score show warnings

// Thresholds for scoring
const TITLE_MIN_LENGTH = 10;    // Minimum meaningful title length
const TITLE_IDEAL_LENGTH = 30;  // Ideal title length for full points
const DESC_MIN_LENGTH = 50;     // Minimum useful description
const DESC_GOOD_LENGTH = 150;   // Good description length
const DESC_IDEAL_LENGTH = 300;  // Ideal description for full points
const CRITERIA_IDEAL_COUNT = 3; // Ideal number of acceptance criteria

/**
 * Validates task description quality with weighted scoring.
 * Returns a quality score, issues found, and detailed breakdown.
 */
export function validateTaskQuality(
  title: string,
  description: string,
  acceptanceCriteria?: string[]
): QualityCheck {
  const issues: string[] = [];
  const breakdown: ScoreBreakdown = {
    title: 0,
    description: 0,
    criteria: 0,
    actionability: 0,
  };

  const trimmedTitle = title?.trim() || '';
  const trimmedDesc = description?.trim() || '';
  const criteria = acceptanceCriteria?.filter(c => c.trim().length > 0) || [];

  // ========== TITLE SCORING (20 points) ==========
  if (trimmedTitle.length === 0) {
    issues.push('Missing title');
    breakdown.title = 0;
  } else if (trimmedTitle.length < TITLE_MIN_LENGTH) {
    issues.push('Title is too short - be more specific');
    // Proportional scoring: 0-10 chars = 0-10 points
    breakdown.title = Math.round((trimmedTitle.length / TITLE_MIN_LENGTH) * 10);
  } else if (trimmedTitle.length < TITLE_IDEAL_LENGTH) {
    // 10-30 chars = 10-18 points
    const progress = (trimmedTitle.length - TITLE_MIN_LENGTH) / (TITLE_IDEAL_LENGTH - TITLE_MIN_LENGTH);
    breakdown.title = 10 + Math.round(progress * 8);
  } else {
    // 30+ chars = full 20 points
    breakdown.title = 20;
  }

  // ========== DESCRIPTION SCORING (35 points) ==========
  if (trimmedDesc.length === 0) {
    issues.push('Missing description');
    breakdown.description = 0;
  } else if (trimmedDesc.length < DESC_MIN_LENGTH) {
    issues.push('Description is too brief - needs more detail');
    // 0-50 chars = 0-10 points
    breakdown.description = Math.round((trimmedDesc.length / DESC_MIN_LENGTH) * 10);
  } else if (trimmedDesc.length < DESC_GOOD_LENGTH) {
    // 50-150 chars = 10-20 points
    const progress = (trimmedDesc.length - DESC_MIN_LENGTH) / (DESC_GOOD_LENGTH - DESC_MIN_LENGTH);
    breakdown.description = 10 + Math.round(progress * 10);
  } else if (trimmedDesc.length < DESC_IDEAL_LENGTH) {
    // 150-300 chars = 20-30 points
    const progress = (trimmedDesc.length - DESC_GOOD_LENGTH) / (DESC_IDEAL_LENGTH - DESC_GOOD_LENGTH);
    breakdown.description = 20 + Math.round(progress * 10);
  } else {
    // 300+ chars = 30-35 points (quality bonuses can add more)
    breakdown.description = 30;
  }

  // Quality bonus: description expands on title (not just a repeat)
  const titleLower = trimmedTitle.toLowerCase();
  const descLower = trimmedDesc.toLowerCase();
  if (trimmedDesc.length < 80 && descLower.includes(titleLower.replace(/\s+/g, ' '))) {
    issues.push('Description should expand beyond the title');
    breakdown.description = Math.max(0, breakdown.description - 10);
  }

  // Quality bonus: has structured sections (markdown formatting)
  const hasStructure = /^#{1,4}\s|^\*\*[^*]+\*\*:|^-\s|^\d+\./m.test(trimmedDesc);
  if (hasStructure && breakdown.description >= 20) {
    breakdown.description = Math.min(35, breakdown.description + 5);
  } else if (!hasStructure && trimmedDesc.length > 150) {
    issues.push('Consider adding structured sections for clarity');
  }

  // ========== ACCEPTANCE CRITERIA SCORING (30 points) ==========
  if (criteria.length === 0) {
    issues.push('Missing acceptance criteria - these define when the task is "done"');
    breakdown.criteria = 0;
  } else {
    // Base score: presence of criteria (15 points for 1, scaling up to 25 for 3+)
    const countScore = Math.min(criteria.length, CRITERIA_IDEAL_COUNT);
    breakdown.criteria = 10 + Math.round((countScore / CRITERIA_IDEAL_COUNT) * 15);

    // Quality check: penalize vague or short criteria
    const vaguePatterns = /^(works?|done|complete|fixed|implemented|tested)$/i;
    const wellDefinedCriteria = criteria.filter(ac =>
      ac.trim().length >= 15 && !vaguePatterns.test(ac.trim())
    );

    if (wellDefinedCriteria.length < criteria.length) {
      const vagueCnt = criteria.length - wellDefinedCriteria.length;
      issues.push(`${vagueCnt} acceptance criteria are too vague or short`);
      breakdown.criteria = Math.max(10, breakdown.criteria - (vagueCnt * 3));
    }

    // Bonus for well-defined criteria
    if (wellDefinedCriteria.length >= CRITERIA_IDEAL_COUNT) {
      breakdown.criteria = Math.min(30, breakdown.criteria + 5);
    }
  }

  // ========== ACTIONABILITY SCORING (15 points) ==========
  const hasRequirements = /requirements?|must|should|needs? to/i.test(trimmedDesc);
  const hasApproach = /approach|implementation|steps?|how to|technical/i.test(trimmedDesc);

  if (hasRequirements && hasApproach) {
    breakdown.actionability = 15;
  } else if (hasRequirements || hasApproach) {
    breakdown.actionability = 10;
  } else {
    // Check for other actionable keywords
    const hasOtherActionable = /expected|behavior|outcome|goal|objective|fix|add|update|create|implement/i.test(trimmedDesc);
    if (hasOtherActionable) {
      breakdown.actionability = 7;
    } else {
      issues.push('Description lacks clear requirements or approach');
      breakdown.actionability = 0;
    }
  }

  // Penalty: Not just a one-liner complaint/symptom
  const isJustSymptom = trimmedDesc.split('\n').filter(l => l.trim()).length === 1 &&
                        trimmedDesc.length < 100 &&
                        !hasRequirements && !hasApproach;
  if (isJustSymptom) {
    issues.push('Describe the expected behavior, not just the symptom');
    breakdown.actionability = Math.max(0, breakdown.actionability - 5);
  }

  // Calculate total score
  const score = breakdown.title + breakdown.description + breakdown.criteria + breakdown.actionability;

  return {
    isValid: score >= QUALITY_THRESHOLD,
    score: Math.max(0, Math.min(100, score)),
    issues,
    breakdown,
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
