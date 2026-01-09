'use client';

import { useState, useEffect, useCallback } from 'react';

export type IdeType = 'vscode' | 'terminal' | 'cursor' | 'kiro';

export interface IdeOption {
  id: IdeType;
  name: string;
  description: string;
  command: string;
  icon: 'code' | 'terminal' | 'cursor' | 'kiro';
}

export const IDE_OPTIONS: IdeOption[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Open in Visual Studio Code',
    command: 'code -n',
    icon: 'code',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Open in Cursor IDE',
    command: 'cursor',
    icon: 'cursor',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    description: 'Open in Kiro IDE',
    command: 'kiro',
    icon: 'kiro',
  },
  {
    id: 'terminal',
    name: 'Terminal Only',
    description: 'Copy prompt to clipboard only',
    command: '',
    icon: 'terminal',
  },
];

const STORAGE_KEY = 'ringmaster-ide-preference';
const DEFAULT_IDE: IdeType = 'vscode';

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
