import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import {
  withTimeout,
  bedrockCircuitBreaker,
  CircuitOpenError,
  TimeoutError,
} from '@/lib/resilience';

// Bedrock API timeout - 30 seconds should be plenty for most requests
const BEDROCK_TIMEOUT_MS = 30000;

// Initialize Bedrock client with profile support
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: fromIni({
    profile: process.env.AWS_PROFILE || 'bozo',
  }),
});

const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

// Sanitize JSON string by escaping control characters within string values
function sanitizeJsonString(str: string): string {
  // Replace literal newlines, tabs, and other control characters within string values
  // This regex finds content between quotes and escapes control characters
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString) {
      // Escape control characters within strings
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }

  return result;
}

interface AnalysisResult {
  priority: 'critical' | 'high' | 'medium' | 'low' | 'someday';
  effort: 'low' | 'medium' | 'high' | 'very_high';
  value: 'low' | 'medium' | 'high';
  category: string;
  enhancedDescription: string;
  acceptanceCriteria?: string[];
}

interface QualityCheck {
  isValid: boolean;
  score: number; // 0-100
  issues: string[];
}

/**
 * Validates AI-generated task description quality to prevent downstream rescope issues.
 * Returns a quality score and any issues found.
 */
function validateTaskQuality(
  title: string,
  description: string,
  analysis: AnalysisResult
): QualityCheck {
  const issues: string[] = [];
  let score = 100;

  // Check 1: Description length (minimum meaningful content)
  if (!analysis.enhancedDescription || analysis.enhancedDescription.length < 50) {
    issues.push('Description is too short - needs more detail');
    score -= 30;
  } else if (analysis.enhancedDescription.length < 100) {
    issues.push('Description could be more detailed');
    score -= 10;
  }

  // Check 2: Has actionable content (requirements, approach, or success criteria)
  const hasRequirements = /requirements?|must|should|needs? to/i.test(analysis.enhancedDescription);
  const hasApproach = /approach|implementation|steps?|how to/i.test(analysis.enhancedDescription);
  const hasCriteria = /success|criteria|acceptance|done when/i.test(analysis.enhancedDescription);

  if (!hasRequirements && !hasApproach && !hasCriteria) {
    issues.push('Missing actionable content (requirements, approach, or success criteria)');
    score -= 25;
  }

  // Check 3: Description is different from title (not just repeated)
  const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const descWords = analysis.enhancedDescription.toLowerCase();
  const titleOverlap = titleWords.filter(w => descWords.includes(w)).length / Math.max(titleWords.length, 1);
  if (titleOverlap < 0.3 && analysis.enhancedDescription.length < 200) {
    // Description doesn't expand on the title much
    issues.push('Description should expand on the task title with more context');
    score -= 15;
  }

  // Check 4: Has structured sections (markdown formatting)
  const hasStructure = /^#{1,4}\s|^\*\*[^*]+\*\*:|^-\s|^\d+\./m.test(analysis.enhancedDescription);
  if (!hasStructure && analysis.enhancedDescription.length > 150) {
    issues.push('Consider adding structured sections for clarity');
    score -= 5;
  }

  // Check 5: Category is meaningful
  if (!analysis.category || analysis.category.length < 3) {
    issues.push('Category should be specified');
    score -= 10;
  }

  return {
    isValid: score >= 50, // Tasks with score < 50 are considered low quality
    score: Math.max(0, score),
    issues,
  };
}

