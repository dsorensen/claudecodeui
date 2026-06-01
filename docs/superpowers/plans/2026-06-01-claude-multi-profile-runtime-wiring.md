# Claude Multi-Profile — Plan 2: Runtime Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend runtime profile-aware end-to-end — spawn the selected Claude profile's CLI with its `CLAUDE_CONFIG_DIR`, index each profile's sessions separately, tag chat messages with the instance id, and route the literal-`'claude'` dispatch branches by base provider — so two profiles' sessions and runs no longer collide.

**Architecture:** Builds on Plan 1 (merged): providers are keyed by instance id (`claude`, `claude:13layers`) with `baseProvider`/`baseProviderOf`/`isClaudeFamily` helpers; the registry builds one `ClaudeProvider(id, configDir)` per profile. Plan 2 threads the selected instance id from the chat WebSocket into `queryClaudeSDK` (which resolves it to a `configDir` and sets `CLAUDE_CONFIG_DIR` on the spawn), expands the session watcher to one path per profile, un-collapses the *internal* session-synchronizer accounting, and generalizes the dispatch branches.

**Tech Stack:** Node + TypeScript (run via `tsx`), `node:test` runner, ESLint with `eslint-plugin-boundaries`.

**Scope boundary (Plan 2 vs Plan 3):** Plan 2 changes only INTERNAL/runtime behavior and keeps frontend-facing list APIs stable. The two frontend-facing collapses — `sessions.service.listProviderIds()` and `mcp.service.addMcpServerToAllProviders` results — stay base-provider for now and are un-collapsed in **Plan 3** alongside the UI that consumes instance ids. Plan 2 is verified via integration tests, not the UI (a human can't pick a profile until Plan 3). The sessions DB already stores an arbitrary `string` provider (confirmed in Plan 1) — no migration.

**Test command:** `npx tsx --test --tsconfig server/tsconfig.json <files>` — node:test, NOT vitest. Typecheck: `npx tsc --noEmit -p server/tsconfig.json`. Lint: `npx eslint <files>`. Retry any command that fails with `EPERM`/"operation not permitted" using `dangerouslyDisableSandbox: true` (npm cache / tsx IPC pipe / husky writes). Husky runs lint-staged (eslint) on staged files at commit.

---

## File Structure

**Modify:**
- `server/modules/providers/list/claude/claude-profiles.ts` — add `getClaudeProfileConfigDir(id)` lookup.
- `server/claude-sdk.js` — extract provider id from `options`, inject per-profile `CLAUDE_CONFIG_DIR` at the env spread, emit the instance id in messages.
- `server/modules/websocket/services/chat-websocket.service.ts` — read the instance provider id and forward it into the `claude-command` dispatch; route abort by base provider.
- `server/modules/providers/services/sessions-watcher.service.ts` — expand the claude watch entry into one path per profile (instance-id tagged); accept a `string` provider.
- `server/modules/providers/services/session-synchronizer.service.ts` — `synchronizeProviderFile(provider: string)`, `Record<string, number>` accounting, un-collapse `baseProviderOf`.
- `server/routes/git.js`, `server/routes/agent.js` — route the claude branch by base provider and forward the instance id.
- `server/modules/providers/services/session-conversations-search.service.ts` — compare by base provider.
- `server/modules/providers/provider.routes.ts` — `parseProvider` accepts instance ids.

**Create:**
- `server/modules/providers/list/claude/tests/claude-profile-configdir.test.ts`
- `server/modules/providers/tests/runtime-multiprofile.test.ts` (integration)

---

## Task 1: Resolve a provider instance id to its profile config dir

**Files:**
- Modify: `server/modules/providers/list/claude/claude-profiles.ts`
- Test: `server/modules/providers/list/claude/tests/claude-profile-configdir.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { getClaudeProfileConfigDir } from '@/modules/providers/list/claude/claude-profiles.js';

const withEnv = (value: string | undefined, fn: () => void) => {
  const original = process.env.CLAUDE_PROFILES;
  if (value === undefined) delete process.env.CLAUDE_PROFILES;
  else process.env.CLAUDE_PROFILES = value;
  try { fn(); } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
};

test('getClaudeProfileConfigDir returns the configured dir for an instance id', () => {
  withEnv(
    JSON.stringify([
      { id: 'claude', label: 'P', configDir: '/home/u/.claude' },
      { id: 'claude:work', label: 'W', configDir: '/home/u/.claude-work' },
    ]),
    () => {
      assert.equal(getClaudeProfileConfigDir('claude:work'), '/home/u/.claude-work');
      assert.equal(getClaudeProfileConfigDir('claude'), '/home/u/.claude');
    },
  );
});

test('getClaudeProfileConfigDir returns undefined for an unknown id', () => {
  withEnv(undefined, () => {
    assert.equal(getClaudeProfileConfigDir('claude:nope'), undefined);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** (`getClaudeProfileConfigDir` not exported).

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/list/claude/tests/claude-profile-configdir.test.ts`

- [ ] **Step 3: Implement.** Append to `server/modules/providers/list/claude/claude-profiles.ts`:

```ts
/**
 * Returns the configDir for a configured Claude profile instance id, or
 * undefined if no profile with that id is configured.
 */
export function getClaudeProfileConfigDir(id: string): string | undefined {
  return loadClaudeProfiles().find((profile) => profile.id === id)?.configDir;
}
```

- [ ] **Step 4: Run the test, confirm 2 pass.**

- [ ] **Step 5: Commit**

```bash
git add server/modules/providers/list/claude/claude-profiles.ts server/modules/providers/list/claude/tests/claude-profile-configdir.test.ts
git commit -m "feat(providers): add getClaudeProfileConfigDir lookup"
```

---

## Task 2: Spawn the selected profile's config dir + emit its instance id

`queryClaudeSDK(command, options, ws)` currently ignores the provider id and emits a hardcoded `provider: 'claude'`. Thread an `options.provider` (instance id) through: resolve it to a configDir and set `CLAUDE_CONFIG_DIR` on the spawn env, and use it in emitted messages.

**Files:**
- Modify: `server/claude-sdk.js`

- [ ] **Step 1: Import the resolver.** Near the existing `./shared/claude-config-dir.js` import in `server/claude-sdk.js`, add:

```js
import { getClaudeProfileConfigDir } from './modules/providers/list/claude/claude-profiles.js';
```

- [ ] **Step 2: Inject `CLAUDE_CONFIG_DIR` per profile in `mapCliOptionsToSDK`.** That function (around line 149) destructures `options` and sets `sdkOptions.env = { ...process.env }` (~line 156). Update the destructure to include `provider`, and after the env spread, override `CLAUDE_CONFIG_DIR` when the provider is a configured Claude profile:

```js
function mapCliOptionsToSDK(options = {}) {
  const { sessionId, cwd, toolsSettings, permissionMode, provider } = options;

  const sdkOptions = {};

  // Forward all host env vars (e.g. ANTHROPIC_BASE_URL) to the subprocess.
  // Since SDK 0.2.113, options.env replaces process.env instead of overlaying it.
  sdkOptions.env = { ...process.env };

  // Point the spawned CLI at the selected Claude profile's config dir. When the
  // provider is the default 'claude' (or unknown), leave the inherited value so
  // behavior is unchanged.
  const profileConfigDir = provider ? getClaudeProfileConfigDir(provider) : undefined;
  if (profileConfigDir) {
    sdkOptions.env.CLAUDE_CONFIG_DIR = profileConfigDir;
  }

  // ...rest unchanged...
```

- [ ] **Step 3: Emit the instance id instead of the literal `'claude'`.** In `queryClaudeSDK` (signature at ~line 504), derive the instance id once at the top of the function body:

```js
async function queryClaudeSDK(command, options = {}, ws) {
  const providerId = options.provider || 'claude';
  // ...existing body...
```

Then replace every emitted `provider: 'claude'` literal in this function's `createNormalizedMessage(...)` / `ws.send(...)` calls (the occurrences at approximately lines 550, 594, 596, 616, 692, 715, 728, 731, 756, 759) with `provider: providerId`. Use a careful find/replace scoped to this function only — do NOT change `provider: 'claude'` strings outside `queryClaudeSDK`. After editing, grep to confirm none remain in the function:

Run: `grep -n "provider: 'claude'" server/claude-sdk.js` — expect only occurrences (if any) outside `queryClaudeSDK`; there should be none left inside it.

- [ ] **Step 4: Typecheck + smoke.**

Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0.
Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/*.test.ts` → all pass (no behavior change for the default 'claude' path: `getClaudeProfileConfigDir('claude')` returns the default profile's dir, which equals the inherited resolution; and `providerId` defaults to `'claude'`).

- [ ] **Step 5: Commit**

```bash
git add server/claude-sdk.js
git commit -m "feat(providers): spawn selected Claude profile's config dir and tag its messages"
```

---

## Task 3: Forward the instance provider id from the chat WebSocket

`readProvider` collapses to the base `LLMProvider` allowlist, and the `claude-command` dispatch (`queryClaudeSDK(data.command, data.options, writer)`) doesn't pass the provider. Make the read instance-aware and forward the id into `options`.

**Files:**
- Modify: `server/modules/websocket/services/chat-websocket.service.ts`

- [ ] **Step 1: Make `readProvider` instance-aware.** Replace the base-allowlist body (around lines 64-70) so it accepts any known provider-family id (validated via `baseProviderOf`, which throws on an unknown base) and falls back to the default otherwise:

```ts
import { baseProviderOf } from '@/shared/provider-id.js';
// ...
function readProvider(value: unknown): string {
  if (typeof value === 'string') {
    try {
      baseProviderOf(value); // throws on unknown base; accepts e.g. 'claude:13layers'
      return value;
    } catch {
      return DEFAULT_PROVIDER;
    }
  }
  return DEFAULT_PROVIDER;
}
```

(Change `readProvider`'s return type to `string`. `DEFAULT_PROVIDER` stays `'claude'`.)

- [ ] **Step 2: Forward the provider into the claude dispatch.** At the `claude-command` branch (around lines 121-124), pass the read provider id through `options.provider`:

```ts
if (messageType === 'claude-command') {
  const provider = readProvider(data.provider);
  await dependencies.queryClaudeSDK(
    data.command ?? '',
    { ...(data.options ?? {}), provider },
    writer,
  );
  return;
}
```

- [ ] **Step 3: Route abort/resume by base provider.** Where the abort branch dispatches by provider (around lines 164-173), the trailing `else` already defaults to `abortClaudeSDKSession`. Confirm the leading comparisons (`provider === 'cursor'` etc.) still hold for base ids; since a Claude instance id like `'claude:work'` won't match `'cursor'`/`'codex'`/`'gemini'`/`'opencode'`, it correctly falls through to the claude abort. No change needed unless a non-claude provider also gains instance ids (out of scope). Add a brief comment noting the `else` covers all claude-family ids.

- [ ] **Step 4: Typecheck.**

Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0. Fix any ripple from `readProvider` now returning `string` (e.g. a variable typed `LLMProvider` that receives it — widen to `string` or compare via `baseProviderOf`).

- [ ] **Step 5: Commit**

```bash
git add server/modules/websocket/services/chat-websocket.service.ts
git commit -m "feat(providers): forward selected Claude profile id from chat websocket"
```

---

## Task 4: Watch + index each profile's sessions separately

`PROVIDER_WATCH_PATHS` has a single `claude` entry; the synchronizer aggregates into `Record<LLMProvider, number>` and collapses instance ids. Expand the claude entry to one path per configured profile (tagged with the instance id) and un-collapse the internal accounting.

**Files:**
- Modify: `server/modules/providers/services/sessions-watcher.service.ts`
- Modify: `server/modules/providers/services/session-synchronizer.service.ts`

- [ ] **Step 1: Un-collapse the synchronizer accounting.** In `session-synchronizer.service.ts`:

Change the result type (around lines 6-9):
```ts
type SessionSynchronizeResult = {
  processedByProvider: Record<string, number>;
  failures: string[];
};
```

In `synchronizeSessions()` (around lines 18-59), replace the pre-seeded `processedByProvider` object literal with an empty record and stop collapsing:
```ts
const processedByProvider: Record<string, number> = {};
// ...
const results = await Promise.allSettled(
  providerRegistry.listProviders().map(async (provider) => ({
    provider: provider.id, // instance id, no longer baseProviderOf(...)
    processed: await provider.sessionSynchronizer.synchronize(lastScanAt ?? undefined),
  })),
);
```
(Assigning `processedByProvider[result.value.provider] = ...` into a `Record<string, number>` is fine with arbitrary keys.) Remove the now-unused `baseProviderOf` import IF it's no longer used elsewhere in this file.

Change `synchronizeProviderFile`'s signature (around lines 64-75) to accept and return a `string` provider:
```ts
async synchronizeProviderFile(
  provider: string,
  filePath: string,
): Promise<{ provider: string; indexed: boolean; sessionId: string | null }>
```
and resolve the per-provider synchronizer via `providerRegistry.resolveProvider(provider).sessionSynchronizer` (it already does this — confirm it passes the instance id straight through, not a collapsed base).

- [ ] **Step 2: Expand the claude watch entry per profile.** In `sessions-watcher.service.ts`, change the `PROVIDER_WATCH_PATHS` type to use `string` providers and build the claude entries from the profiles. Replace the static array (around lines 15-42) with a builder:

```ts
import { loadClaudeProfiles } from '@/modules/providers/list/claude/claude-profiles.js';
// ...
const buildProviderWatchPaths = (): Array<{ provider: string; rootPath: string }> => [
  ...loadClaudeProfiles().map((profile) => ({
    provider: profile.id,
    rootPath: path.join(profile.configDir, 'projects'),
  })),
  { provider: 'cursor', rootPath: path.join(os.homedir(), '.cursor', 'projects') },
  { provider: 'codex', rootPath: path.join(os.homedir(), '.codex', 'sessions') },
  { provider: 'gemini', rootPath: path.join(os.homedir(), '.gemini', 'tmp') },
  { provider: 'opencode', rootPath: path.join(os.homedir(), '.local', 'share', 'opencode') },
];
```
Replace the module-level `PROVIDER_WATCH_PATHS` constant usage with a call to `buildProviderWatchPaths()` at watcher-start time (so profiles are read when the watcher initializes, not frozen at import — mirrors Plan 1's lazy principle). Update `onUpdate(eventType, filePath, provider: string)` and `isWatcherTargetFile(provider: string, ...)` signatures from `LLMProvider` to `string`.

- [ ] **Step 3: Typecheck.**

Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0. Fix ripples where `LLMProvider` was assumed (the watcher/synchronizer now pass `string`). The DB `createSession(provider: string, ...)` already accepts it.

- [ ] **Step 4: Run existing tests.**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/*.test.ts server/modules/providers/list/claude/tests/*.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add server/modules/providers/services/sessions-watcher.service.ts server/modules/providers/services/session-synchronizer.service.ts
git commit -m "feat(providers): watch and index each Claude profile's sessions by instance id"
```

---

## Task 5: Generalize the literal-'claude' dispatch branches

Three branches compare a provider STRING to the literal `'claude'`; generalize them to the Claude family and forward the instance id where they spawn.

**Files:**
- Modify: `server/routes/git.js`
- Modify: `server/routes/agent.js`
- Modify: `server/modules/providers/services/session-conversations-search.service.ts`
- Modify: `server/modules/providers/provider.routes.ts`

- [ ] **Step 1: `git.js` (~line 987).** Replace `if (provider === 'claude') {` with a Claude-family check and forward the instance id into the spawn options:

```js
import { baseProviderOf } from '../shared/provider-id.js';
// ...
if (baseProviderOf(provider) === 'claude') {
  await queryClaudeSDK(prompt, { /* existing opts */, provider }, writer);
} else if (provider === 'cursor') {
  // ...unchanged
}
```
(Add `provider` to the options object passed to `queryClaudeSDK` so the right profile dir is used.)

- [ ] **Step 2: `agent.js` (~line 948).** Same transformation: `if (baseProviderOf(provider) === 'claude') { ... await queryClaudeSDK(message.trim(), { /* existing opts */, provider }, writer); }`. Import `baseProviderOf` from `../shared/provider-id.js`.

- [ ] **Step 3: `session-conversations-search.service.ts` (~lines 1147, 1239).** Replace `session.provider === 'claude'` with `baseProviderOf(session.provider) === 'claude'` at both sites. Import `baseProviderOf` from `@/shared/provider-id.js`. (This makes search/parsing treat all claude-family sessions as claude.)

- [ ] **Step 4: `provider.routes.ts` `parseProvider` (~lines 181-191).** Make it accept instance ids: return `string` and validate via `baseProviderOf` (throws on unknown base):

```ts
import { baseProviderOf } from '@/shared/provider-id.js';
// ...
const parseProvider = (value: unknown): string => {
  const normalized = normalizeProviderParam(value);
  try {
    baseProviderOf(normalized); // accepts 'claude', 'claude:13layers', 'gemini', ...
    return normalized;
  } catch {
    throw new AppError(`Unsupported provider "${normalized}".`, {
      code: 'UNSUPPORTED_PROVIDER',
      statusCode: 400,
    });
  }
};
```

- [ ] **Step 5: Typecheck + tests.**

Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0. Fix any caller that expected `parseProvider` to return `LLMProvider` (downstream services already accept `string` provider via `resolveProvider`/`createSession`; widen local annotations as needed).
Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/*.test.ts` → all pass.

