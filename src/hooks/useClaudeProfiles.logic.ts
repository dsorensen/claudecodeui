import type { ClaudeProfileSummary } from '../types/app';

export const DEFAULT_PROFILES: ClaudeProfileSummary[] = [
  { id: 'claude', label: 'Claude', isDefault: true },
];

export type ProfilesApiResponse = {
  success?: boolean;
  data?: { provider?: string; profiles?: ClaudeProfileSummary[] };
};

/**
 * Maps a profiles API result to the list to cache, or null when the result is
 * NOT authoritative and must be retried. A non-OK response (e.g. a transient 401
 * before the auth token lands) returns null so it never poisons the cache with
 * the single-default fallback for the rest of the page load. An OK response is
 * authoritative: its profiles, or the single default when empty/malformed.
 */
export function interpretProfilesResponse(
  ok: boolean,
  body: ProfilesApiResponse | null,
): ClaudeProfileSummary[] | null {
  if (!ok) {
    return null;
  }
  const profiles = body?.data?.profiles;
  return Array.isArray(profiles) && profiles.length > 0 ? profiles : DEFAULT_PROFILES;
}
