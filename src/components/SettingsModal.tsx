'use client';

import { useState, useEffect, useCallback } from 'react';
import { IDE_OPTIONS, type IdeType } from '@/hooks/useIdeSettings';

// ============================================================================
// Types
// ============================================================================

type SettingsSection = 'ai' | 'workflow' | 'git' | 'tasks' | 'github';

interface AISettings {
  model: string;           // Primary model for AI Assist
  similarityModel: string; // Model for similarity checks (defaults to haiku)
  reviewModel: string;     // Model for task review (defaults to sonnet)
  workModel: string;       // Model for Claude Code when working on tasks
  region: string;
  profile: string;
  enabled: boolean;
}

interface WorkflowSettings {
  defaultIde: IdeType;
  openIdeAlongside: boolean;  // When using iTerm, also open IDE?
}

type MergeStrategy = 'pr' | 'local-merge' | 'ask';

interface GitSettings {
  worktreeLocation: string;
  defaultBranch: string;
  autoCommitOnReview: boolean;
  mergeStrategy: MergeStrategy;  // How to handle completed work
  targetBranch: string;          // Branch to merge/PR into
}

interface TaskSettings {
  defaultPriority: string;
  defaultEffort: string;
  enableSimilarityCheck: boolean;
}

interface GitHubSettings {
  repository: string;
  token: string;
}

interface ProjectSettings {
  ai: AISettings;
  workflow: WorkflowSettings;
  git: GitSettings;
  tasks: TaskSettings;
  github: GitHubSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

const DEFAULT_SETTINGS: ProjectSettings = {
  ai: {
    model: 'claude-opus-4-5',
    similarityModel: 'claude-haiku',    // Fast/cheap for quick checks
    reviewModel: 'claude-sonnet-4',     // Good quality for reviews
    workModel: 'claude-sonnet-4',       // Claude Code model for task work
    region: 'us-east-1',
    profile: 'claude',
    enabled: true,
  },
  workflow: {
    defaultIde: 'iterm-interactive',   // Interactive mode with iTerm + Claude
    openIdeAlongside: false,
  },
  git: {
    worktreeLocation: '.tasks',
    defaultBranch: 'main',
    autoCommitOnReview: true,
    mergeStrategy: 'pr',       // Default to creating PRs
    targetBranch: 'main',      // Default target branch for PRs/merges
  },
  tasks: {
    defaultPriority: 'medium',
    defaultEffort: 'medium',
    enableSimilarityCheck: true,
  },
  github: {
    repository: '',
    token: '',
  },
};

// ============================================================================
// Model Options
// ============================================================================

const AI_MODELS = [
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    description: 'Most capable, highest quality analysis',
    modelId: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    description: 'Excellent quality, faster than Opus',
    modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Best balance of speed and quality',
    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Fast and capable',
    modelId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  },
  {
    id: 'claude-haiku',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest responses, basic analysis',
    modelId: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  },
];

const AWS_REGIONS = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'eu-west-1', name: 'EU (Ireland)' },
];

// IDE options come from useIdeSettings hook - IDE_OPTIONS imported at top

const PRIORITIES = [
  { id: 'critical', name: 'Critical', color: 'bg-red-500' },
  { id: 'high', name: 'High', color: 'bg-orange-500' },
  { id: 'medium', name: 'Medium', color: 'bg-blue-500' },
  { id: 'low', name: 'Low', color: 'bg-yellow-500' },
  { id: 'someday', name: 'Someday', color: 'bg-green-500' },
];

const EFFORTS = [
  { id: 'trivial', name: 'Trivial', label: '< 1hr' },
  { id: 'low', name: 'Low', label: '1-4hrs' },
  { id: 'medium', name: 'Medium', label: '1-3 days' },
  { id: 'high', name: 'High', label: '1-2 weeks' },
  { id: 'very_high', name: 'Very High', label: '2+ weeks' },
];

// ============================================================================
// Storage
// ============================================================================

const STORAGE_KEY = 'ringmaster-project-settings';