- [ ] **Step 6: Commit**

```bash
git add server/routes/git.js server/routes/agent.js server/modules/providers/services/session-conversations-search.service.ts server/modules/providers/provider.routes.ts
git commit -m "feat(providers): route claude-family dispatch by base provider and forward instance id"
```

---

## Task 6: End-to-end integration test — two profiles separate

**Files:**
- Create: `server/modules/providers/tests/runtime-multiprofile.test.ts`

- [ ] **Step 1: Write the integration test.** It configures two Claude profiles pointing at two temp dirs each containing a fake session JSONL, runs the synchronizer, and asserts the two sessions are stored under distinct instance-id providers (no collision).

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const writeSessionFile = async (configDir: string, sessionId: string, cwd: string) => {
  const projectDir = path.join(configDir, 'projects', cwd.replace(/[^a-zA-Z0-9-]/g, '-'));
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, `${sessionId}.jsonl`),
    JSON.stringify({ sessionId, cwd }) + '\n',
    'utf8',
  );
};

test('two Claude profiles index their sessions under distinct instance ids', async () => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-a-'));
  const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-b-'));
  await writeSessionFile(dirA, 'sess-a', '/work/a');
  await writeSessionFile(dirB, 'sess-b', '/work/b');

  const originalProfiles = process.env.CLAUDE_PROFILES;
  process.env.CLAUDE_PROFILES = JSON.stringify([
    { id: 'claude', label: 'A', configDir: dirA },
    { id: 'claude:b', label: 'B', configDir: dirB },
  ]);

  try {
    const { buildProviderRegistry } = await import('@/modules/providers/provider.registry.js');
    const registry = buildProviderRegistry();

    const a = await registry.resolveProvider('claude').sessionSynchronizer.synchronize();
    const b = await registry.resolveProvider('claude:b').sessionSynchronizer.synchronize();

    assert.equal(a, 1, 'profile claude indexed its one session');
    assert.equal(b, 1, 'profile claude:b indexed its one session');

    const { sessionsDb } = await import('@/modules/database/index.js');
    assert.equal(sessionsDb.getSessionById('sess-a')?.provider, 'claude');
    assert.equal(sessionsDb.getSessionById('sess-b')?.provider, 'claude:b');
  } finally {
    if (originalProfiles === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = originalProfiles;
    await fs.rm(dirA, { recursive: true, force: true });
    await fs.rm(dirB, { recursive: true, force: true });
  }
});
```

(Note: `synchronize()` returns the processed count; `sessionsDb.getSessionById` exposes the stored `provider`. If the DB is shared and needs init, mirror the setup used by `server/modules/providers/tests/opencode-sessions.test.ts` — read that file first and reuse its DB-init/teardown pattern.)

- [ ] **Step 2: Run it, confirm it fails first if written before any wiring; here it validates the cumulative Plan 2 behavior. Confirm it passes.**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/runtime-multiprofile.test.ts`
Expected: PASS — `sess-a` tagged `claude`, `sess-b` tagged `claude:b`.

