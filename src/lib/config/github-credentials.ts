/**
 * GitHub Credentials - Server-Side Configuration
 *
 * Priority order:
 * 1. Environment variables (.env.local) - GITHUB_TOKEN, GITHUB_USERNAME
 * 2. User config file (~/.ringmaster/config.json)
 * 3. Legacy localStorage (client-side fallback, for migration)
 *
 * This module is SERVER-SIDE ONLY - do not import from client components.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Config file location
const CONFIG_DIR = join(homedir(), '.ringmaster');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * GitHub credentials structure
 */
export interface GitHubCredentials {
  token: string;
  username?: string;
  source: 'env' | 'file' | 'none';
}

/**
 * Full config file structure
 */
interface RingmasterConfig {
  github?: {
    token: string;
    username?: string;
    createdAt?: string;
  };
}

/**
 * Get GitHub credentials from environment or config file
 *
 * Priority:
 * 1. GITHUB_TOKEN env var (from .env.local)
 * 2. ~/.ringmaster/config.json
 */
export async function getGitHubCredentials(): Promise<GitHubCredentials | null> {
  // 1. Check environment variables first
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return {
      token: envToken,
      username: process.env.GITHUB_USERNAME,
      source: 'env',
    };
  }

  // 2. Check config file
  const fileConfig = await readConfigFile();
  if (fileConfig?.github?.token) {
    return {
      token: fileConfig.github.token,
      username: fileConfig.github.username,
      source: 'file',
    };
  }

  return null;
}

/**
 * Check if GitHub credentials are configured (without exposing token)
 */
export async function hasGitHubCredentials(): Promise<{ configured: boolean; source: 'env' | 'file' | 'none' }> {
  // Check env first
  if (process.env.GITHUB_TOKEN) {
    return { configured: true, source: 'env' };
  }

  // Check config file
  const fileConfig = await readConfigFile();
  if (fileConfig?.github?.token) {
    return { configured: true, source: 'file' };
  }

  return { configured: false, source: 'none' };
}

/**
 * Save GitHub credentials to ~/.ringmaster/config.json
 */
export async function saveGitHubCredentials(token: string, username?: string): Promise<void> {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }

  // Read existing config or create new
  let config: RingmasterConfig = {};
  try {
    config = await readConfigFile() || {};
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  // Update GitHub credentials
  config.github = {
    token,
    username,
    createdAt: new Date().toISOString(),
  };

  // Write config file
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Clear GitHub credentials from config file
 * (Cannot clear env vars - those require manual removal)
 */
export async function clearGitHubCredentials(): Promise<{ cleared: boolean; hadEnvVar: boolean }> {
  const hadEnvVar = !!process.env.GITHUB_TOKEN;

  // Read existing config
  const config = await readConfigFile();
  if (config?.github) {
    delete config.github;
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return { cleared: true, hadEnvVar };
  }

  return { cleared: false, hadEnvVar };
}

/**
 * Read the config file
 */
async function readConfigFile(): Promise<RingmasterConfig | null> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as RingmasterConfig;
  } catch {
    return null;
  }
}

/**
 * Get config file path (for user reference)
 */
export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

/**
 * Mask a token for safe display (show first 4 and last 4 chars)
 */
export function maskToken(token: string): string {
  if (token.length <= 12) {
    return '****';
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