// Storage key for IDE preference (shared with useIdeSettings hook)
const IDE_STORAGE_KEY = 'ringmaster-ide-preference';

function loadSettings(): ProjectSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Also load IDE preference from the hook's storage key
    const idePreference = localStorage.getItem(IDE_STORAGE_KEY) as IdeType | null;

    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep merge with defaults to handle new fields
      // Also merge in the IDE preference from the hook's storage
      return {
        ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
        workflow: {
          ...DEFAULT_SETTINGS.workflow,
          ...parsed.workflow,
          // IDE preference from hook takes precedence if set
          ...(idePreference ? { defaultIde: idePreference } : {}),
        },
        git: { ...DEFAULT_SETTINGS.git, ...parsed.git },
        tasks: { ...DEFAULT_SETTINGS.tasks, ...parsed.tasks },
        github: { ...DEFAULT_SETTINGS.github, ...parsed.github },
      };
    }

    // No stored settings, but check for IDE preference
    if (idePreference) {
      return {
        ...DEFAULT_SETTINGS,
        workflow: { ...DEFAULT_SETTINGS.workflow, defaultIde: idePreference },
      };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: ProjectSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Also sync IDE preference to the hook's storage key for consistency
    localStorage.setItem(IDE_STORAGE_KEY, settings.workflow.defaultIde);
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// Export for use in other components
export function getProjectSettings(): ProjectSettings {
  return loadSettings();
}

export function getAIModelId(): string {
  const settings = loadSettings();
  const model = AI_MODELS.find(m => m.id === settings.ai.model);
  return model?.modelId || AI_MODELS[0].modelId;
}

export function getAISettings(): AISettings & { modelId: string; similarityModelId: string; reviewModelId: string } {
  const settings = loadSettings();
  const model = AI_MODELS.find(m => m.id === settings.ai.model);
  const similarityModel = AI_MODELS.find(m => m.id === (settings.ai.similarityModel || 'claude-haiku'));
  const reviewModel = AI_MODELS.find(m => m.id === (settings.ai.reviewModel || 'claude-sonnet-4'));
  return {
    ...settings.ai,
    modelId: model?.modelId || AI_MODELS[0].modelId,
    similarityModelId: similarityModel?.modelId || AI_MODELS.find(m => m.id === 'claude-haiku')?.modelId || AI_MODELS[AI_MODELS.length - 1].modelId,
    reviewModelId: reviewModel?.modelId || AI_MODELS.find(m => m.id === 'claude-sonnet-4')?.modelId || AI_MODELS[2].modelId,
  };
}

// Get model ID for similarity checks
export function getSimilarityModelId(): string {
  const settings = loadSettings();
  const model = AI_MODELS.find(m => m.id === (settings.ai.similarityModel || 'claude-haiku'));
  return model?.modelId || AI_MODELS.find(m => m.id === 'claude-haiku')?.modelId || AI_MODELS[AI_MODELS.length - 1].modelId;
}

// Get model ID for task review
export function getReviewModelId(): string {
  const settings = loadSettings();
  const model = AI_MODELS.find(m => m.id === (settings.ai.reviewModel || 'claude-sonnet-4'));
  return model?.modelId || AI_MODELS.find(m => m.id === 'claude-sonnet-4')?.modelId || AI_MODELS[2].modelId;
}

// Get model name for Claude Code work (used with --model flag)
// Returns the short model name like 'sonnet' or 'opus' for Claude CLI
export function getWorkModel(): { id: string; name: string; cliName: string } {
  const settings = loadSettings();
  const modelId = settings.ai.workModel || 'claude-sonnet-4';

  // Map our model IDs to Claude CLI model names
  const cliModelMap: Record<string, string> = {
    'claude-opus-4-5': 'opus',
    'claude-sonnet-4-5': 'sonnet',
    'claude-sonnet-4': 'sonnet',
    'claude-3-5-sonnet': 'sonnet',
    'claude-haiku': 'haiku',
  };

  const model = AI_MODELS.find(m => m.id === modelId);
  return {
    id: modelId,
    name: model?.name || 'Claude Sonnet 4',
    cliName: cliModelMap[modelId] || 'sonnet',
  };
}

/**
 * Get git workflow settings for use in ship-task API
 */
export function getGitSettings(): {
  mergeStrategy: 'pr' | 'local-merge' | 'ask';
  targetBranch: string;
  worktreeLocation: string;
} {
  const settings = loadSettings();
  return {
    mergeStrategy: settings.git.mergeStrategy || 'pr',
    targetBranch: settings.git.targetBranch || 'main',
    worktreeLocation: settings.git.worktreeLocation || '.tasks',
  };
}

// ============================================================================
// Components
// ============================================================================

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description?: string;
}

