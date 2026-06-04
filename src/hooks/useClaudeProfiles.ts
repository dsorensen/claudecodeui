import { useEffect, useState } from 'react';

import { authenticatedFetch } from '../utils/api';
import type { ClaudeProfileSummary } from '../types/app';

const DEFAULT_PROFILES: ClaudeProfileSummary[] = [{ id: 'claude', label: 'Claude', isDefault: true }];

type ProfilesApiResponse = {
  success?: boolean;
  data?: { provider?: string; profiles?: ClaudeProfileSummary[] };
};

// Module-level cache: one fetch per page load, shared by every hook consumer.
let cache: ClaudeProfileSummary[] | null = null;
let inflight: Promise<ClaudeProfileSummary[]> | null = null;
const subscribers = new Set<(profiles: ClaudeProfileSummary[]) => void>();

async function fetchProfiles(): Promise<ClaudeProfileSummary[]> {
  try {
    const response = await authenticatedFetch('/api/providers/claude/profiles');
    if (!response.ok) {
      return DEFAULT_PROFILES;
    }
    const body = (await response.json()) as ProfilesApiResponse;
    const profiles = body?.data?.profiles;
    return Array.isArray(profiles) && profiles.length > 0 ? profiles : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

function ensureLoaded(): void {
  if (cache || inflight) {
    return;
  }
  inflight = fetchProfiles().then((profiles) => {
    cache = profiles;
    inflight = null;
    subscribers.forEach((notify) => notify(profiles));
    return profiles;
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
