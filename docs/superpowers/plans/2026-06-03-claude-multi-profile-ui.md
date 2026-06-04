# Claude Multi-Profile — Plan 3: UI (Core Usability) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multiple Claude profiles selectable and visible end-to-end — a profiles API, a per-profile picker, profile-aware model persistence, the Issue 1 sidebar-visibility fix (merge + badge), and resume-under-the-correct-profile.

**Architecture:** A single string — the provider **instance id** (`'claude'`, `'claude:work'`) — flows from a new profiles endpoint → the picker → the chat websocket → (Plan 2 backend, already done) → the session's stored `provider` → back into the sidebar. The frontend keeps `LLMProvider` (5 base names) as the key for icon/model/auth maps and adds an additive `ProviderInstanceId` used only at the boundaries that carry an id; a frontend `baseProviderOf(id)` resolves type-level concerns by base, mirroring `server/shared/provider-id.ts`.

**Tech Stack:** React 18 + TypeScript, Vite 7, Express (server, TS via tsx), better-sqlite3. Backend + frontend share node:test (run through tsx). Verify with `npm run typecheck`, `npm run lint`, and `npx tsx --test`.

**Design spec:** `docs/superpowers/specs/2026-06-03-claude-multi-profile-ui-design.md` (read it for the decisions behind this plan).

---

## Context & ground rules

- **Branch:** create `feat/claude-multi-profile-ui` from current `main` before Task 1. Never implement on `main`. Confirm with `git branch --show-current`.
- **Plan 2 is merged.** The backend already: reads a top-level `provider` field off the `claude-command` websocket message (`server/modules/websocket/services/chat-websocket.service.ts:127-133`, via `readProvider` which **preserves** `claude:work`), resolves it to a configDir (`server/claude-sdk.js:517` `const providerId = options.provider || 'claude'` → `getClaudeProfileConfigDir(providerId)` → `sdkOptions.env.CLAUDE_CONFIG_DIR`), and stores sessions keyed by the instance id. The DB `provider` column already holds `claude:work`.
- **The default single-profile experience must stay byte-for-byte unchanged:** no badge, `claude-model` localStorage key, `selected-provider = 'claude'`, picker heading "Anthropic".
- **Test runner:** `npx tsx --test --tsconfig server/tsconfig.json '<globs>'` for **backend** (node:test); `npx tsx --test '<file>'` for **frontend** pure-function tests. **vitest fails** on the `@/` alias. There is **no `npm test` script**. Typecheck: `npm run typecheck` (runs `tsc -p tsconfig.json` then `tsc -p server/tsconfig.json`). Lint: `npm run lint` (`eslint src/ server/`).
- **Sandbox note (this machine):** `tsx`-based test commands fail under the Bash sandbox with `EPERM … .pipe`; run them with the sandbox disabled. `tsc`/`eslint` are usually fine sandboxed; disable if they EPERM.
- **Commits:** Conventional Commits (commitlint) + husky/lint-staged run eslint on staged files. Unused imports/casts FAIL the commit — clean them. End every commit message with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Backend test imports use `@/…js` aliases** (e.g. `import { projectsDb } from '@/modules/database/index.js';`) and patch `process.env` directly (see `server/modules/providers/tests/mcp.test.ts`).

## File Structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `server/modules/providers/list/claude/claude-profiles.ts` | Modify | Add `ClaudeProfileSummary` type + `listClaudeProfileSummaries()` (maps profiles to `{id,label,isDefault}`, no `configDir`). |
| `server/modules/providers/list/claude/tests/claude-profiles.test.ts` | Modify | Append node:test cases for `listClaudeProfileSummaries` (this file already exists and tests `loadClaudeProfiles`). |
| `server/modules/providers/provider.routes.ts` | Modify | Add `GET /:provider/profiles` route. |
| `server/modules/projects/services/projects-with-sessions-fetch.service.ts` | Modify | Issue 1 fix: bucket by `baseProviderOf`, add `providerInstanceId` to `SessionSummary`, export `bucketSessionRowsByProvider`. |
| `server/modules/projects/tests/projects-with-sessions-fetch.service.test.ts` | Create | node:test (TDD) for `bucketSessionRowsByProvider`. |
| `src/types/app.ts` | Modify | Add `ProviderInstanceId`, `ClaudeProfileSummary`; widen `ProjectSession.__provider`; add `ProjectSession.providerInstanceId`. |
| `src/lib/provider-id.ts` | Create | Frontend `baseProviderOf` / `isClaudeFamily` (lenient mirror of the server helper) + the shared `claudeModelStorageKey`. |
| `src/lib/provider-id.test.ts` | Create | node:test for the helper. |
| `src/components/llm-logo-provider/SessionProviderLogo.tsx` | Modify | Resolve logo by `baseProviderOf(provider)`. |
| `src/hooks/useClaudeProfiles.ts` | Create | Module-cached hook returning `{ profiles, byId, isMultiProfile, isLoading }`. |
| `src/components/sidebar/types/types.ts` | Modify | Widen `SessionWithProvider.__provider` to `ProviderInstanceId`. |
| `src/components/chat/types/types.ts` | Modify | Widen `Provider` alias to `ProviderInstanceId`. |
| `src/components/chat/hooks/useChatProviderState.ts` | Modify | Profile-aware Claude model key; widen provider state; reload model on profile change; orphan-id validation. |
| `src/components/chat/hooks/useChatComposerState.ts` | Modify | Widen the `provider` arg type to `ProviderInstanceId`; forward top-level `provider` on the `claude-command` message. |
| `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx` | Modify | One command-group per profile (multi-profile only); instance-id selection. |
| `src/components/chat/view/subcomponents/ChatMessagesPane.tsx` | Modify | Widen `provider`/`setProvider` prop types. |
| `src/components/chat/view/ChatInterface.tsx` | Modify | Widen the `setProvider` cast. |
| `src/hooks/useProjectsState.ts` | Modify | Claude session selection carries `providerInstanceId` into `__provider`. |
| `src/components/sidebar/utils/utils.ts` | Modify | `getAllSessions` tags Claude rows with their instance id; add badge predicates. |
| `src/components/sidebar/utils/flatSessions.test.ts` | Modify | Add tests for the badge predicates. |
| `src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx` | Modify | Render profile badge (desktop + mobile). |
| `src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx` | Modify | Render profile badge (desktop + mobile). |

