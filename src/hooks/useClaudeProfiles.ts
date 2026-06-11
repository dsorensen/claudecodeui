import { useEffect, useState } from 'react';

import { authenticatedFetch } from '../utils/api';
import type { ClaudeProfileSummary } from '../types/app';

import {
  DEFAULT_PROFILES,
  interpretProfilesResponse,
  type ProfilesApiResponse,
} from './useClaudeProfiles.logic';

// Module-level cache: one successful fetch per page load, shared by every hook
// consumer. Failed fetches are never cached, so a later mount can retry.
let cache: ClaudeProfileSummary[] | null = null;
let inflight: Promise<ClaudeProfileSummary[] | null> | null = null;
const subscribers = new Set<(profiles: ClaudeProfileSummary[]) => void>();

async function fetchProfiles(): Promise<ClaudeProfileSummary[] | null> {
  try {
    const response = await authenticatedFetch('/api/providers/claude/profiles');
    const body = response.ok ? ((await response.json()) as ProfilesApiResponse) : null;
    return interpretProfilesResponse(response.ok, body);
  } catch {
    return null;
  }
}

function ensureLoaded(): void {
  if (cache || inflight) {
    return;
  }
  inflight = fetchProfiles().then((result) => {
    inflight = null;
    // Only an authoritative result is cached and broadcast. On failure we leave
    // the cache empty so the next consumer to mount retries, and surface the
    // single default in the meantime without persisting it.
    if (result) {
      cache = result;
      subscribers.forEach((notify) => notify(result));
    } else {
      subscribers.forEach((notify) => notify(DEFAULT_PROFILES));
    }
    return result;
  });
}

export type UseClaudeProfilesResult = {
  profiles: ClaudeProfileSummary[];
  byId: Record<string, ClaudeProfileSummary>;
  isMultiProfile: boolean;
  isLoading: boolean;
};

export function useClaudeProfiles(): UseClaudeProfilesResult {
  const [profiles, setProfiles] = useState<ClaudeProfileSummary[] | null>(cache);

  useEffect(() => {
    if (cache) {
      setProfiles(cache);
      return;
    }
    const notify = (next: ClaudeProfileSummary[]) => setProfiles(next);
    subscribers.add(notify);
    ensureLoaded();
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  const resolved = profiles ?? DEFAULT_PROFILES;
  const byId = Object.fromEntries(resolved.map((p) => [p.id, p])) as Record<string, ClaudeProfileSummary>;

  return {
    profiles: resolved,
    byId,
    isMultiProfile: resolved.length > 1,
    isLoading: profiles === null,
  };
}
