import { ClaudeProvider } from '@/modules/providers/list/claude/claude.provider.js';
import { loadClaudeProfiles } from '@/modules/providers/list/claude/claude-profiles.js';
import { CodexProvider } from '@/modules/providers/list/codex/codex.provider.js';
import { CursorProvider } from '@/modules/providers/list/cursor/cursor.provider.js';
import { GeminiProvider } from '@/modules/providers/list/gemini/gemini.provider.js';
import { OpenCodeProvider } from '@/modules/providers/list/opencode/opencode.provider.js';
import type { IProvider } from '@/shared/interfaces.js';
import { AppError } from '@/shared/utils.js';

export type ProviderRegistry = {
  listProviders(): IProvider[];
  resolveProvider(provider: string): IProvider;
};

export function buildProviderRegistry(): ProviderRegistry {
  const providers: Record<string, IProvider> = {
    codex: new CodexProvider(),
    cursor: new CursorProvider(),
    gemini: new GeminiProvider(),
    opencode: new OpenCodeProvider(),
  };

  // When CLAUDE_PROFILES is not configured, loadClaudeProfiles() returns a single
  // default { id: 'claude', configDir: getClaudeConfigDir() }. In that case we
  // construct ClaudeProvider WITHOUT an explicit configDir so its sub-providers
  // keep resolving the dir lazily at read time (preserves env-dependent behavior
  // and per-test env patching). Only when profiles are explicitly configured do
  // we pass each profile's configDir.
  const hasExplicitProfiles = Boolean(process.env.CLAUDE_PROFILES?.trim());
  for (const profile of loadClaudeProfiles()) {
    providers[profile.id] = hasExplicitProfiles
      ? new ClaudeProvider(profile.id, profile.configDir)
      : new ClaudeProvider(profile.id);
  }

  return {
    listProviders(): IProvider[] {
      return Object.values(providers);
    },
    resolveProvider(provider: string): IProvider {
      const resolved = providers[provider];
      if (!resolved) {
        throw new AppError(`Unsupported provider "${provider}".`, {
          code: 'UNSUPPORTED_PROVIDER',
          statusCode: 400,
        });
      }
      return resolved;
    },
  };
}

export const providerRegistry: ProviderRegistry = buildProviderRegistry();
