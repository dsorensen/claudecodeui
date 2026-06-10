import { readFile } from 'node:fs/promises';
import path from 'node:path';

import spawn from 'cross-spawn';

import { resolveClaudeCodeExecutablePath } from '@/shared/claude-cli-path.js';
import { getClaudeConfigDir } from '@/shared/claude-config-dir.js';
import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';
import { readObjectRecord, readOptionalString } from '@/shared/utils.js';

type ClaudeCredentialsStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

const hasErrorCode = (error: unknown, code: string): boolean => (
  error instanceof Error && 'code' in error && error.code === code
);

/**
 * Result of reading ~/.claude/.credentials.json: either valid (unexpired) OAuth
 * with the account email, or invalid with a user-facing reason.
 */
export type ClaudeOAuthState =
  | { kind: 'valid'; email: string | null }
  | { kind: 'invalid'; error: string };

/**
 * Decides Claude auth status with OAuth-first priority: a valid Pro-subscription
 * OAuth login wins over a stray ANTHROPIC_API_KEY in the environment or
 * settings.json, so users see their account identity and use their subscription
 * rather than pay-as-you-go API billing. Falls back to API key sources, and
 * surfaces the OAuth read error only when nothing authenticates.
 */
export function resolveClaudeAuthStatus(
  oauth: ClaudeOAuthState,
  envApiKey: string | null | undefined,
  settingsApiKey: string | null | undefined,
  settingsAuthToken: string | null | undefined,
): ClaudeCredentialsStatus {
  if (oauth.kind === 'valid') {
    return { authenticated: true, email: oauth.email, method: 'credentials_file' };
  }
  if (envApiKey?.trim()) {
    return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
  }
  if (settingsApiKey?.trim()) {
    return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
  }
  if (settingsAuthToken?.trim()) {
    return { authenticated: true, email: 'Configured via settings.json', method: 'api_key' };
  }
  return { authenticated: false, email: null, method: null, error: oauth.error };
}

export class ClaudeProviderAuth implements IProviderAuth {
  private readonly explicitConfigDir?: string;

  constructor(configDir?: string) {
    this.explicitConfigDir = configDir;
  }

  private get configDir(): string {
    return this.explicitConfigDir ?? getClaudeConfigDir();
  }

  /**
   * Checks whether the Claude Code CLI is available on this host.
   */
  private checkInstalled(): boolean {
    const cliPath = resolveClaudeCodeExecutablePath(process.env.CLAUDE_CLI_PATH);
    try {
      spawn.sync(cliPath, ['--version'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns Claude installation and credential status using Claude Code's auth priority.
   */
  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();

    if (!installed) {
      return {
        installed,
        provider: 'claude',
        authenticated: false,
        email: null,
        method: null,
        error: 'Claude Code CLI is not installed',
      };
    }

    const credentials = await this.checkCredentials();

    return {
      installed,
      provider: 'claude',
      authenticated: credentials.authenticated,
      email: credentials.authenticated ? credentials.email || 'Authenticated' : credentials.email,
      method: credentials.method,
      error: credentials.authenticated ? undefined : credentials.error || 'Not authenticated',
    };
  }

  /**
   * Reads Claude settings env values that the CLI can use even when the server process env is empty.
   */
  private async loadSettingsEnv(): Promise<Record<string, unknown>> {
    try {
      const settingsPath = path.join(this.configDir, 'settings.json');
      const content = await readFile(settingsPath, 'utf8');
      const settings = readObjectRecord(JSON.parse(content));
      return readObjectRecord(settings?.env) ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Reads OAuth credentials from `<configDir>/.credentials.json`, classifying
   * the result as valid (unexpired) or invalid with a user-facing reason.
   */
  private async readOAuthState(): Promise<ClaudeOAuthState> {
    const missingCredentialsError = 'Claude CLI is not authenticated. Run claude /login or configure ANTHROPIC_API_KEY.';

    try {
      const credPath = path.join(this.configDir, '.credentials.json');
      const content = await readFile(credPath, 'utf8');
      const creds = readObjectRecord(JSON.parse(content)) ?? {};
      const oauth = readObjectRecord(creds.claudeAiOauth);
      const accessToken = readOptionalString(oauth?.accessToken);

      if (!accessToken) {
        return { kind: 'invalid', error: missingCredentialsError };
      }

      const expiresAt = typeof oauth?.expiresAt === 'number' ? oauth.expiresAt : undefined;
      if (expiresAt && Date.now() >= expiresAt) {
        return { kind: 'invalid', error: 'Claude login has expired. Run claude /login again.' };
      }

      const email = readOptionalString(creds.email) ?? readOptionalString(creds.user) ?? null;
      return { kind: 'valid', email };
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return { kind: 'invalid', error: missingCredentialsError };
      }
      if (error instanceof SyntaxError) {
        return { kind: 'invalid', error: 'Claude credentials are unreadable. Run claude /login again.' };
      }
      return { kind: 'invalid', error: 'Unable to read Claude credentials. Run claude /login again.' };
    }
  }

  /**
   * Whether valid, unexpired OAuth credentials exist for this config dir. Used to
   * decide whether to strip ANTHROPIC_API_KEY when spawning Claude processes so
   * OAuth (the Pro subscription) takes precedence over a stray env API key.
   */
  async hasClaudeOAuth(): Promise<boolean> {
    return (await this.readOAuthState()).kind === 'valid';
  }

  /**
   * Checks Claude credentials with OAuth-first priority (see
   * {@link resolveClaudeAuthStatus}).
   */
  private async checkCredentials(): Promise<ClaudeCredentialsStatus> {
    const oauth = await this.readOAuthState();
    const settingsEnv = await this.loadSettingsEnv();
    return resolveClaudeAuthStatus(
      oauth,
      process.env.ANTHROPIC_API_KEY,
      readOptionalString(settingsEnv.ANTHROPIC_API_KEY),
      readOptionalString(settingsEnv.ANTHROPIC_AUTH_TOKEN),
    );
  }
}