function ToggleSwitch({ enabled, onChange, label, description }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-colors group"
    >
      <div className="text-left">
        <span className="text-sm text-surface-200 group-hover:text-surface-100 transition-colors">
          {label}
        </span>
        {description && (
          <p className="text-xs text-surface-500 mt-0.5">{description}</p>
        )}
      </div>
      <div
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
          enabled ? 'bg-amber-500' : 'bg-surface-700'
        }`}
      >
        <div
          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200"
          style={{ left: enabled ? '24px' : '4px' }}
        />
      </div>
    </button>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string; description?: string; icon?: string }[];
  description?: string;
}

function SelectField({ label, value, onChange, options, description }: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
        {label}
      </label>
      <div className="grid gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              value === option.id
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                : 'bg-surface-800/50 border-surface-700/50 text-surface-300 hover:border-surface-600'
            }`}
          >
            {option.icon && (
              <span className="w-6 h-6 flex items-center justify-center text-sm font-mono">
                {option.icon}
              </span>
            )}
            <div className="flex-1 text-left">
              <span className="text-sm font-medium">{option.name}</span>
              {option.description && (
                <p className="text-xs text-surface-500 mt-0.5">{option.description}</p>
              )}
            </div>
            {value === option.id && (
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {description && (
        <p className="text-xs text-surface-500">{description}</p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  hint?: string;
  mono?: boolean;
}

function TextField({ label, value, onChange, placeholder, type = 'text', hint, mono }: TextFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          type={type === 'password' && !showPassword ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors ${
            mono ? 'font-mono' : ''
          }`}
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
          >
            {showPassword ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
      {hint && (
        <p className="text-xs text-surface-500">{hint}</p>
      )}
    </div>
  );
}

interface PriorityPickerProps {
  value: string;
  onChange: (value: string) => void;
}

function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
        Default Priority
      </label>
      <div className="flex gap-1">
        {PRIORITIES.map((priority) => (
          <button
            key={priority.id}
            type="button"
            onClick={() => onChange(priority.id)}
            className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all ${
              value === priority.id
                ? `${priority.color} text-white shadow-lg`
                : 'bg-surface-800/50 text-surface-400 hover:bg-surface-700/50'
            }`}
          >
            {priority.name}
          </button>
        ))}
      </div>
    </div>
  );
}

interface EffortPickerProps {
  value: string;
  onChange: (value: string) => void;
}

