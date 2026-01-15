#!/usr/bin/env npx ts-node
/**
 * Context Generator - Simple, language-agnostic documentation generator
 *
 * Reads source files and creates a simple overview in .ringmaster/CONTEXT.md
 * Works with any codebase - no AST parsing, just file analysis.
 *
 * Usage: npm run generate-context [path]
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
interface Config {
  rootPath: string;
  outputDir: string;
  maxDepth: number;
  maxFileSize: number; // bytes
  sourceExtensions: string[];
  excludeDirs: string[];
  includeFileContents: boolean;
  maxFilesToInclude: number;
}

const DEFAULT_CONFIG: Config = {
  rootPath: './src',
  outputDir: '.ringmaster',
  maxDepth: 10,
  maxFileSize: 50000, // 50KB
  sourceExtensions: [
    // JavaScript/TypeScript
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    // Python
    '.py', '.pyx', '.pyi',
    // Go
    '.go',
    // Rust
    '.rs',
    // Java/Kotlin
    '.java', '.kt', '.kts',
    // C/C++
    '.c', '.cpp', '.cc', '.h', '.hpp',
    // Ruby
    '.rb', '.rake',
    // PHP
    '.php',
    // Swift
    '.swift',
    // Shell
    '.sh', '.bash', '.zsh',
    // Config/Data
    '.json', '.yaml', '.yml', '.toml',
    // Web
    '.html', '.css', '.scss', '.sass', '.less',
    // SQL
    '.sql',
    // Markdown (for docs)
    '.md',
  ],
  excludeDirs: [
    'node_modules', '.git', '.next', 'dist', 'build', '.cache',
    '__pycache__', '.pytest_cache', 'venv', '.venv', 'env',
    'target', 'vendor', '.idea', '.vscode', '.ringmaster',
    'coverage', '.nyc_output', '.tasks',
  ],
  includeFileContents: false,
  maxFilesToInclude: 50,
};

interface FileInfo {
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  lines: number;
  firstComment?: string; // First comment/docstring found
}

interface DirectoryInfo {
  path: string;
  name: string;
  files: FileInfo[];
  subdirs: DirectoryInfo[];
  totalFiles: number;
  totalLines: number;
}

/**
 * Extract the first comment block from a file
 */
