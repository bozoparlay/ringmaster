import { NextResponse } from 'next/server';
import { BedrockClient, ListFoundationModelsCommand, FoundationModelSummary } from '@aws-sdk/client-bedrock';
import { fromIni } from '@aws-sdk/credential-providers';

// Cache the models list for 5 minutes to avoid excessive API calls
let cachedModels: AIModel[] | null = null;
let cacheKey = '';
let cacheExpiry = 0;

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface AIModel {
  id: string;
  name: string;
  description: string;
  modelId: string;
  provider: string;
  inputModalities: string[];
  outputModalities: string[];
}

// Model descriptions for better UX
const MODEL_DESCRIPTIONS: Record<string, string> = {
  'opus-4-5': 'Most capable, highest quality analysis',
  'opus-4-1': 'Very capable, high quality',
  'opus-4': 'Excellent quality and reasoning',
  'sonnet-4-5': 'Excellent quality, faster than Opus',
  'sonnet-4': 'Best balance of speed and quality',
  'sonnet-3-7': 'Fast and capable with extended thinking',
  'sonnet-3-5': 'Fast and capable',
  'sonnet-3': 'Good balance of speed and quality',
  'haiku-4-5': 'Fast responses, good quality',
  'haiku-3-5': 'Fastest responses, basic analysis',
  'haiku-3': 'Very fast, lightweight tasks',
};

function getModelDescription(modelId: string): string {
  // Extract model variant from ID like "anthropic.claude-opus-4-5-20251101-v1:0"
  const match = modelId.match(/claude-(\w+)-(\d+(?:-\d+)?)/);
  if (match) {
    const [, variant, version] = match;
    const key = `${variant}-${version}`;
    return MODEL_DESCRIPTIONS[key] || `Claude ${variant} ${version}`;
  }
  return 'Claude model';
}

function formatModelName(modelId: string, modelName: string): string {
  // Use the provided model name, or format from ID
  if (modelName) return modelName;

  const match = modelId.match(/claude-(\w+)-(\d+(?:-\d+)?)/);
  if (match) {
    const [, variant, version] = match;
    const formattedVariant = variant.charAt(0).toUpperCase() + variant.slice(1);
    const formattedVersion = version.replace(/-/g, '.');
    return `Claude ${formattedVariant} ${formattedVersion}`;
  }
  return modelId;
}

function createModelId(baseModelId: string): string {
  // Convert base model ID to cross-region format
  // e.g., "anthropic.claude-opus-4-5-20251101-v1:0" -> "us.anthropic.claude-opus-4-5-20251101-v1:0"
  if (baseModelId.startsWith('anthropic.')) {
    return `us.${baseModelId}`;
  }
  return baseModelId;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profile = searchParams.get('profile') || 'default';
  const region = searchParams.get('region') || 'us-east-1';

  // Check cache
  const currentCacheKey = `${profile}:${region}`;
  if (cachedModels && cacheKey === currentCacheKey && Date.now() < cacheExpiry) {
    return NextResponse.json({ models: cachedModels, cached: true });
  }

  try {
    const client = new BedrockClient({
      region,
      credentials: fromIni({ profile }),
    });

    const command = new ListFoundationModelsCommand({
      byProvider: 'Anthropic',
    });

    const response = await client.send(command);

    if (!response.modelSummaries) {
      return NextResponse.json({ models: [], error: 'No models found' });
    }

    // Filter and format Claude models
    const models: AIModel[] = response.modelSummaries
      .filter((model: FoundationModelSummary) => {
        // Only include base models (not fine-tuned or specific context variants)
        const modelId = model.modelId || '';
        return (
          modelId.includes('claude') &&
          !modelId.includes(':28k') &&
          !modelId.includes(':48k') &&
          !modelId.includes(':12k') &&
          !modelId.includes(':200k')
        );
      })
      .map((model: FoundationModelSummary) => {
        const baseModelId = model.modelId || '';
        return {
          id: baseModelId.replace('anthropic.', '').replace(/-v\d+:\d+$/, ''),
          name: formatModelName(baseModelId, model.modelName || ''),
          description: getModelDescription(baseModelId),
          modelId: createModelId(baseModelId),
          provider: 'Anthropic',
          inputModalities: model.inputModalities || [],
          outputModalities: model.outputModalities || [],
        };
      })
      // Sort by capability (opus > sonnet > haiku) and version (newer first)
      .sort((a: AIModel, b: AIModel) => {
        const order = ['opus', 'sonnet', 'haiku'];
        const aVariant = a.id.match(/claude-(\w+)/)?.[1] || '';
        const bVariant = b.id.match(/claude-(\w+)/)?.[1] || '';

        const aOrder = order.indexOf(aVariant);
        const bOrder = order.indexOf(bVariant);

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        // Same variant, sort by version (higher first)
        const aVersion = a.id.match(/claude-\w+-(\d+(?:-\d+)?)/)?.[1] || '0';
        const bVersion = b.id.match(/claude-\w+-(\d+(?:-\d+)?)/)?.[1] || '0';

        // Compare versions like "4-5" vs "4" vs "3-5"
        const aNum = parseFloat(aVersion.replace('-', '.'));
        const bNum = parseFloat(bVersion.replace('-', '.'));

        return bNum - aNum; // Higher version first
      });

    // Update cache
    cachedModels = models;
    cacheKey = currentCacheKey;
    cacheExpiry = Date.now() + CACHE_DURATION_MS;

    return NextResponse.json({ models, cached: false });
  } catch (error) {
    console.error('Error fetching AI models:', error);

    // Return a helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        models: [],
        error: `Failed to fetch models: ${errorMessage}`,
        hint: 'Check your AWS profile and region settings'
      },
      { status: 500 }
    );
  }
}
