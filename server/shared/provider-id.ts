import type { LLMProvider } from '@/shared/types.js';

const BASE_PROVIDERS: readonly LLMProvider[] = ['claude', 'codex', 'gemini', 'cursor', 'opencode'];

/**
 * Parses a provider instance id (e.g. "claude:13layers") into its base provider
 * ("claude"). A bare base id ("claude") returns itself. Throws on an unknown base.
 */
export function baseProviderOf(id: string): LLMProvider {
  const base = id.split(':', 1)[0];
  if ((BASE_PROVIDERS as readonly string[]).includes(base)) {
    return base as LLMProvider;
  }
  throw new Error(`Unknown provider base in id "${id}".`);
}

/** True when the instance id belongs to the Claude provider family. */
export function isClaudeFamily(id: string): boolean {
  return id === 'claude' || id.startsWith('claude:');
}