---

## Task 1: Backend — Claude profiles endpoint

**Files:**
- Modify: `server/modules/providers/list/claude/claude-profiles.ts`
- Create: `server/modules/providers/tests/claude-profiles.test.ts`
- Modify: `server/modules/providers/provider.routes.ts`

- [ ] **Step 1: Write the failing test**

A test file already exists at `server/modules/providers/list/claude/tests/claude-profiles.test.ts` (it covers `loadClaudeProfiles`/`getClaudeProfileConfigDir`). **Append** these two tests to it, and add `listClaudeProfileSummaries` to its existing import from `@/modules/providers/list/claude/claude-profiles.js`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { listClaudeProfileSummaries } from '@/modules/providers/list/claude/claude-profiles.js';

test('listClaudeProfileSummaries returns the default claude profile, marked default, with no configDir', () => {
  const original = process.env.CLAUDE_PROFILES;
  delete process.env.CLAUDE_PROFILES;
  try {
    const summaries = listClaudeProfileSummaries();
    const def = summaries.find((p) => p.id === 'claude');
    assert.ok(def, 'default claude profile present');
    assert.equal(def?.isDefault, true);
    for (const s of summaries) {
      assert.deepEqual(Object.keys(s).sort(), ['id', 'isDefault', 'label']);
    }
  } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
});

