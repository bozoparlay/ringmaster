/**
 * Config API Endpoint
 *
 * Manages server-side configuration for GitHub credentials.
 * Credentials are stored in ~/.ringmaster/config.json and survive browser cache clears.
 *
 * GET - Check if credentials are configured (returns source, not token)
 * POST - Save credentials to config file
 * DELETE - Clear credentials from config file
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getGitHubCredentials,
  hasGitHubCredentials,
  saveGitHubCredentials,
  clearGitHubCredentials,
  getConfigFilePath,
  maskToken,
} from '@/lib/config/github-credentials';

/**
 * GET /api/config
 *
 * Returns credential status without exposing the actual token.
 */
export async function GET() {
  try {
    const { configured, source } = await hasGitHubCredentials();

    if (!configured) {
      return NextResponse.json({
        configured: false,
        source: 'none',
        configFilePath: getConfigFilePath(),
      });
    }

    // Get credentials to show masked token and username
    const credentials = await getGitHubCredentials();

    return NextResponse.json({
      configured: true,
      source,
      username: credentials?.username || null,
      maskedToken: credentials ? maskToken(credentials.token) : null,
      configFilePath: source === 'file' ? getConfigFilePath() : null,
      envVarConfigured: source === 'env',
    });
  } catch (error) {
    console.error('[config] Error checking credentials:', error);
    return NextResponse.json(
      { error: 'Failed to check configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config
 *
 * Save GitHub credentials to ~/.ringmaster/config.json
 *
 * Body: { token: string, username?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, username } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Validate token format (GitHub PATs start with ghp_, github_pat_, or gho_)
    const validPrefixes = ['ghp_', 'github_pat_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];
    const hasValidPrefix = validPrefixes.some(prefix => token.startsWith(prefix));

    if (!hasValidPrefix && token.length < 40) {
      return NextResponse.json(
        { error: 'Invalid token format. GitHub PATs typically start with ghp_, github_pat_, etc.' },
        { status: 400 }
      );
    }

    // Check if env var is set (warn user it takes precedence)
    const envConfigured = !!process.env.GITHUB_TOKEN;

    // Save to config file
    await saveGitHubCredentials(token, username);

    return NextResponse.json({
      success: true,
      configFilePath: getConfigFilePath(),
      warning: envConfigured
        ? 'Note: GITHUB_TOKEN is set in .env.local and takes precedence over the saved config.'
        : null,
    });
  } catch (error) {
    console.error('[config] Error saving credentials:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/config
 *
 * Clear GitHub credentials from config file.
 * Note: Cannot clear .env.local - user must do that manually.
 */
export async function DELETE() {
  try {
    const { cleared, hadEnvVar } = await clearGitHubCredentials();

    return NextResponse.json({
      success: true,
      cleared,
      warning: hadEnvVar
        ? 'Note: GITHUB_TOKEN is still set in .env.local. Remove it manually to fully disconnect.'
        : null,
    });
  } catch (error) {
    console.error('[config] Error clearing credentials:', error);
    return NextResponse.json(
      { error: 'Failed to clear configuration' },
      { status: 500 }
    );
  }
}
