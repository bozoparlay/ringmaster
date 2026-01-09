'use client';

interface AcceptanceCriteriaEditorProps {
  criteria: string[];
  onChange: (criteria: string[]) => void;
  showEmptyWarning?: boolean;
  placeholder?: string;
}

export function AcceptanceCriteriaEditor({
  criteria,
  onChange,
  showEmptyWarning = true,
  placeholder = 'Describe a verifiable success condition...',
}: AcceptanceCriteriaEditorProps) {
  const handleUpdate = (index: number, value: string) => {
    const newCriteria = [...criteria];
    newCriteria[index] = value;
    onChange(newCriteria);
  };

  const handleDelete = (index: number) => {
    const newCriteria = criteria.filter((_, i) => i !== index);
    onChange(newCriteria);
  };

  const handleAdd = () => {
    onChange([...criteria, '']);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
          Acceptance Criteria
        </label>
        <span className="text-[10px] text-surface-500">
          {criteria.length} criteria
        </span>
      </div>

      {/* Existing criteria */}
      <div className="space-y-1.5 mb-2">
        {criteria.map((criterion, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-2 bg-surface-800/50 border border-surface-700/50 rounded-lg"
          >
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-4 h-4 rounded border-2 border-emerald-500/50 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-sm bg-emerald-500/30" />
              </div>
            </div>
            <input
              type="text"
              value={criterion}
              onChange={(e) => handleUpdate(index, e.target.value)}
              className="flex-1 bg-transparent text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => handleDelete(index)}
              className="opacity-0 group-hover:opacity-100 p-1 text-surface-500 hover:text-red-400 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add new criterion */}
      <button
        type="button"
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-surface-800/30 hover:bg-surface-800/50 border border-dashed border-surface-700 hover:border-surface-600 rounded-lg text-xs text-surface-500 hover:text-surface-400 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Criterion
      </button>

      {/* Hint when empty */}
      {showEmptyWarning && criteria.length === 0 && (
        <p className="mt-2 text-[11px] text-amber-400/70 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Required: Define when this task is &quot;done&quot;
        </p>
      )}
    </div>
  );
}
