import os from 'node:os';
import path from 'node:path';

/**
 * Resolves the Claude Code configuration directory.
 *
 * Honors CLAUDE_CONFIG_DIR — the same environment variable the Claude Code CLI
 * uses to relocate its profile (credentials, projects, sessions, settings.json,
 * commands, skills). Falls back to ~/.claude when unset, matching the CLI's and
 * this app's historical default.
 *
 * Set CLAUDE_CONFIG_DIR (e.g. in .env) to point the whole app at an alternate
 * profile such as ~/.claude-13layers.
 */
export function getClaudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim();
  return override || path.join(os.homedir(), '.claude');
}

/**
 * Resolves Claude Code's global config file (.claude.json), which holds MCP
 * server definitions among other settings. The CLI keeps this file inside
 * CLAUDE_CONFIG_DIR when that variable is set, and at ~/.claude.json otherwise.
 */
export function getClaudeJsonPath(): string {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim();
  return override
    ? path.join(override, '.claude.json')
    : path.join(os.homedir(), '.claude.json');
}
