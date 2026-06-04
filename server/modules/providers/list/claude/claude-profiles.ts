import { getClaudeConfigDir } from '@/shared/claude-config-dir.js';
import type { ClaudeProfile } from '@/shared/types.js';

const DEFAULT_PROFILE = (): ClaudeProfile => ({
  id: 'claude',
  label: 'Claude',
  configDir: getClaudeConfigDir(),
});

const parseEntry = (value: unknown): ClaudeProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const { id, label, configDir } = record;
  if (typeof id !== 'string' || typeof configDir !== 'string') return null;
  return {
    id,
    label: typeof label === 'string' && label.trim() ? label : id,
    configDir,
  };
};

/**
 * Reads the configured Claude profiles from CLAUDE_PROFILES (JSON array). The
 * bare "claude" default profile is always present: if the env is unset, empty,
 * malformed, or omits an id "claude" entry, a default profile derived from
 * getClaudeConfigDir() is prepended. Order is preserved otherwise.
 */
export function loadClaudeProfiles(): ClaudeProfile[] {
  const raw = process.env.CLAUDE_PROFILES?.trim();
  let parsed: ClaudeProfile[] = [];

  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (Array.isArray(value)) {
        parsed = value.map(parseEntry).filter((p): p is ClaudeProfile => p !== null);
      }
    } catch {
      parsed = [];
    }
  }

  if (!parsed.some((p) => p.id === 'claude')) {
    parsed = [DEFAULT_PROFILE(), ...parsed];
  }

  return parsed;
}

/**
 * Returns the configDir for a configured Claude profile instance id, or
 * undefined if no profile with that id is configured.
 */
export function getClaudeProfileConfigDir(id: string): string | undefined {
  return loadClaudeProfiles().find((profile) => profile.id === id)?.configDir;
}

/** Frontend-safe view of a profile: never includes the filesystem `configDir`. */
export type ClaudeProfileSummary = {
  id: string;
  label: string;
  isDefault: boolean;
};

/**
 * Maps the configured profiles to the frontend-facing summary shape. The default
 * profile is the one with id "claude" (always present per loadClaudeProfiles).
 */
export function listClaudeProfileSummaries(): ClaudeProfileSummary[] {
  return loadClaudeProfiles().map((profile) => ({
    id: profile.id,
    label: profile.label,
    isDefault: profile.id === 'claude',
  }));
}