function extractFirstComment(content: string, ext: string): string | undefined {
  // Try different comment styles based on common patterns
  const patterns: RegExp[] = [];

  // JSDoc / Block comments (JS, TS, Java, C, etc.)
  patterns.push(/^\/\*\*[\s\S]*?\*\//m);
  patterns.push(/^\/\*[\s\S]*?\*\//m);

  // Python/Ruby docstrings
  patterns.push(/^"""[\s\S]*?"""/m);
  patterns.push(/^'''[\s\S]*?'''/m);

  // Line comments at start (multiple lines)
  patterns.push(/^(?:\/\/[^\n]*\n)+/m);
  patterns.push(/^(?:#[^\n]*\n)+/m);
  patterns.push(/^(?:--[^\n]*\n)+/m);

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let comment = match[0]
        .replace(/^\/\*\*?\s*|\s*\*\/$/g, '') // Remove /* */ markers
        .replace(/^"""|"""$/g, '') // Remove docstring markers
        .replace(/^'''|'''$/g, '')
        .replace(/^\s*\*\s?/gm, '') // Remove * prefix from JSDoc lines
        .replace(/^\/\/\s?/gm, '') // Remove // prefix
        .replace(/^#\s?/gm, '') // Remove # prefix
        .replace(/^--\s?/gm, '') // Remove -- prefix
        .trim();

      // Only return if it looks like documentation (not just code)
      if (comment.length > 10 && comment.length < 500) {
        return comment;
      }
    }
  }

  return undefined;
}

/**
 * Count lines in content
 */
function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Analyze a single file
 */
function analyzeFile(filePath: string, rootPath: string): FileInfo | null {
  try {
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(rootPath, filePath);
    const ext = path.extname(filePath);

    // Skip large files
    if (stats.size > DEFAULT_CONFIG.maxFileSize) {
      return {
        path: filePath,
        relativePath,
        extension: ext,
        size: stats.size,
        lines: 0,
        firstComment: '(File too large to analyze)',
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      path: filePath,
      relativePath,
      extension: ext,
      size: stats.size,
      lines: countLines(content),
      firstComment: extractFirstComment(content, ext),
    };
  } catch {
    return null;
  }
}

/**
 * Recursively scan a directory
 */
function scanDirectory(dirPath: string, rootPath: string, config: Config, depth: number = 0): DirectoryInfo | null {
  if (depth > config.maxDepth) return null;

  const dirName = path.basename(dirPath);

  // Skip excluded directories
  if (config.excludeDirs.includes(dirName)) return null;

  const result: DirectoryInfo = {
    path: dirPath,
    name: dirName,
    files: [],
    subdirs: [],
    totalFiles: 0,
    totalLines: 0,
  };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const subDir = scanDirectory(fullPath, rootPath, config, depth + 1);
      if (subDir) {
        result.subdirs.push(subDir);
        result.totalFiles += subDir.totalFiles;
        result.totalLines += subDir.totalLines;
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (config.sourceExtensions.includes(ext)) {
        const fileInfo = analyzeFile(fullPath, rootPath);
        if (fileInfo) {
          result.files.push(fileInfo);
          result.totalFiles++;
          result.totalLines += fileInfo.lines;
        }
      }
    }
  }

  return result;
}

/**
 * Detect the primary language of the codebase
 */
function detectLanguage(root: DirectoryInfo): string {
  const extCounts: Record<string, number> = {};

  function countExtensions(dir: DirectoryInfo) {
    for (const file of dir.files) {
      extCounts[file.extension] = (extCounts[file.extension] || 0) + 1;
    }
    for (const subDir of dir.subdirs) {
      countExtensions(subDir);
    }
  }

  countExtensions(root);

  const langMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.c': 'C', '.cpp': 'C++',
  };

  let maxCount = 0;
  let primaryLang = 'Unknown';

  for (const [ext, count] of Object.entries(extCounts)) {
    if (langMap[ext] && count > maxCount) {
      maxCount = count;
      primaryLang = langMap[ext];
    }
  }

  return primaryLang;
}

/**
 * Generate the CONTEXT.md content
 */
function generateContext(root: DirectoryInfo, projectName: string): string {
  const lines: string[] = [];
  const language = detectLanguage(root);

  lines.push(`# ${projectName} - Codebase Context`);
  lines.push('');
  lines.push(`> Auto-generated overview for AI assistants`);
  lines.push('');

  // Quick stats
  lines.push('## Overview');
  lines.push('');
  lines.push(`- **Primary Language**: ${language}`);
  lines.push(`- **Total Files**: ${root.totalFiles}`);
  lines.push(`- **Total Lines**: ${root.totalLines.toLocaleString()}`);
  lines.push('');

  // Directory structure
  lines.push('## Structure');
  lines.push('');
  lines.push('```');

  function printTree(dir: DirectoryInfo, prefix: string = '') {
    // Print files
    for (const file of dir.files.slice(0, 10)) {
      const basename = path.basename(file.relativePath);
      lines.push(`${prefix}${basename}`);
    }
    if (dir.files.length > 10) {
      lines.push(`${prefix}... and ${dir.files.length - 10} more files`);
    }

    // Print subdirs
    for (let i = 0; i < dir.subdirs.length; i++) {
      const subDir = dir.subdirs[i];
      const isLast = i === dir.subdirs.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';

      lines.push(`${prefix}${connector}${subDir.name}/ (${subDir.totalFiles} files)`);
      if (subDir.subdirs.length > 0 || subDir.files.length > 0) {
        printTree(subDir, prefix + extension);
      }
    }
  }

  lines.push(`${root.name}/`);
  printTree(root, '  ');
  lines.push('```');
  lines.push('');

  // Key files with descriptions
  lines.push('## Key Files');
  lines.push('');

  function collectKeyFiles(dir: DirectoryInfo): FileInfo[] {
    const keyFiles: FileInfo[] = [];

    // Important file patterns
    const importantPatterns = [
      /^index\./,
      /^main\./,
      /^app\./,
      /^page\./,
      /^layout\./,
      /^route\./,
      /^api\./,
      /\.config\./,
      /README/i,
    ];

    for (const file of dir.files) {
      const basename = path.basename(file.relativePath);
      if (importantPatterns.some(p => p.test(basename)) || file.firstComment) {
        keyFiles.push(file);
      }
    }

    for (const subDir of dir.subdirs) {
      keyFiles.push(...collectKeyFiles(subDir));
    }

    return keyFiles;
  }

  const keyFiles = collectKeyFiles(root).slice(0, 30);

  if (keyFiles.length > 0) {
    for (const file of keyFiles) {
      lines.push(`### ${file.relativePath}`);
      if (file.firstComment) {
        lines.push(`> ${file.firstComment.split('\n')[0]}`);
      }
      lines.push(`- ${file.lines} lines`);
      lines.push('');
    }
  } else {
    lines.push('No documented files found.');
    lines.push('');
  }

  // Directory summaries
  lines.push('## Directories');
  lines.push('');

  function summarizeDir(dir: DirectoryInfo, depth: number = 0) {
    if (depth > 2) return; // Only go 2 levels deep

    const heading = '#'.repeat(Math.min(3 + depth, 6));
    lines.push(`${heading} ${dir.name}/`);
    lines.push(`${dir.totalFiles} files, ${dir.totalLines.toLocaleString()} lines`);
    lines.push('');

    // List some files
    if (dir.files.length > 0) {
      const displayFiles = dir.files.slice(0, 5);
      for (const file of displayFiles) {
        const basename = path.basename(file.relativePath);
        lines.push(`- \`${basename}\`${file.firstComment ? ` - ${file.firstComment.split('\n')[0].slice(0, 60)}` : ''}`);
      }
      if (dir.files.length > 5) {
        lines.push(`- ... and ${dir.files.length - 5} more`);
      }
      lines.push('');
    }

    // Recurse
    for (const subDir of dir.subdirs) {
      summarizeDir(subDir, depth + 1);
    }
  }

  for (const subDir of root.subdirs) {
    summarizeDir(subDir);
  }

  lines.push('---');
  lines.push(`*Generated: ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const rootPath = path.resolve(args[0] || './src');
  const projectName = path.basename(path.resolve('.'));

  console.log(`🔍 Scanning: ${rootPath}`);
  const startTime = Date.now();

  const config = { ...DEFAULT_CONFIG, rootPath };

  // Scan the codebase
  const root = scanDirectory(rootPath, rootPath, config);

  if (!root) {
    console.error('❌ Failed to scan directory');
    process.exit(1);
  }

  // Create output directory
  const outputDir = path.join(path.resolve('.'), config.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate context
  const context = generateContext(root, projectName);
  const outputPath = path.join(outputDir, 'CONTEXT.md');
  fs.writeFileSync(outputPath, context);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('');
  console.log(`✅ Done in ${duration}s`);
  console.log(`   📁 ${root.totalFiles} files`);
  console.log(`   📝 ${root.totalLines.toLocaleString()} lines`);
  console.log(`   📄 ${outputPath}`);
}

main().catch(console.error);