export async function POST(request: Request) {
  try {
    const { title, description, comments } = await request.json();

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Build the prompt based on whether we have comments (enhancement mode) or not (initial analysis)
    const hasComments = comments && comments.trim().length > 0;

    const prompt = hasComments
      ? `You are a technical project manager enhancing a backlog task for a software development project called "Bozo Parlay" - a social betting web application where friends create groups, submit weekly picks, and compete in parlays.

The user wants to enhance the following task based on their comments:

**Task Title**: ${title}
**Current Description**:
${description || 'No description provided'}

**User's Comments/Requests**:
${comments}

Your task is to:
1. Integrate the user's comments into the existing description
2. Preserve any existing content that's still relevant
3. Add the new information requested by the user
4. Ensure the description has all required sections for quality validation

Provide your response in the following JSON format (and ONLY the JSON, no other text):

{
  "priority": "critical" | "high" | "medium" | "low" | "someday",
  "effort": "low" | "medium" | "high" | "very_high",
  "value": "low" | "medium" | "high",
  "category": "<suggested category>",
  "enhancedDescription": "<the enhanced markdown description WITHOUT the acceptance criteria section>",
  "acceptanceCriteria": ["<criterion 1>", "<criterion 2>", "<criterion 3>"]
}

Guidelines:
- **Priority**: critical (security/breaking), high (important feature/bug), medium (standard work), low (nice to have), someday (future idea)
- **Effort**: low (few hours), medium (1-3 days), high (1-2 weeks), very_high (multi-week project)
- **Value**: Based on user impact, business value, and technical benefit
- **Category**: Choose from: User Management, Season Management, Admin Tools, Notifications, Game Data & Automation, Profile & Achievements, Analytics & Insights, UI/UX Improvements, Security & Privacy, Technical Debt, Infrastructure, Mobile & Future

**IMPORTANT - Enhanced Description Requirements:**
The description MUST include these sections to pass quality validation (use bold text for section headers, NOT markdown headings):

**Description:**
Brief overview of what this task accomplishes and why it matters.

**Requirements:**
- Bullet list of specific, actionable requirements
- Each requirement should be verifiable (can determine if it's done)

**Technical Approach:**
How this should be implemented (suggested files, patterns, considerations).

**IMPORTANT:** Return acceptance criteria as a SEPARATE array field, NOT embedded in the description.
The "acceptanceCriteria" array should contain 3-5 specific, verifiable conditions that define when this task is complete.
Each criterion should be a concise statement (not a checkbox or bullet) that can be verified during code review.

Merge the user's comments while ensuring all sections are present. The description should be detailed enough that a developer can implement it without needing to ask clarifying questions.`
      : `You are a technical project manager analyzing a backlog task for a software development project called "Bozo Parlay" - a social betting web application where friends create groups, submit weekly picks, and compete in parlays.

Analyze the following task and provide a structured assessment:

**Task Title**: ${title}
**Current Description**: ${description || 'No description provided'}

Provide your analysis in the following JSON format (and ONLY the JSON, no other text):

{
  "priority": "critical" | "high" | "medium" | "low" | "someday",
  "effort": "low" | "medium" | "high" | "very_high",
  "value": "low" | "medium" | "high",
  "category": "<suggested category>",
  "enhancedDescription": "<formatted markdown description WITHOUT the acceptance criteria section>",
  "acceptanceCriteria": ["<criterion 1>", "<criterion 2>", "<criterion 3>"]
}

Guidelines for assessment:
- **Priority**: critical (security/breaking), high (important feature/bug), medium (standard work), low (nice to have), someday (future idea)
- **Effort**: low (few hours), medium (1-3 days), high (1-2 weeks), very_high (multi-week project)
- **Value**: Based on user impact, business value, and technical benefit
- **Category**: Choose from: User Management, Season Management, Admin Tools, Notifications, Game Data & Automation, Profile & Achievements, Analytics & Insights, UI/UX Improvements, Security & Privacy, Technical Debt, Infrastructure, Mobile & Future

**IMPORTANT - Enhanced Description Requirements:**
The description MUST include these sections to pass quality validation (use bold text for section headers, NOT markdown headings):

**Description:**
Brief overview of what this task accomplishes and why it matters.

**Requirements:**
- Bullet list of specific, actionable requirements
- Each requirement should be verifiable (can determine if it's done)
- Include both functional requirements and constraints

**Technical Approach:**
How this should be implemented (suggested files, patterns, considerations).

**IMPORTANT:** Return acceptance criteria as a SEPARATE array field, NOT embedded in the description.
The "acceptanceCriteria" array should contain 3-5 specific, verifiable conditions that define when this task is complete.
Each criterion should be a concise statement (not a checkbox or bullet) that can be verified during code review.

The description should be detailed enough that a developer can implement it without needing to ask clarifying questions. Aim for at least 150-200 words with concrete, specific details.`;

    try {
      // Use circuit breaker + timeout for Bedrock API calls
      // This prevents hung requests and fails fast if Bedrock is having issues
      const response = await bedrockCircuitBreaker.execute(async () => {
        const command = new ConverseCommand({
          modelId: CLAUDE_MODEL_ID,
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            maxTokens: 2048,
            temperature: 0.3,
          },
        });

        return withTimeout(
          bedrockClient.send(command),
          BEDROCK_TIMEOUT_MS,
          'Bedrock API'
        );
      });

      // Extract text from response
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON from response (handle potential markdown code blocks)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // Sanitize JSON string - escape control characters within string values
      // This handles cases where Claude returns markdown with literal newlines
      const sanitizedJson = sanitizeJsonString(jsonStr.trim());
      const analysis: AnalysisResult = JSON.parse(sanitizedJson);

      // Validate and normalize the response
      const validPriorities = ['critical', 'high', 'medium', 'low', 'someday'];
      const validEfforts = ['low', 'medium', 'high', 'very_high'];
      const validValues = ['low', 'medium', 'high'];

      // Ensure enhancedDescription is a non-empty string
      let enhancedDesc = '';
      if (typeof analysis.enhancedDescription === 'string' && analysis.enhancedDescription.trim()) {
        enhancedDesc = analysis.enhancedDescription;
      } else if (typeof description === 'string' && description.trim()) {
        enhancedDesc = description;
      }

      // Normalize acceptance criteria - ensure it's an array of non-empty strings
      let acceptanceCriteria: string[] = [];
      if (Array.isArray(analysis.acceptanceCriteria)) {
        acceptanceCriteria = analysis.acceptanceCriteria
          .filter((ac): ac is string => typeof ac === 'string' && ac.trim().length > 0)
          .map(ac => ac.trim());
      }

      // Create normalized analysis for quality check
      const normalizedAnalysis: AnalysisResult = {
        priority: validPriorities.includes(analysis.priority) ? analysis.priority as AnalysisResult['priority'] : 'medium',
        effort: validEfforts.includes(analysis.effort) ? analysis.effort as AnalysisResult['effort'] : 'medium',
        value: validValues.includes(analysis.value) ? analysis.value as AnalysisResult['value'] : 'medium',
        category: analysis.category || '',
        enhancedDescription: enhancedDesc,
        acceptanceCriteria,
      };

      // Validate quality to prevent downstream rescope issues
      const qualityCheck = validateTaskQuality(title, description || '', normalizedAnalysis);

      // Log quality metrics for monitoring
      console.log(`[analyze-task] Quality check: score=${qualityCheck.score}, issues=${qualityCheck.issues.length}, task="${title.slice(0, 50)}"`);

      return NextResponse.json({
        ...normalizedAnalysis,
        quality: {
          score: qualityCheck.score,
          isValid: qualityCheck.isValid,
          issues: qualityCheck.issues,
        },
      });
    } catch (bedrockError) {
      // Log with context about the error type
      if (bedrockError instanceof CircuitOpenError) {
        console.warn(`[analyze-task] Circuit breaker open: ${bedrockError.message}`);
      } else if (bedrockError instanceof TimeoutError) {
        console.warn(`[analyze-task] Bedrock timeout: ${bedrockError.message}`);
      } else {
        console.error('[analyze-task] Bedrock API error:', bedrockError);
      }
      // Fall back to heuristic analysis if Bedrock fails
      return fallbackAnalysis(title, description);
    }
  } catch (error) {
    console.error('Task analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze task' },
      { status: 500 }
    );
  }
}