test('listClaudeProfileSummaries maps configured profiles; only id "claude" is default', () => {
  const original = process.env.CLAUDE_PROFILES;
  process.env.CLAUDE_PROFILES = JSON.stringify([
    { id: 'claude', label: 'Personal', configDir: '/tmp/a' },
    { id: 'claude:work', label: 'Work', configDir: '/tmp/b' },
  ]);
  try {
    const summaries = listClaudeProfileSummaries();
    const work = summaries.find((p) => p.id === 'claude:work');
    assert.ok(work);
    assert.equal(work?.isDefault, false);
    assert.equal(work?.label, 'Work');
    assert.equal(summaries.find((p) => p.id === 'claude')?.isDefault, true);
    assert.equal('configDir' in (work as Record<string, unknown>), false);
  } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (sandbox disabled): `npx tsx --test --tsconfig server/tsconfig.json 'server/modules/providers/list/claude/tests/claude-profiles.test.ts'`
Expected: FAIL — `listClaudeProfileSummaries` is not exported.

- [ ] **Step 3: Implement `listClaudeProfileSummaries`**

In `server/modules/providers/list/claude/claude-profiles.ts`, append at the end of the file (after `getClaudeProfileConfigDir`):

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run (sandbox disabled): `npx tsx --test --tsconfig server/tsconfig.json 'server/modules/providers/list/claude/tests/claude-profiles.test.ts'`
Expected: PASS — the two new tests pass alongside the file's existing tests, `# fail 0`.

- [ ] **Step 5: Add the route**

In `server/modules/providers/provider.routes.ts`:

1. The file already imports `baseProviderOf` from `@/shared/provider-id.js`; add `isClaudeFamily` to that same statement so it reads `import { baseProviderOf, isClaudeFamily } from '@/shared/provider-id.js';`.
2. Add an import for the new function near the other provider imports:
   ```ts
   import { listClaudeProfileSummaries } from '@/modules/providers/list/claude/claude-profiles.js';
   ```
3. Insert the new route **between two complete routes**: immediately after the `/:provider/models` GET route's closing `);` (around line 290) and immediately before the `router.post('/:provider/sessions/:sessionId/active-model', ...)` route (around line 292). Do not place it inside another route handler. Insert:

```ts
router.get(
  '/:provider/profiles',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    if (!isClaudeFamily(provider)) {
      throw new AppError(`Provider "${provider}" does not support profiles.`, {
        code: 'UNSUPPORTED_PROVIDER_OPERATION',
        statusCode: 400,
      });
    }
    res.json(createApiSuccessResponse({ provider, profiles: listClaudeProfileSummaries() }));
  }),
);
```

(`parseProvider`, `createApiSuccessResponse`, `AppError`, and `asyncHandler` are already imported/used in this file. The router is already auth-guarded by `authenticateToken` at `server/index.js:199`.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/modules/providers/list/claude/claude-profiles.ts \
        server/modules/providers/list/claude/tests/claude-profiles.test.ts \
        server/modules/providers/provider.routes.ts
git commit -m "feat(providers): expose GET /:provider/profiles for claude profiles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend — Issue 1 fix (profile sessions visible, carry instance id)

**Files:**
- Modify: `server/modules/projects/services/projects-with-sessions-fetch.service.ts`
- Create: `server/modules/projects/tests/projects-with-sessions-fetch.service.test.ts`

This is the deferred Issue 1: `bucketSessionRowsByProvider` drops `claude:work` rows because it keys the bucket by the raw `row.provider`. Fix: key by `baseProviderOf(row.provider)` (with a guard so genuinely-unknown bases still drop), and carry the instance id forward on the summary.

- [ ] **Step 1: Write the failing test**

Create `server/modules/projects/tests/projects-with-sessions-fetch.service.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { bucketSessionRowsByProvider } from '@/modules/projects/services/projects-with-sessions-fetch.service.js';

test('bucketSessionRowsByProvider keeps claude:* rows in the claude bucket with their instance id', () => {
  const rows = [
    { provider: 'claude', session_id: 's1', updated_at: '2026-01-01T00:00:00Z' },
    { provider: 'claude:work', session_id: 's2', updated_at: '2026-01-02T00:00:00Z' },
    { provider: 'cursor', session_id: 's3', updated_at: '2026-01-03T00:00:00Z' },
    { provider: 'totally-unknown', session_id: 's4', updated_at: '2026-01-04T00:00:00Z' },
  ];

  const result = bucketSessionRowsByProvider(rows);

  assert.equal(result.claude.length, 2, 'claude and claude:work both land in the claude bucket');
  assert.deepEqual(result.claude.map((s) => s.id).sort(), ['s1', 's2']);
  assert.equal(result.claude.find((s) => s.id === 's2')?.providerInstanceId, 'claude:work');
  assert.equal(result.claude.find((s) => s.id === 's1')?.providerInstanceId, 'claude');
  assert.equal(result.cursor.length, 1);
  assert.equal(result.cursor[0]?.providerInstanceId, 'cursor');

  const total =
    result.claude.length + result.cursor.length + result.codex.length + result.gemini.length + result.opencode.length;
  assert.equal(total, 3, 'the unknown-base row is dropped');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (sandbox disabled): `npx tsx --test --tsconfig server/tsconfig.json 'server/modules/projects/tests/projects-with-sessions-fetch.service.test.ts'`
Expected: FAIL — `bucketSessionRowsByProvider` is not exported (and `providerInstanceId` does not exist).

- [ ] **Step 3: Import `baseProviderOf`**

In `server/modules/projects/services/projects-with-sessions-fetch.service.ts`, after the existing import block (the last import is `import { AppError } from '@/shared/utils.js';` on line 8), add:

```ts
import { baseProviderOf } from '@/shared/provider-id.js';
```

- [ ] **Step 4: Add `providerInstanceId` to `SessionSummary`**

Change the `SessionSummary` type (lines 10-15) from:

```ts
type SessionSummary = {
  id: string;
  summary: string;
  messageCount: number;
  lastActivity: string;
};
```

to:

```ts
type SessionSummary = {
  id: string;
  summary: string;
  messageCount: number;
  lastActivity: string;
  providerInstanceId: string;
};
```

- [ ] **Step 5: Populate `providerInstanceId` in `mapSessionRowToSummary`**

Change the function (lines 129-136) from:

```ts
function mapSessionRowToSummary(row: SessionRepositoryRow): SessionSummary {
  return {
    id: row.session_id,
    summary: row.custom_name || '',
    messageCount: 0,
    lastActivity: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}
```

to:

```ts
function mapSessionRowToSummary(row: SessionRepositoryRow): SessionSummary {
  return {
    id: row.session_id,
    summary: row.custom_name || '',
    messageCount: 0,
    lastActivity: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    providerInstanceId: row.provider,
  };
}
```

- [ ] **Step 6: Export + refactor `bucketSessionRowsByProvider`**

Change the function (lines 138-158) from:

```ts
function bucketSessionRowsByProvider(rows: SessionRepositoryRow[]): SessionsByProvider {
  const byProvider: SessionsByProvider = {
    claude: [],
    cursor: [],
    codex: [],
    gemini: [],
    opencode: [],
  };

  for (const row of rows) {
    const provider = row.provider as keyof SessionsByProvider;
    const bucket = byProvider[provider];
    if (!bucket) {
      continue;
    }

    bucket.push(mapSessionRowToSummary(row));
  }

  return byProvider;
}
```

to:

```ts
export function bucketSessionRowsByProvider(rows: SessionRepositoryRow[]): SessionsByProvider {
  const byProvider: SessionsByProvider = {
    claude: [],
    cursor: [],
    codex: [],
    gemini: [],
    opencode: [],
  };

  for (const row of rows) {
    let base: string;
    try {
      // Collapse an instance id ("claude:work") to its base provider ("claude").
      base = baseProviderOf(row.provider);
    } catch {
      // Unknown provider base — drop the row (preserves prior behavior for junk rows).
      continue;
    }

    const bucket = byProvider[base as keyof SessionsByProvider];
    if (!bucket) {
      continue;
    }

    bucket.push(mapSessionRowToSummary(row));
  }

  return byProvider;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run (sandbox disabled): `npx tsx --test --tsconfig server/tsconfig.json 'server/modules/projects/tests/projects-with-sessions-fetch.service.test.ts'`
Expected: PASS — `# pass 1`, `# fail 0`.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: PASS. (Adding a required field to `SessionSummary` is safe — the only construction site is `mapSessionRowToSummary`, updated in Step 5.)

- [ ] **Step 9: Commit**

```bash
git add server/modules/projects/services/projects-with-sessions-fetch.service.ts \
        server/modules/projects/tests/projects-with-sessions-fetch.service.test.ts
git commit -m "fix(projects): keep claude profile sessions visible in the project list

bucketSessionRowsByProvider now buckets by baseProviderOf(row.provider) so a
claude:work row lands in the claude bucket instead of being dropped, and each
summary carries providerInstanceId for the frontend badge + resume routing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend — additive types + provider-id helper + logo resolution

**Files:**
- Modify: `src/types/app.ts`
- Create: `src/lib/provider-id.ts`
- Create: `src/lib/provider-id.test.ts`
- Modify: `src/components/sidebar/types/types.ts`
- Modify: `src/components/llm-logo-provider/SessionProviderLogo.tsx`

- [ ] **Step 1: Write the failing test for the helper**

Create `src/lib/provider-id.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { baseProviderOf, claudeModelStorageKey, isClaudeFamily } from './provider-id';

test('baseProviderOf returns the base provider for instance ids', () => {
  assert.equal(baseProviderOf('claude'), 'claude');
  assert.equal(baseProviderOf('claude:work'), 'claude');
  assert.equal(baseProviderOf('cursor'), 'cursor');
  assert.equal(baseProviderOf('gemini'), 'gemini');
  assert.equal(baseProviderOf('opencode'), 'opencode');
});

test('baseProviderOf falls back to claude for unknown bases', () => {
  assert.equal(baseProviderOf('mystery:thing'), 'claude');
});

test('isClaudeFamily is true only for claude and claude:*', () => {
  assert.equal(isClaudeFamily('claude'), true);
  assert.equal(isClaudeFamily('claude:work'), true);
  assert.equal(isClaudeFamily('cursor'), false);
  assert.equal(isClaudeFamily('codex'), false);
});

test('claudeModelStorageKey: default keeps the legacy key; others are namespaced', () => {
  assert.equal(claudeModelStorageKey('claude'), 'claude-model');
  assert.equal(claudeModelStorageKey('claude:work'), 'claude-model:claude:work');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (sandbox disabled): `npx tsx --test 'src/lib/provider-id.test.ts'`
Expected: FAIL — `./provider-id` does not exist.

- [ ] **Step 3: Add the new types to `src/types/app.ts`**

Change line 1 from:

```ts
export type LLMProvider = 'claude' | 'cursor' | 'codex' | 'gemini' | 'opencode';
```

to:

```ts
export type LLMProvider = 'claude' | 'cursor' | 'codex' | 'gemini' | 'opencode';

/**
 * A provider *instance* id. Base providers are bare names; Claude can have
 * additional profiles addressed as `claude:<name>`. Resolve type-level concerns
 * (icon, model catalog) via baseProviderOf() in src/lib/provider-id.ts.
 */
export type ProviderInstanceId = LLMProvider | `claude:${string}`;

/** Frontend-facing Claude profile summary (mirror of the /profiles endpoint). */
export type ClaudeProfileSummary = {
  id: string;
  label: string;
  isDefault: boolean;
};
```

- [ ] **Step 4: Widen `ProjectSession` in `src/types/app.ts`**

In the `ProjectSession` interface, change:

```ts
  __provider?: LLMProvider;
```

to:

```ts
  __provider?: ProviderInstanceId;
  // Full provider instance id from the backend session row (e.g. "claude:work").
  // Present on summaries returned by the project/session list APIs.
  providerInstanceId?: string;
```

- [ ] **Step 5: Create the helper**

Create `src/lib/provider-id.ts`:

```ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run (sandbox disabled): `npx tsx --test 'src/lib/provider-id.test.ts'`
Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 7: Widen `SessionWithProvider`**

In `src/components/sidebar/types/types.ts`, change the import on line 1 to add `ProviderInstanceId`:

```ts
import type { LoadingProgress, Project, ProjectSession, LLMProvider, ProviderInstanceId } from '../../../types/app';
```

and change `SessionWithProvider` (lines 7-9) from:

```ts
export type SessionWithProvider = ProjectSession & {
  __provider: LLMProvider;
};
```

to:

```ts
export type SessionWithProvider = ProjectSession & {
  __provider: ProviderInstanceId;
};
```

(Leave the other `LLMProvider` usages in this file unchanged — `ArchivedSessionListItem.provider`, `SessionDeleteConfirmation.provider`, etc. remain base-typed for now.)

- [ ] **Step 8: Resolve the logo by base provider**

In `src/components/llm-logo-provider/SessionProviderLogo.tsx`, change the import block (line 1) to add the helper:

```ts
import type { LLMProvider } from '../../types/app';
import { baseProviderOf } from '../../lib/provider-id';
```

and change the component body so it switches on the resolved base. Replace:

```tsx
export default function SessionProviderLogo({
  provider = 'claude',
  className = 'w-5 h-5',
}: SessionProviderLogoProps) {
  if (provider === 'cursor') {
    return <CursorLogo className={className} />;
  }

  if (provider === 'codex') {
    return <CodexLogo className={className} />;
  }

  if (provider === 'gemini') {
    return <GeminiLogo className={className} />;
  }

  if (provider === 'opencode') {
    return <OpenCodeLogo className={className} />;
  }

  return <ClaudeLogo className={className} />;
}
```

with:

```tsx
export default function SessionProviderLogo({
  provider = 'claude',
  className = 'w-5 h-5',
}: SessionProviderLogoProps) {
  const base = baseProviderOf(provider ?? 'claude');

  if (base === 'cursor') {
    return <CursorLogo className={className} />;
  }

  if (base === 'codex') {
    return <CodexLogo className={className} />;
  }

  if (base === 'gemini') {
    return <GeminiLogo className={className} />;
  }

  if (base === 'opencode') {
    return <OpenCodeLogo className={className} />;
  }

  return <ClaudeLogo className={className} />;
}
```

(The `LLMProvider` import and `SessionProviderLogoProps` are unchanged — `provider?: LLMProvider | string | null` already accepts instance-id strings; only the resolution logic inside the function changes.)

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types/app.ts src/lib/provider-id.ts src/lib/provider-id.test.ts \
        src/components/sidebar/types/types.ts \
        src/components/llm-logo-provider/SessionProviderLogo.tsx
git commit -m "feat(providers): add frontend ProviderInstanceId type + baseProviderOf helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — `useClaudeProfiles` hook (module-cached)

**Files:**
- Create: `src/hooks/useClaudeProfiles.ts`

A single shared fetch backs every consumer (picker, provider-state validation, both sidebar session items), so no prop-drilling is needed. Profiles are env-driven on the server and don't change at runtime, so one cache for the page lifetime is correct.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useClaudeProfiles.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Not yet consumed anywhere — this confirms types/imports resolve.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useClaudeProfiles.ts
git commit -m "feat(providers): add module-cached useClaudeProfiles hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — select & forward the profile instance id (picker + persistence + send-site)

**Files:**
- Modify: `src/components/chat/types/types.ts`
- Modify: `src/components/chat/hooks/useChatProviderState.ts`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/ChatInterface.tsx`

This task is type-coupled (the picker, the provider state, and the prop chain must change together to keep the build green), so it lands as one task with a single typecheck/lint at the end. Apply the steps in order.

- [ ] **Step 1: Widen the `Provider` alias**

In `src/components/chat/types/types.ts`, change line 3 from:

```ts
export type Provider = LLMProvider;
```

to:

```ts
export type Provider = ProviderInstanceId;
```

and add `ProviderInstanceId` to the existing `import type { ... } from '../../../types/app'` line (line 1). **Keep `LLMProvider`** — it is still referenced by other types in this file (e.g. `ChangeActiveModelApiResponse.provider`); do not remove it.

- [ ] **Step 2: `useChatProviderState.ts` — imports**

Add this import alongside the existing imports at the top of `src/components/chat/hooks/useChatProviderState.ts`:

```ts
import { claudeModelStorageKey, isClaudeFamily } from '../../../lib/provider-id';
```

Also add `ProviderInstanceId` to the existing `import type { ... } from '../../../types/app'` line (keep `LLMProvider` — `FALLBACK_DEFAULT_MODEL` and `providerModelCatalog` still use it).

`claudeModelStorageKey` is the shared helper created in Task 3 Step 5 — do **not** redefine it here. This file does **not** import `useClaudeProfiles` (see Step 6).

- [ ] **Step 3: `useChatProviderState.ts` — widen provider state + profile-aware Claude model init**

Change the provider + claude model initial state (lines 60-68) from:

```ts
  const [provider, setProvider] = useState<LLMProvider>(() => {
    return (localStorage.getItem('selected-provider') as LLMProvider) || 'claude';
  });
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return localStorage.getItem('cursor-model') || FALLBACK_DEFAULT_MODEL.cursor;
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return localStorage.getItem('claude-model') || FALLBACK_DEFAULT_MODEL.claude;
  });
```

to:

```ts
  const [provider, setProvider] = useState<ProviderInstanceId>(() => {
    return (localStorage.getItem('selected-provider') as ProviderInstanceId) || 'claude';
  });
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return localStorage.getItem('cursor-model') || FALLBACK_DEFAULT_MODEL.cursor;
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    const initialProvider = localStorage.getItem('selected-provider') || 'claude';
    const key = isClaudeFamily(initialProvider) ? claudeModelStorageKey(initialProvider) : 'claude-model';
    return localStorage.getItem(key) || FALLBACK_DEFAULT_MODEL.claude;
  });
```

(`ProviderInstanceId` was added to this file's imports in Step 2.)

- [ ] **Step 4: `useChatProviderState.ts` — profile-aware `setStoredProviderModel`**

Change `setStoredProviderModel` (lines 91-118) from:

```ts
  const setStoredProviderModel = useCallback((targetProvider: LLMProvider, model: string) => {
    if (targetProvider === 'claude') {
      setClaudeModel(model);
      localStorage.setItem('claude-model', model);
      return;
    }

    if (targetProvider === 'cursor') {
```

to (only the Claude branch changes; the rest of the function body is unchanged):

```ts
  const setStoredProviderModel = useCallback((targetProvider: ProviderInstanceId, model: string) => {
    if (isClaudeFamily(targetProvider)) {
      setClaudeModel(model);
      localStorage.setItem(claudeModelStorageKey(targetProvider), model);
      return;
    }

    if (targetProvider === 'cursor') {
```

(Leave the `cursor`/`codex`/`gemini`/`opencode` branches exactly as they are.)

- [ ] **Step 5: `useChatProviderState.ts` — reload the Claude model when the active profile changes**

Change the session-sync effect (lines 274-281) from:

```ts
  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    setProvider(selectedSession.__provider);
    localStorage.setItem('selected-provider', selectedSession.__provider);
  }, [provider, selectedSession]);
```

to:

```ts
  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    const next = selectedSession.__provider;
    setProvider(next);
    localStorage.setItem('selected-provider', next);
    if (isClaudeFamily(next)) {
      setClaudeModel(localStorage.getItem(claudeModelStorageKey(next)) || FALLBACK_DEFAULT_MODEL.claude);
    }
  }, [provider, selectedSession]);
```

- [ ] **Step 6: (intentionally omitted — no orphan-id validation effect)**

We deliberately do **not** add a frontend effect to reset a `selected-provider` that points at a removed profile. The backend degrades gracefully: `getClaudeProfileConfigDir(unknownId)` returns `undefined`, so `claude-sdk.js` leaves `CLAUDE_CONFIG_DIR` inherited (the default profile). A reset effect would also risk fighting the Step 5 session-sync effect (both call `setProvider` with overlapping deps → possible loop), so we rely on the graceful fallback instead. Consequently `useChatProviderState` does **not** import or call `useClaudeProfiles`.

- [ ] **Step 7: `useChatComposerState.ts` — forward the instance id on `claude-command`**

In `src/components/chat/hooks/useChatComposerState.ts`, change the `claude-command` send block (the `else { sendMessage({ ... }) }` near lines 727-742) from:

```ts
      } else {
        sendMessage({
          type: 'claude-command',
          command: messageContent,
          options: {
            projectPath: resolvedProjectPath,
            cwd: resolvedProjectPath,
            sessionId: effectiveSessionId,
            resume: Boolean(effectiveSessionId),
            toolsSettings,
            permissionMode,
            model: claudeModel,
            sessionSummary,
            images: uploadedImages,
          },
        });
      }
```

to (add the top-level `provider` field — the backend reads `data.provider`, not `options.provider`):

```ts
      } else {
        sendMessage({
          type: 'claude-command',
          command: messageContent,
          provider,
          options: {
            projectPath: resolvedProjectPath,
            cwd: resolvedProjectPath,
            sessionId: effectiveSessionId,
            resume: Boolean(effectiveSessionId),
            toolsSettings,
            permissionMode,
            model: claudeModel,
            sessionSummary,
            images: uploadedImages,
          },
        });
      }
```

**Also widen the hook's input type:** in `useChatComposerState`'s args/props interface, change the `provider: LLMProvider;` field (around line 37) to `provider: ProviderInstanceId;`, and add `ProviderInstanceId` to that file's `import type { ... } from '...types/app'` (keep `LLMProvider` if still used). This is required because `useChatProviderState` now returns `ProviderInstanceId` (Step 3) and passes it in as `provider`. With the field widened, `provider` is in scope for the send block — no other import needed.

- [ ] **Step 8: `ProviderSelectionEmptyState.tsx` — imports + widen prop/helper types**

In `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx`:

1. Add `ProviderInstanceId` to the existing `import type { ... } from '../../../../types/app'` statement (near the top of the file). Keep `LLMProvider`.
2. Add these as new import statements (separate from the `types/app` import in item 1):
   ```ts
   import { baseProviderOf, claudeModelStorageKey, isClaudeFamily } from '../../../../lib/provider-id';
   import { useClaudeProfiles } from '../../../../hooks/useClaudeProfiles';
   ```
3. In `ProviderSelectionEmptyStateProps`, change:
   ```ts
   provider: LLMProvider;
   setProvider: (next: LLMProvider) => void;
   ```
   to:
   ```ts
   provider: ProviderInstanceId;
   setProvider: (next: ProviderInstanceId) => void;
   ```
4. In the `ProviderGroup` type (lines 61-65), change `id: LLMProvider;` to `id: ProviderInstanceId;`.
5. Change `getCurrentModel` (line 75) and `getProviderDisplayName` (line 90) to accept `ProviderInstanceId` and branch on `isClaudeFamily`:
   ```ts
   function getCurrentModel(p: ProviderInstanceId, c: string, cu: string, co: string, g: string, o: string) {
     if (isClaudeFamily(p)) return c;
     if (p === 'codex') return co;
     if (p === 'gemini') return g;
     if (p === 'opencode') return o;
     return cu;
   }
   ```
   ```ts
   function getProviderDisplayName(p: ProviderInstanceId) {
     if (isClaudeFamily(p)) return 'Claude';
     if (p === 'cursor') return 'Cursor';
     if (p === 'codex') return 'Codex';
     if (p === 'opencode') return 'OpenCode';
     return 'Gemini';
   }
   ```
6. Change `setModelForProvider` (lines 153-173) to accept `ProviderInstanceId` and branch the Claude case on `isClaudeFamily`, namespacing the key:
   ```ts
   const setModelForProvider = useCallback(
     (providerId: ProviderInstanceId, modelValue: string) => {
       if (isClaudeFamily(providerId)) {
         setClaudeModel(modelValue);
         localStorage.setItem(claudeModelStorageKey(providerId), modelValue);
       } else if (providerId === 'codex') {
         setCodexModel(modelValue);
         localStorage.setItem('codex-model', modelValue);
       } else if (providerId === 'gemini') {
         setGeminiModel(modelValue);
         localStorage.setItem('gemini-model', modelValue);
       } else if (providerId === 'opencode') {
         setOpenCodeModel(modelValue);
         localStorage.setItem('opencode-model', modelValue);
       } else {
         setCursorModel(modelValue);
         localStorage.setItem('cursor-model', modelValue);
       }
     },
     [setClaudeModel, setCursorModel, setCodexModel, setGeminiModel, setOpenCodeModel],
   );
   ```
7. Change `handleModelSelect` (lines 175-184) so its `providerId` param is `ProviderInstanceId` (the body is otherwise unchanged):
   ```ts
   const handleModelSelect = useCallback(
     (providerId: ProviderInstanceId, modelValue: string) => {
       setProvider(providerId);
       localStorage.setItem('selected-provider', providerId);
       setModelForProvider(providerId, modelValue);
       setDialogOpen(false);
       setTimeout(() => textareaRef.current?.focus(), 100);
     },
     [setProvider, setModelForProvider, textareaRef],
   );
   ```

- [ ] **Step 9: `ProviderSelectionEmptyState.tsx` — build one group per profile**

Call the profiles hook at the top of the component body (with the other hooks, after `const { t } = useTranslation('chat');`):

```tsx
  const { profiles, isMultiProfile } = useClaudeProfiles();
```

Change `visibleProviderGroups` (lines 124-130) from:

```tsx
  const visibleProviderGroups = useMemo<ProviderGroup[]>(() => {
    return PROVIDER_META.map((p) => ({
      id: p.id,
      name: p.name,
      models: providerModelCatalog[p.id]?.OPTIONS ?? [],
    }));
  }, [providerModelCatalog]);
```

to:

```tsx
  const visibleProviderGroups = useMemo<ProviderGroup[]>(() => {
    const claudeModels = providerModelCatalog.claude?.OPTIONS ?? [];
    // Default (single profile): preserve the original "Anthropic" Claude group.
    // Multi-profile: one Claude group per profile, headed by its label.
    const claudeGroups: ProviderGroup[] = isMultiProfile
      ? profiles
          .filter((p) => isClaudeFamily(p.id))
          .map((p) => ({ id: p.id as ProviderInstanceId, name: p.label, models: claudeModels }))
      : [{ id: 'claude', name: 'Anthropic', models: claudeModels }];

    const otherGroups: ProviderGroup[] = PROVIDER_META.filter((p) => p.id !== 'claude').map((p) => ({
      id: p.id,
      name: p.name,
      models: providerModelCatalog[p.id]?.OPTIONS ?? [],
    }));

    return [...claudeGroups, ...otherGroups];
  }, [providerModelCatalog, profiles, isMultiProfile]);
```

- [ ] **Step 10: `ProviderSelectionEmptyState.tsx` — base-resolve the readyPrompt lookup**

The trailing "ready" prompt indexes a record by `provider` (lines ~300-319: `{ claude: ..., cursor: ... }[provider]`). With an instance id this would miss. Change that index expression from `}[provider]` to `}[baseProviderOf(provider)]` so `claude:work` resolves to the `claude` message. (The `isSelected` check inside the render loop — `provider === group.id && currentModel === model.value` — is already correct: `group.id` is the instance id and only the active profile's group highlights.)

- [ ] **Step 11: Widen the prop chain — `ChatMessagesPane.tsx`**

In `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`, find the `provider` / `setProvider` entries in its props type and change `LLMProvider` to `ProviderInstanceId` (add `ProviderInstanceId` to its `types/app` import; keep `LLMProvider` if still used elsewhere in the file). These are passed straight through to `ProviderSelectionEmptyState` (the existing pass-through block needs no logic change).

- [ ] **Step 12: Widen the cast — `ChatInterface.tsx`**

In `src/components/chat/view/ChatInterface.tsx` line 322, change:

```tsx
          setProvider={(nextProvider) => setProvider(nextProvider as Provider)}
```

Since `Provider` is now `ProviderInstanceId` (Step 1), this cast already accepts instance ids — no change is required if `Provider` is imported here. If `ChatInterface` instead typed this with `LLMProvider`, change that annotation to `ProviderInstanceId`. Verify by typecheck in Step 13; adjust only if the compiler complains.

- [ ] **Step 13: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS. Common failures to watch:
- A leftover `provider === 'claude'` comparison where `provider` is now `ProviderInstanceId` and the Claude case should be `isClaudeFamily(provider)`.
- An unused `LLMProvider` import after widening (remove it).

- [ ] **Step 14: Commit**

```bash
git add src/components/chat/types/types.ts \
        src/components/chat/hooks/useChatProviderState.ts \
        src/components/chat/hooks/useChatComposerState.ts \
        src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx \
        src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
        src/components/chat/view/ChatInterface.tsx
git commit -m "feat(chat): per-profile Claude picker + forward the profile instance id

The provider/model picker lists one group per configured Claude profile (and is
unchanged for the single-profile default). Selection persists the instance id;
Claude model selection is namespaced per profile; the claude-command websocket
message now forwards the top-level provider so the backend spawns the right
profile config dir.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend — resume under the correct profile

**Files:**
- Modify: `src/hooks/useProjectsState.ts`
- Modify: `src/components/sidebar/utils/utils.ts`

The session's instance id (now on `session.providerInstanceId` from Task 2) must become the session's `__provider` so that selecting it forwards the right id. Only the Claude branches change — other providers never have profiles.

- [ ] **Step 1: `useProjectsState.ts` — carry the instance id for Claude sessions**

In `src/hooks/useProjectsState.ts`, in the session-resolution effect, change the **Claude** branch only. From:

```ts
      const claudeSession = project.sessions?.find((session) => session.id === sessionId);
      if (claudeSession) {
        const shouldUpdateProject = selectedProject?.projectId !== project.projectId;
        const shouldUpdateSession =
          selectedSession?.id !== sessionId || selectedSession.__provider !== 'claude';

        if (shouldUpdateProject) {
          setSelectedProject(project);
        }
        if (shouldUpdateSession) {
          setSelectedSession({ ...claudeSession, __provider: 'claude' });
        }
        return;
      }
```

to:

```ts
      const claudeSession = project.sessions?.find((session) => session.id === sessionId);
      if (claudeSession) {
        const claudeProvider = claudeSession.providerInstanceId ?? 'claude';
        const shouldUpdateProject = selectedProject?.projectId !== project.projectId;
        const shouldUpdateSession =
          selectedSession?.id !== sessionId || selectedSession.__provider !== claudeProvider;

        if (shouldUpdateProject) {
          setSelectedProject(project);
        }
        if (shouldUpdateSession) {
          setSelectedSession({ ...claudeSession, __provider: claudeProvider });
        }
        return;
      }
```

(Leave the `cursorSession`, `codexSession`, `geminiSession`, `opencodeSession` branches and the `normalizedProvider` fallback block exactly as they are.)

- [ ] **Step 2: `sidebar/utils/utils.ts` — tag flattened Claude sessions with their instance id**

In `src/components/sidebar/utils/utils.ts`, in `getAllSessions`, change the Claude mapping (the first `.map` producing `claudeSessions`, line ~124-127) from:

```ts
  const claudeSessions = [...(project.sessions || [])].map((session) => ({
    ...session,
    __provider: 'claude' as const,
  }));
```

to:

```ts
  const claudeSessions = [...(project.sessions || [])].map((session) => ({
    ...session,
    __provider: (session.providerInstanceId ?? 'claude') as ProviderInstanceId,
  }));
```

Add `ProviderInstanceId` to the `types/app` import at the top of the file (it already imports `Project`, `SessionWithProvider`, etc. from the app/sidebar types — import `ProviderInstanceId` from `../../../types/app`). Leave the `cursor`/`codex`/`gemini`/`opencode` mappings unchanged.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the existing sidebar test (no regression)**

Run (sandbox disabled): `npx tsx --test 'src/components/sidebar/utils/flatSessions.test.ts'`
Expected: PASS — the test's fixtures have no `providerInstanceId`, so `?? 'claude'` keeps `__provider === 'claude'`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProjectsState.ts src/components/sidebar/utils/utils.ts
git commit -m "feat(chat): resume claude sessions under their stored profile

Selecting a claude:work session now carries its providerInstanceId into
__provider, so the next message/resume forwards the correct profile id.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Frontend — sidebar profile badge

**Files:**
- Modify: `src/components/sidebar/utils/utils.ts` (add pure predicates)
- Modify: `src/components/sidebar/utils/flatSessions.test.ts` (test the predicates)
- Modify: `src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx`

The badge shows the profile label on a session row **iff** the row is a non-default Claude profile **and** more than one profile is configured. Both item components read profiles directly from the module-cached `useClaudeProfiles()` — no prop threading. (Calling the hook per row is safe: the module cache fetches once and settles once, so rows re-render at most once when profiles first load, then read the cache synchronously.)

- [ ] **Step 1: Write the failing predicate tests**

In `src/components/sidebar/utils/flatSessions.test.ts`, add an import and two tests at the end of the file:

```ts
import { profileBadgeLabel, shouldShowProfileBadge } from './utils';
import type { ClaudeProfileSummary } from '../../../types/app';

test('shouldShowProfileBadge: only non-default claude ids when multi-profile', () => {
  assert.equal(shouldShowProfileBadge('claude:work', true), true);
  assert.equal(shouldShowProfileBadge('claude:work', false), false, 'single profile: no badge');
  assert.equal(shouldShowProfileBadge('claude', true), false, 'default profile: no badge');
  assert.equal(shouldShowProfileBadge('cursor', true), false, 'non-claude: no badge');
  assert.equal(shouldShowProfileBadge(undefined, true), false);
});

test('profileBadgeLabel: looks up the label, else empty', () => {
  const byId: Record<string, ClaudeProfileSummary> = {
    'claude:work': { id: 'claude:work', label: 'Work', isDefault: false },
  };
  assert.equal(profileBadgeLabel('claude:work', byId), 'Work');
  assert.equal(profileBadgeLabel('claude:missing', byId), '');
  assert.equal(profileBadgeLabel(undefined, byId), '');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (sandbox disabled): `npx tsx --test 'src/components/sidebar/utils/flatSessions.test.ts'`
Expected: FAIL — `shouldShowProfileBadge` / `profileBadgeLabel` are not exported from `./utils`.

- [ ] **Step 3: Add the predicates to `utils.ts`**

In `src/components/sidebar/utils/utils.ts`, add (near the top imports) `import { isClaudeFamily } from '../../../lib/provider-id';` and `import type { ClaudeProfileSummary, ProviderInstanceId } from '../../../types/app';` (merge `ProviderInstanceId` with the import you added in Task 6; add `ClaudeProfileSummary`). Then append these exported pure functions:

```ts
/** A session row earns a profile badge only when it is a non-default Claude profile and >1 profile exists. */
export const shouldShowProfileBadge = (
  instanceId: ProviderInstanceId | string | undefined,
  isMultiProfile: boolean,
): boolean => Boolean(instanceId) && isMultiProfile && isClaudeFamily(instanceId as string) && instanceId !== 'claude';

/** Human label for a profile instance id, or '' when not found. */
export const profileBadgeLabel = (
  instanceId: ProviderInstanceId | string | undefined,
  byId: Record<string, ClaudeProfileSummary>,
): string => (instanceId ? byId[instanceId]?.label ?? '' : '');
```

- [ ] **Step 4: Run the test to verify it passes**

Run (sandbox disabled): `npx tsx --test 'src/components/sidebar/utils/flatSessions.test.ts'`
Expected: PASS — all tests green (`# fail 0`).

- [ ] **Step 5: Render the badge in `SidebarSessionItem.tsx`**

In `src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx`:

1. Add imports:
   ```ts
   import { useClaudeProfiles } from '../../../../hooks/useClaudeProfiles';
   import { profileBadgeLabel, shouldShowProfileBadge } from '../../utils/utils';
   ```
2. At the top of the component body (with the other hooks), add:
   ```tsx
   const { byId: claudeProfilesById, isMultiProfile } = useClaudeProfiles();
   const showProfileBadge = shouldShowProfileBadge(session.__provider, isMultiProfile);
   ```
3. **Desktop** render — immediately after the closing `</span>` of the `compactSessionAge` block (the age `<span>` that ends at line 178) and still inside the `flex items-center gap-2` row, insert:
   ```tsx
                {showProfileBadge && (
                  <span className="flex-shrink-0 rounded bg-primary/10 px-1 text-[9px] font-medium uppercase tracking-wide text-primary">
                    {profileBadgeLabel(session.__provider, claudeProfilesById)}
                  </span>
                )}
   ```
4. **Mobile** render — insert the identical block immediately after the mobile `compactSessionAge` `<span>` (ends at line 129), inside its `flex items-center gap-2` row.

- [ ] **Step 6: Render the badge in `SidebarFlatSessionItem.tsx`**

In `src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx`, repeat Step 5 exactly (same imports, same hook call + `showProfileBadge`, same badge JSX) inserting after the `compactSessionAge` span in **both** the desktop block (after line 178) and the mobile block (after line 125).

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/sidebar/utils/utils.ts \
        src/components/sidebar/utils/flatSessions.test.ts \
        src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx \
        src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx
git commit -m "feat(sidebar): badge non-default Claude profile sessions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Manual verification (drive the app)

**Files:** none (verification only)

- [ ] **Step 1: Configure two profiles + start the app**

In a terminal without the sandbox, set `CLAUDE_PROFILES` (e.g. in `.env`) to a JSON array with two entries — the default plus a second profile pointing at a separate config dir, e.g.:
```
CLAUDE_PROFILES=[{"id":"claude","label":"Personal","configDir":"/Users/<you>/.claude"},{"id":"claude:work","label":"Work","configDir":"/Users/<you>/.claude-work"}]
```
Run `npm run dev`. Expected: Vite on `http://localhost:5173`, backend on `:3001`.

- [ ] **Step 2: Verify the endpoint**

`curl -s -H "Authorization: Bearer <token>" http://localhost:5173/api/providers/claude/profiles` (or hit it from the app). Expected JSON: `{ success: true, data: { provider: 'claude', profiles: [{id:'claude',label:'Personal',isDefault:true},{id:'claude:work',label:'Work',isDefault:false}] } }` — no `configDir`.

- [ ] **Step 3: Verify the picker**

Open the app, start a new chat. The model picker should now show **two** Claude groups ("Personal", "Work") plus the four other providers. Pick a model under "Work" → send a message. Confirm (server logs / behavior) it spawned under the work config dir.

- [ ] **Step 4: Verify sidebar visibility + badge**

Create at least one session under each profile. In the sidebar (both Grouped and Recent views), both sessions appear in the Claude list; the "Work" session shows a small **"WORK"** badge; the "Personal" (default) session shows none.

- [ ] **Step 5: Verify resume routing**

Click the "Work" session → it opens; send a follow-up → confirm it resumes under the work profile (correct account/config dir). Click the "Personal" session → resumes under the default.

- [ ] **Step 6: Verify the single-profile default is unchanged**

Unset `CLAUDE_PROFILES` (or set a single entry), reload. The picker shows the original "Anthropic" Claude group, no badges appear, and `selected-provider`/`claude-model` behave exactly as before.

- [ ] **Step 7: Final gate**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.
Run (sandbox disabled): `npx tsx --test --tsconfig server/tsconfig.json 'server/modules/providers/tests/*.test.ts' 'server/modules/providers/list/claude/tests/*.test.ts' 'server/modules/projects/tests/*.test.ts'` and `npx tsx --test 'src/lib/provider-id.test.ts' 'src/components/sidebar/utils/flatSessions.test.ts'`
Expected: all green.

---

## Self-Review

**1. Spec coverage** — every in-scope spec item maps to a task:
- Backend profiles endpoint → Task 1.
- Issue 1 fix (visible + carry id) → Task 2.
- Additive type model + base helper + logo → Task 3.
- `useClaudeProfiles` → Task 4.
- Picker (one group/profile), instance-id persistence, profile-aware model, forward → Task 5.
- Resume under correct profile → Task 6.
- Sidebar badge (multi-profile only, non-default) → Task 7.
- Manual verification incl. unchanged default → Task 8.
- Deferred (auth UI, general API un-collapse) → not in this plan, by design.

**2. Placeholder scan** — every code step contains complete, paste-ready code or an exact from→to edit. The only "verify and adjust" note (Task 5 Step 12) is bounded by a typecheck and explains exactly what to change if it complains.

**3. Type consistency** — names verified against source: `ProviderInstanceId`, `ClaudeProfileSummary`, `providerInstanceId` (backend `SessionSummary` + frontend `ProjectSession`), `baseProviderOf`/`isClaudeFamily` (frontend `src/lib/provider-id.ts`, backend `@/shared/provider-id.js`), `claudeModelStorageKey`, `shouldShowProfileBadge`/`profileBadgeLabel`, `useClaudeProfiles` returning `{ profiles, byId, isMultiProfile, isLoading }`. The websocket forward field is the **top-level** `provider` (confirmed against `chat-websocket.service.ts:127-133` + `claude-sdk.js:517`), not `options.provider`/`options.instanceId`. `Provider` (chat alias) widened once to propagate. `SessionWithProvider.__provider` widened in Task 3 so Task 6's assignment typechecks.

**4. Dependency order** — 1 and 2 are backend, independent. 3 is the frontend foundation for 4–7. 5 depends on 3+4; 6 depends on 2 (`providerInstanceId`) + 3; 7 depends on 3+4+6. Execute in order 1→8.
