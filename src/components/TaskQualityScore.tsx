'use client';

import { useState } from 'react';

interface TaskQualityScoreProps {
  score: number;
  issues: string[];
}

// Quality dimensions with their associated issue patterns
const QUALITY_DIMENSIONS = [
  {
    id: 'description',
    label: 'Description',
    shortLabel: 'Desc',
    patterns: ['description', 'brief', 'detail', 'expand beyond'],
  },
  {
    id: 'criteria',
    label: 'Acceptance Criteria',
    shortLabel: 'AC',
    patterns: ['acceptance criteria', 'vague'],
  },
  {
    id: 'actionable',
    label: 'Actionable',
    shortLabel: 'Action',
    patterns: ['requirements', 'approach', 'symptom'],
  },
  {
    id: 'structure',
    label: 'Structure',
    shortLabel: 'Format',
    patterns: ['structured', 'sections'],
  },
] as const;

function getDimensionStatus(issues: string[]): Record<string, boolean> {
  const status: Record<string, boolean> = {};

  for (const dim of QUALITY_DIMENSIONS) {
    // Dimension passes if no issues match its patterns
    const hasIssue = issues.some(issue =>
      dim.patterns.some(pattern =>
        issue.toLowerCase().includes(pattern.toLowerCase())
      )
    );
    status[dim.id] = !hasIssue;
  }

  return status;
}

function getScoreColor(score: number): {
  text: string;
  bg: string;
  ring: string;
  glow: string;
} {
  if (score >= 70) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500',
      ring: 'stroke-emerald-500',
      glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500',
      ring: 'stroke-amber-500',
      glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    };
  }
  return {
    text: 'text-red-400',
    bg: 'bg-red-500',
    ring: 'stroke-red-500',
    glow: 'drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]',
  };
}

function getQualityLabel(score: number): string {
  if (score >= 70) return 'Well-defined';
  if (score >= 50) return 'Needs detail';
  return 'Incomplete';
}

// Circular progress arc component
function ScoreArc({ score, size = 64 }: { score: number; size?: number }) {
  const colors = getScoreColor(score);
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className={`relative ${colors.glow}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface-700"
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={`${colors.ring} transition-all duration-700 ease-out`}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference - progress,
          }}
        />
      </svg>
      {/* Score number in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-lg font-semibold tabular-nums ${colors.text}`}>
          {score}
        </span>
      </div>
    </div>
  );
}

export function TaskQualityScore({ score, issues }: TaskQualityScoreProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = getScoreColor(score);
  const dimensionStatus = getDimensionStatus(issues);
  const passedCount = Object.values(dimensionStatus).filter(Boolean).length;

  return (
    <div className="mt-3 space-y-3">
      {/* Header with label */}
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-surface-500 font-medium">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Task Quality
      </div>

      {/* Main score display */}
      <div className="flex items-center gap-4">
        <ScoreArc score={score} />

        <div className="flex-1 min-w-0 space-y-2">
          {/* Quality label */}
          <div className={`text-sm font-medium ${colors.text}`}>
            {getQualityLabel(score)}
          </div>

          {/* Dimension indicators */}
          <div className="flex flex-wrap gap-1">
            {QUALITY_DIMENSIONS.map(dim => {
              const passed = dimensionStatus[dim.id];
              return (
                <div
                  key={dim.id}
                  className={`
                    px-1.5 py-0.5 rounded text-[10px] font-medium
                    transition-colors duration-200
                    ${passed
                      ? 'bg-surface-700/50 text-surface-400'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }
                  `}
                  title={dim.label}
                >
                  {passed ? '✓' : '!'} {dim.shortLabel}
                </div>
              );
            })}
          </div>

          {/* Summary line */}
          <div className="text-[10px] text-surface-500">
            {passedCount}/{QUALITY_DIMENSIONS.length} checks passed
          </div>
        </div>
      </div>

      {/* Expandable issues section */}
      {issues.length > 0 && (
        <div className="space-y-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[10px] text-surface-500 hover:text-surface-400 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {issues.length} improvement{issues.length !== 1 ? 's' : ''} suggested
          </button>

          {expanded && (
            <div className="pl-4 space-y-1 animate-in slide-in-from-top-1 duration-200">
              {issues.map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-[11px] text-surface-400"
                >
                  <span className="text-surface-600 mt-0.5 select-none">→</span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