function EffortPicker({ value, onChange }: EffortPickerProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
        Default Effort
      </label>
      <div className="flex gap-1">
        {EFFORTS.map((effort) => (
          <button
            key={effort.id}
            type="button"
            onClick={() => onChange(effort.id)}
            className={`flex-1 py-2 px-1 rounded-lg transition-all ${
              value === effort.id
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200'
                : 'bg-surface-800/50 border border-transparent text-surface-400 hover:bg-surface-700/50'
            }`}
          >
            <span className="block text-xs font-medium">{effort.name}</span>
            <span className="block text-[10px] text-surface-500 mt-0.5">{effort.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Section Content
// ============================================================================

interface SectionProps {
  settings: ProjectSettings;
  updateSettings: (section: keyof ProjectSettings, updates: Partial<ProjectSettings[keyof ProjectSettings]>) => void;
  onResetSection: (section: keyof ProjectSettings) => void;
}

interface AISectionProps extends SectionProps {
  dynamicModels: typeof AI_MODELS;
  isLoadingModels: boolean;
  modelsError: string | null;
  onRefreshModels: () => void;
}

function AISection({ settings, updateSettings, onResetSection, dynamicModels, isLoadingModels, modelsError, onRefreshModels }: AISectionProps) {
  // Use dynamic models if available, otherwise fall back to static list
  const availableModels = dynamicModels.length > 0 ? dynamicModels : AI_MODELS;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            AI Assistant
          </h3>
          <p className="text-xs text-surface-500 mt-1">Configure AI-powered features</p>
        </div>
        <button
          type="button"
          onClick={() => onResetSection('ai')}
          className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* AI Enabled Toggle */}
      <ToggleSwitch
        enabled={settings.ai.enabled}
        onChange={(enabled) => updateSettings('ai', { enabled })}
        label="Enable AI Features"
        description="Use AI for task analysis and suggestions"
      />

      {/* AWS Configuration - moved up so profile/region are set before fetching models */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
            AWS Region
          </label>
          <select
            value={settings.ai.region}
            onChange={(e) => updateSettings('ai', { region: e.target.value })}
            className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          >
            {AWS_REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <TextField
          label="AWS Profile"
          value={settings.ai.profile}
          onChange={(profile) => updateSettings('ai', { profile })}
          placeholder="default"
          mono
        />
      </div>

      {/* Model Selection with refresh */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
            AI Models
          </label>
          <button
            type="button"
            onClick={onRefreshModels}
            disabled={isLoadingModels}
            className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Fetch available models from AWS Bedrock"
          >
            <svg
              className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoadingModels ? 'Loading...' : 'Refresh Models'}
          </button>
        </div>

        {/* Error message */}
        {modelsError && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{modelsError}</span>
          </div>
        )}

        {/* Model count indicator */}
        {dynamicModels.length > 0 && (
          <p className="text-xs text-emerald-400/80">
            ✓ {dynamicModels.length} models available from Bedrock
          </p>
        )}

        {/* Per-operation model selection */}
        <div className="space-y-3 p-3 rounded-lg bg-surface-800/30 border border-surface-700/50">
          <p className="text-xs text-surface-400">Choose models per operation to balance cost vs quality:</p>

          {/* Execution Model - Used when spawning agent to work on tasks */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-surface-300">Execution</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">Agent work</span>
            </div>
            <select
              value={settings.ai.workModel || 'claude-sonnet-4'}
              onChange={(e) => updateSettings('ai', { workModel: e.target.value })}
              className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
              ))}
            </select>
          </div>

          {/* AI Assist Model (primary) */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-surface-300">AI Assist</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">High quality</span>
            </div>
            <select
              value={settings.ai.model}
              onChange={(e) => updateSettings('ai', { model: e.target.value })}
              className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
              ))}
            </select>
          </div>

          {/* Similarity Check Model */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-surface-300">Similarity Check</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">Fast & cheap</span>
            </div>
            <select
              value={settings.ai.similarityModel || 'claude-haiku'}
              onChange={(e) => updateSettings('ai', { similarityModel: e.target.value })}
              className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
              ))}
            </select>
          </div>

          {/* Task Review Model */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-surface-300">Task Review</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">Balanced</span>
            </div>
            <select
              value={settings.ai.reviewModel || 'claude-sonnet-4'}
              onChange={(e) => updateSettings('ai', { reviewModel: e.target.value })}
              className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSection({ settings, updateSettings, onResetSection }: SectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            Workflow
          </h3>
          <p className="text-xs text-surface-500 mt-1">Configure how tasks are launched</p>
        </div>
        <button
          type="button"
          onClick={() => onResetSection('workflow')}
          className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Default Launch Mode */}
      <div className="space-y-3">
        <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
          Default Launch Mode
        </label>
        <p className="text-xs text-surface-500 -mt-1">
          Choose how &quot;Start Working&quot; launches your task
        </p>
        <div className="grid gap-2">
          {IDE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => updateSettings('workflow', { defaultIde: option.id })}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                settings.workflow.defaultIde === option.id
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                  : 'bg-surface-800/50 border-surface-700/50 text-surface-300 hover:border-surface-600'
              }`}
            >
              {/* Icon based on option */}
              <span className="w-6 h-6 flex items-center justify-center text-sm">
                {option.icon === 'iterm' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 8h18" />
                    <circle cx="6" cy="6" r="1" fill="#EF4444" stroke="none" />
                    <circle cx="9" cy="6" r="1" fill="#FBBF24" stroke="none" />
                    <circle cx="12" cy="6" r="1" fill="#22C55E" stroke="none" />
                    <path d="M7 12l3 2-3 2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13 16h4" strokeLinecap="round" />
                  </svg>
                )}
                {option.icon === 'code' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.583 2.005L8.994 9.572l-4.166-3.2-2.33 1.16 3.732 3.477-3.732 3.477 2.33 1.16 4.166-3.2 8.59 7.567 3.903-1.822V3.828l-3.904-1.823zm0 3.783v12.424l-5.588-4.925V10.71l5.588-4.922z"/>
                  </svg>
                )}
                {option.icon === 'cursor' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L6.35 2.86a.5.5 0 00-.85.35z"/>
                  </svg>
                )}
                {option.icon === 'kiro' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" stroke="currentColor" fill="none"/>
                    <path d="M8 12h8M12 8v8" strokeWidth="2" stroke="currentColor" strokeLinecap="round"/>
                  </svg>
                )}
                {option.icon === 'terminal' && (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {option.icon === 'folder' && (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                )}
              </span>
              <div className="flex-1 text-left">
                <span className="text-sm font-medium">{option.name}</span>
                <p className="text-xs text-surface-500 mt-0.5">{option.description}</p>
              </div>
              {settings.workflow.defaultIde === option.id && (
                <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Mode Explanation */}
      <div className="p-3 rounded-lg bg-surface-800/30 border border-surface-700/50">
        <p className="text-xs text-surface-400">
          <strong className="text-surface-300">iTerm + Claude</strong> opens a terminal with Claude running interactively - you can guide the AI, ask questions, and iterate.
          Other options open your IDE and copy the prompt to clipboard.
        </p>
      </div>
    </div>
  );
}

const MERGE_STRATEGIES: { id: MergeStrategy; name: string; description: string; icon: string }[] = [
  {
    id: 'pr',
    name: 'Create Pull Request',
    description: 'Push branch and create a PR on GitHub for review',
    icon: 'pr',
  },
  {
    id: 'local-merge',
    name: 'Merge Locally',
    description: 'Merge directly into target branch on your machine',
    icon: 'merge',
  },
  {
    id: 'ask',
    name: 'Ask Each Time',
    description: 'Prompt me to choose when shipping a task',
    icon: 'question',
  },
];

function GitSection({ settings, updateSettings, onResetSection }: SectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            Git & Shipping
          </h3>
          <p className="text-xs text-surface-500 mt-1">Configure version control and how tasks are shipped</p>
        </div>
        <button
          type="button"
          onClick={() => onResetSection('git')}
          className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Merge Strategy */}
      <div className="space-y-3">
        <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
          When Task is Ready to Ship
        </label>
        <div className="grid gap-2">
          {MERGE_STRATEGIES.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              onClick={() => updateSettings('git', { mergeStrategy: strategy.id })}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                settings.git.mergeStrategy === strategy.id
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                  : 'bg-surface-800/50 border-surface-700/50 text-surface-300 hover:border-surface-600'
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center">
                {strategy.icon === 'pr' && (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                )}
                {strategy.icon === 'merge' && (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                )}
                {strategy.icon === 'question' && (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </span>
              <div className="flex-1 text-left">
                <span className="text-sm font-medium">{strategy.name}</span>
                <p className="text-xs text-surface-500 mt-0.5">{strategy.description}</p>
              </div>
              {settings.git.mergeStrategy === strategy.id && (
                <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Target Branch */}
      <TextField
        label="Target Branch"
        value={settings.git.targetBranch}
        onChange={(targetBranch) => updateSettings('git', { targetBranch })}
        placeholder="main"
        hint="Branch to create PRs against or merge into"
        mono
      />

      <div className="border-t border-surface-700/50 pt-4 mt-4">
        <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">
          Worktree Settings
        </label>

        <TextField
          label="Worktree Location"
          value={settings.git.worktreeLocation}
          onChange={(worktreeLocation) => updateSettings('git', { worktreeLocation })}
          placeholder=".tasks"
          hint="Relative path where task worktrees are created"
          mono
        />
      </div>

      <TextField
        label="Default Branch"
        value={settings.git.defaultBranch}
        onChange={(defaultBranch) => updateSettings('git', { defaultBranch })}
        placeholder="main"
        hint="Branch to create worktrees from (usually same as target)"
        mono
      />

      <ToggleSwitch
        enabled={settings.git.autoCommitOnReview}
        onChange={(autoCommitOnReview) => updateSettings('git', { autoCommitOnReview })}
        label="Auto-commit on Review"
        description="Automatically commit changes before running code review"
      />
    </div>
  );
}

function TasksSection({ settings, updateSettings, onResetSection }: SectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </span>
            Task Defaults
          </h3>
          <p className="text-xs text-surface-500 mt-1">Set defaults for new tasks</p>
        </div>
        <button
          type="button"
          onClick={() => onResetSection('tasks')}
          className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          Reset
        </button>
      </div>

      <PriorityPicker
        value={settings.tasks.defaultPriority}
        onChange={(defaultPriority) => updateSettings('tasks', { defaultPriority })}
      />

      <EffortPicker
        value={settings.tasks.defaultEffort}
        onChange={(defaultEffort) => updateSettings('tasks', { defaultEffort })}
      />

      <ToggleSwitch
        enabled={settings.tasks.enableSimilarityCheck}
        onChange={(enableSimilarityCheck) => updateSettings('tasks', { enableSimilarityCheck })}
        label="Similarity Checking"
        description="Check for similar existing tasks when creating new ones"
      />
    </div>
  );
}

function GitHubSection({ settings, updateSettings, onResetSection }: SectionProps) {
  const isConnected = settings.github.repository && settings.github.token;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </span>
            GitHub Integration
          </h3>
          <p className="text-xs text-surface-500 mt-1">Sync tasks with GitHub Issues</p>
        </div>
        <button
          type="button"
          onClick={() => onResetSection('github')}
          className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Connection Status */}
      <div className={`flex items-center gap-2 p-3 rounded-lg border ${
        isConnected
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-surface-800/50 border-surface-700/50'
      }`}>
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-surface-600'}`} />
        <span className={`text-sm ${isConnected ? 'text-green-300' : 'text-surface-400'}`}>
          {isConnected ? 'Connected' : 'Not configured'}
        </span>
        {isConnected && (
          <span className="text-xs text-surface-500 ml-auto font-mono">
            {settings.github.repository}
          </span>
        )}
      </div>

      <TextField
        label="Repository"
        value={settings.github.repository}
        onChange={(repository) => updateSettings('github', { repository })}
        placeholder="owner/repo"
        hint="Format: owner/repository"
        mono
      />

      <TextField
        label="Personal Access Token"
        value={settings.github.token}
        onChange={(token) => updateSettings('github', { token })}
        placeholder="ghp_xxxxxxxxxxxx"
        type="password"
        hint="Needs 'repo' scope for private repositories"
        mono
      />
    </div>
  );
}

