import type { LLMProvider, ProviderInstanceId } from '../types/app';

const BASE_PROVIDERS: readonly LLMProvider[] = ['claude', 'cursor', 'codex', 'gemini', 'opencode'];

/**
 * Base provider for an instance id ("claude:work" -> "claude"). Unlike the
 * server helper this is lenient: an unrecognized base falls back to "claude"
 * so UI rendering (logos, model lookups) never throws.
 */
export function baseProviderOf(id: ProviderInstanceId | string): LLMProvider {
  const base = id.split(':', 1)[0];
  return (BASE_PROVIDERS as readonly string[]).includes(base) ? (base as LLMProvider) : 'claude';
}

/** True when the instance id belongs to the Claude family ("claude" or "claude:*"). */
export function isClaudeFamily(id: ProviderInstanceId | string): boolean {
  return id === 'claude' || id.startsWith('claude:');
}

/**
 * localStorage key for a Claude profile's selected model. The default profile
 * keeps the legacy "claude-model" key for back-compat; others are namespaced.
 * Shared by useChatProviderState and the picker so the two never diverge.
 */
export function claudeModelStorageKey(instanceId: string): string {
  return instanceId === 'claude' ? 'claude-model' : `claude-model:${instanceId}`;
}
