import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';

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
4. Keep the description well-organized with markdown formatting

Provide your response in the following JSON format (and ONLY the JSON, no other text):

{
  "priority": "critical" | "high" | "medium" | "low" | "someday",
  "effort": "low" | "medium" | "high" | "very_high",
  "value": "low" | "medium" | "high",
  "category": "<suggested category>",
  "enhancedDescription": "<the enhanced markdown description integrating user's comments>"
}

Guidelines:
- **Priority**: critical (security/breaking), high (important feature/bug), medium (standard work), low (nice to have), someday (future idea)
- **Effort**: low (few hours), medium (1-3 days), high (1-2 weeks), very_high (multi-week project)
- **Value**: Based on user impact, business value, and technical benefit
- **Category**: Choose from: User Management, Season Management, Admin Tools, Notifications, Game Data & Automation, Profile & Achievements, Analytics & Insights, UI/UX Improvements, Security & Privacy, Technical Debt, Infrastructure, Mobile & Future
- **Enhanced Description**: Merge the user's comments into the existing description. Use proper markdown with clear sections. Be concise but thorough.`
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
  "enhancedDescription": "<formatted markdown description>"
}

Guidelines for assessment:
- **Priority**: critical (security/breaking), high (important feature/bug), medium (standard work), low (nice to have), someday (future idea)
- **Effort**: low (few hours), medium (1-3 days), high (1-2 weeks), very_high (multi-week project)
- **Value**: Based on user impact, business value, and technical benefit
- **Category**: Choose from: User Management, Season Management, Admin Tools, Notifications, Game Data & Automation, Profile & Achievements, Analytics & Insights, UI/UX Improvements, Security & Privacy, Technical Debt, Infrastructure, Mobile & Future
- **Enhanced Description**: Format as proper markdown with sections like Description, Requirements, Technical Approach, and Success Criteria. Be concise but thorough.`;

    try {
      const command = new ConverseCommand({
        modelId: CLAUDE_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.3,
        },
      });

      const response = await bedrockClient.send(command);

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

      return NextResponse.json({
        priority: validPriorities.includes(analysis.priority) ? analysis.priority : 'medium',
        effort: validEfforts.includes(analysis.effort) ? analysis.effort : 'medium',
        value: validValues.includes(analysis.value) ? analysis.value : 'medium',
        category: analysis.category || '',
        enhancedDescription: enhancedDesc,
      });
    } catch (bedrockError) {
      console.error('Bedrock API error:', bedrockError);
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