// Fallback heuristic analysis if Bedrock is unavailable
function fallbackAnalysis(title: string, description: string) {
  const fullText = `${title} ${description}`.toLowerCase();

  // Priority based on keywords
  let priority = 'medium';
  if (fullText.includes('critical') || fullText.includes('urgent') || fullText.includes('security vulnerability')) {
    priority = 'critical';
  } else if (fullText.includes('important') || fullText.includes('security') || fullText.includes('bug')) {
    priority = 'high';
  } else if (fullText.includes('nice to have') || fullText.includes('someday') || fullText.includes('future')) {
    priority = 'someday';
  } else if (fullText.includes('minor') || fullText.includes('small')) {
    priority = 'low';
  }

  // Effort based on scope
  let effort = 'medium';
  if (fullText.includes('simple') || fullText.includes('quick') || fullText.includes('easy')) {
    effort = 'low';
  } else if (fullText.includes('complex') || fullText.includes('refactor') || fullText.includes('migration')) {
    effort = 'high';
  } else if (fullText.includes('massive') || fullText.includes('complete overhaul') || fullText.includes('mobile app')) {
    effort = 'very_high';
  }

  // Value based on impact
  let value = 'medium';
  if (fullText.includes('user experience') || fullText.includes('security') || fullText.includes('performance')) {
    value = 'high';
  } else if (fullText.includes('cosmetic') || fullText.includes('cleanup') || fullText.includes('technical debt')) {
    value = 'low';
  }

  // Category
  let category = '';
  if (fullText.includes('security') || fullText.includes('auth')) {
    category = 'Security & Privacy';
  } else if (fullText.includes('user') || fullText.includes('profile')) {
    category = 'User Management';
  } else if (fullText.includes('ui') || fullText.includes('ux')) {
    category = 'UI/UX Improvements';
  }

  // Enhanced description
  let enhancedDescription = description;
  if (!description || description.length < 50) {
    enhancedDescription = `**Description**\n${title}\n\n**Requirements**\n- [Add requirements]\n\n**Implementation Notes**\n- [Add notes]`;
  }

  return NextResponse.json({
    priority,
    effort,
    value,
    category,
    enhancedDescription,
  });
}
