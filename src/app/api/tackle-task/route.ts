import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface TackleRequest {
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  backlogPath?: string;
}

export async function POST(request: Request) {
  try {
    const { title, description, category, priority, backlogPath } = await request.json() as TackleRequest;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Build the prompt for Claude Code
    const promptParts = [`Task: ${title}`];

    if (priority) {
      promptParts.push(`Priority: ${priority}`);
    }

    if (category) {
      promptParts.push(`Category: ${category}`);
    }

    if (description) {
      promptParts.push(`\nDescription:\n${description}`);
    }

    const prompt = promptParts.join('\n');

    // Escape single quotes for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // The command to run claude with the task context
    const claudeCommand = `claude '${escapedPrompt}'`;

    // Copy to clipboard using pbcopy (macOS)
    try {
      await execAsync(`echo '${escapedPrompt}' | pbcopy`);
    } catch {
      // Clipboard copy failed, continue anyway
      console.warn('Failed to copy to clipboard');
    }

    // Try to open VS Code in a new window at the backlog directory
    try {
      // Use the backlog file's directory, or fall back to cwd
      let targetDir = process.cwd();
      if (backlogPath) {
        targetDir = path.dirname(backlogPath);
      }
      // -n flag forces a new window
      await execAsync(`code -n "${targetDir}"`);
    } catch {
      // VS Code not available or failed to open
      console.warn('Failed to open VS Code');
    }

    return NextResponse.json({
      success: true,
      command: claudeCommand,
      message: 'Command copied to clipboard. Open VS Code terminal and paste to start!',
    });
  } catch (error) {
    console.error('Tackle task error:', error);
    return NextResponse.json(
      { error: 'Failed to prepare task' },
      { status: 500 }
    );
  }
}
