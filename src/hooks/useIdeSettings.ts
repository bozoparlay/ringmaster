'use client';

import { useState, useEffect, useCallback } from 'react';

export type IdeType = 'vscode' | 'terminal' | 'cursor' | 'kiro' | 'worktree' | 'iterm-interactive';

// Execution mode determines how Claude is launched
export type ExecutionMode = 'interactive' | 'autonomous';

export interface IdeOption {
  id: IdeType;
  name: string;
  description: string;
  command: string;
  icon: 'code' | 'terminal' | 'cursor' | 'kiro' | 'folder' | 'iterm';
  executionMode: ExecutionMode;
}

export const IDE_OPTIONS: IdeOption[] = [
  {
    id: 'iterm-interactive',
    name: 'iTerm + Claude',
    description: 'Opens iTerm with Claude running - you can interact and guide',
    command: 'iterm',
    icon: 'iterm',
    executionMode: 'interactive',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Open in Visual Studio Code, prompt copied',
    command: 'code -n',
    icon: 'code',
    executionMode: 'interactive',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Open in Cursor IDE, prompt copied',
    command: 'cursor',
    icon: 'cursor',
    executionMode: 'interactive',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    description: 'Open in Kiro IDE, prompt copied',
    command: 'kiro',
    icon: 'kiro',
    executionMode: 'interactive',
  },
  {
    id: 'terminal',
    name: 'Terminal Only',
    description: 'Copy prompt to clipboard only',
    command: '',
    icon: 'terminal',
    executionMode: 'interactive',
  },
  {
    id: 'worktree',
    name: 'Worktree Only',
    description: 'Create branch/worktree, nothing else',
    command: '',
    icon: 'folder',
    executionMode: 'interactive',
  },
];

const STORAGE_KEY = 'ringmaster-ide-preference';
const DEFAULT_IDE: IdeType = 'iterm-interactive';

export function useIdeSettings() {
  const [selectedIde, setSelectedIde] = useState<IdeType>(DEFAULT_IDE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && IDE_OPTIONS.some(opt => opt.id === stored)) {
      setSelectedIde(stored as IdeType);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when changed
  const setIde = useCallback((ide: IdeType) => {
    setSelectedIde(ide);
    localStorage.setItem(STORAGE_KEY, ide);
  }, []);

  const currentIde = IDE_OPTIONS.find(opt => opt.id === selectedIde) || IDE_OPTIONS[0];

  return {
    selectedIde,
    setIde,
    currentIde,
    ideOptions: IDE_OPTIONS,
    isLoaded,
  };
}