// ============================================================================
// Navigation
// ============================================================================

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'ai',
    label: 'AI Assistant',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    id: 'workflow',
    label: 'Workflow',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'git',
    label: 'Git',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
      </svg>
    ),
  },
];

// ============================================================================
// Main Modal
// ============================================================================

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('ai');
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Dynamic models state
  const [dynamicModels, setDynamicModels] = useState<typeof AI_MODELS>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Fetch models from Bedrock
  const fetchModels = useCallback(async (profile: string, region: string) => {
    setIsLoadingModels(true);
    setModelsError(null);
    try {
      const response = await fetch(`/api/ai-models?profile=${encodeURIComponent(profile)}&region=${encodeURIComponent(region)}`);
      const data = await response.json();

      if (data.error) {
        setModelsError(data.error);
        return;
      }

      if (data.models && data.models.length > 0) {
        // Transform API response to match our AI_MODELS format
        const models = data.models.map((m: { id: string; name: string; description: string; modelId: string }) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          modelId: m.modelId,
        }));
        setDynamicModels(models);
      }
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : 'Failed to fetch models');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    if (isOpen) {
      const loaded = loadSettings();
      setSettings(loaded);
      setOriginalSettings(loaded);
      setHasChanges(false);
    }
  }, [isOpen]);

  // Track changes
  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings));
  }, [settings, originalSettings]);

  const updateSettings = useCallback((
    section: keyof ProjectSettings,
    updates: Partial<ProjectSettings[keyof ProjectSettings]>
  ) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
  }, []);

  const handleResetSection = useCallback((section: keyof ProjectSettings) => {
    setSettings(prev => ({
      ...prev,
      [section]: DEFAULT_SETTINGS[section],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      saveSettings(settings);
      setOriginalSettings(settings);
      setHasChanges(false);
      // Brief delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 300));
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [settings, onClose]);

  const handleCancel = useCallback(() => {
    setSettings(originalSettings);
    onClose();
  }, [originalSettings, onClose]);

  // Check which sections have been modified
  const modifiedSections = new Set<SettingsSection>();
  if (JSON.stringify(settings.ai) !== JSON.stringify(originalSettings.ai)) modifiedSections.add('ai');
  if (JSON.stringify(settings.workflow) !== JSON.stringify(originalSettings.workflow)) modifiedSections.add('workflow');
  if (JSON.stringify(settings.git) !== JSON.stringify(originalSettings.git)) modifiedSections.add('git');
  if (JSON.stringify(settings.tasks) !== JSON.stringify(originalSettings.tasks)) modifiedSections.add('tasks');
  if (JSON.stringify(settings.github) !== JSON.stringify(originalSettings.github)) modifiedSections.add('github');

  const sectionProps: SectionProps = {
    settings,
    updateSettings,
    onResetSection: handleResetSection,
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[800px] md:max-h-[85vh] bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-scale-in">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center">
                  <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-display text-lg text-surface-100">Settings</h2>
                  <p className="text-xs text-surface-500">Project configuration</p>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-1 min-h-0">
              {/* Sidebar Navigation */}
              <nav className="w-48 shrink-0 border-r border-surface-800 p-2 space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      activeSection === item.id
                        ? 'bg-amber-500/10 text-amber-200 border border-amber-500/30'
                        : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 border border-transparent'
                    }`}
                  >
                    <span className={activeSection === item.id ? 'text-amber-400' : ''}>
                      {item.icon}
                    </span>
                    {item.label}
                    {modifiedSections.has(item.id) && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                ))}
              </nav>

              {/* Section Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div key={activeSection} className="animate-fade-in">
                  {activeSection === 'ai' && (
                    <AISection
                      {...sectionProps}
                      dynamicModels={dynamicModels}
                      isLoadingModels={isLoadingModels}
                      modelsError={modelsError}
                      onRefreshModels={() => fetchModels(settings.ai.profile, settings.ai.region)}
                    />
                  )}
                  {activeSection === 'workflow' && <WorkflowSection {...sectionProps} />}
                  {activeSection === 'git' && <GitSection {...sectionProps} />}
                  {activeSection === 'tasks' && <TasksSection {...sectionProps} />}
                  {activeSection === 'github' && <GitHubSection {...sectionProps} />}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-surface-800 bg-surface-900/80">
              <div className="text-xs text-surface-500">
                {hasChanges ? (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Unsaved changes
                  </span>
                ) : (
                  'All changes saved'
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-surface-300 hover:text-surface-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    hasChanges && !isSaving
                      ? 'bg-amber-500 hover:bg-amber-400 text-surface-900 shadow-lg hover:shadow-amber-500/25'
                      : 'bg-surface-800 text-surface-500 cursor-not-allowed'
                  }`}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
    </>
  );
}