- [ ] **Step 3: Full suite + typecheck.**

Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0.
Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/*.test.ts server/modules/providers/list/claude/tests/*.test.ts server/shared/*.test.ts` → all pass.

- [ ] **Step 4: Commit**

```bash
git add server/modules/providers/tests/runtime-multiprofile.test.ts
git commit -m "test(providers): integration test for per-profile session separation"
```

---

## Self-Review

**Spec coverage (design spec §3):**
- Watcher one entry per profile, tagged with instance id → Task 4. ✓
- `claude-sdk.js` resolves provider id → configDir, sets `env.CLAUDE_CONFIG_DIR` → Task 2. ✓
- Emitted chat messages carry the instance id → Task 2. ✓
- Provider id flows client → WS → spawn → Task 3 (forward) + Task 2 (consume). ✓
- Generalize the ~6 literal `=== 'claude'` branches → Tasks 3 (abort), 5 (git/agent/search/parseProvider). ✓
- Un-collapse the internal `session-synchronizer` accounting → Task 4. ✓ (Frontend-facing `listProviderIds` + `mcp.service` results intentionally deferred to Plan 3 — see scope boundary.)
- Sessions DB accepts instance ids, separation verified → Task 6. ✓

**Placeholder scan:** Concrete code in each step. The only "find/fix" loops (Task 2 Step 3 message-literal replace; typecheck ripple steps) are bounded with exact grep/typecheck commands and the enumerated sites from the touch-point map.

**Type consistency:** `getClaudeProfileConfigDir(id: string): string | undefined` (Task 1) consumed in Task 2. `options.provider` (instance id string) set in Task 3, read in Task 2. `synchronizeProviderFile(provider: string)` + `Record<string, number>` (Task 4) consistent with the watcher passing `provider: string`. `parseProvider(): string` + `baseProviderOf` (Task 5) consistent with `readProvider(): string` (Task 3).

---

## Subsequent plan (Plan 3 — UI, authored after Plan 2 lands)

- Provider picker lists configured profiles (labels from config, shared Claude icon resolved by `baseProvider`); selection persisted per full id; `claude-model` localStorage becomes profile-aware.
- Per-profile auth status in the Agents settings tab.
- **Un-collapse the two frontend-facing APIs** deferred from Plan 2: `sessions.service.listProviderIds()` → `string[]` of instance ids, and `mcp.service.addMcpServerToAllProviders` results → `{ provider: string }`; update the frontend `LLMProvider` mirror (`src/types/app.ts`) + keyed maps (`providerAuthStatus`, `FALLBACK_DEFAULT_MODEL`, `providerModelCatalog`) to key by full instance id while resolving type-level concerns (icon, model catalog) by `baseProvider`.
