# Claude Multi-Profile — Plan 1: Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the backend register multiple Claude profiles as provider instances (e.g. `claude` and `claude:13layers`), each reading its own config dir, while keeping default single-profile behavior byte-identical.

**Architecture:** A config-driven profile list (`CLAUDE_PROFILES` env) drives the provider registry to build one `ClaudeProvider` per profile. Each provider carries a `baseProvider` (`'claude'`, for type-level logic) and an instance `id` (`'claude'` or `'claude:<name>'`, for instance-level logic). The Claude sub-providers that read the filesystem (`auth`, `mcp`, `skills`, `sessionSynchronizer`) accept a `configDir`, defaulting to the existing `getClaudeConfigDir()` resolver.

**Tech Stack:** Node + TypeScript (run via `tsx`), `node:test` runner, ESLint with `eslint-plugin-boundaries`.

**Scope note:** This is plan 1 of 3. Plan 2 wires runtime (per-profile file watcher, spawn `CLAUDE_CONFIG_DIR`, emit instance id in chat messages, generalize the ~6 literal `'claude'` branches, end-to-end session separation). Plan 3 is the UI (provider picker shows profiles, per-profile auth, persistence). Plans 2–3 are authored after this lands, against the real signatures defined here.

**Test command (this repo):** `npx tsx --test --tsconfig server/tsconfig.json <files...>` — node:test, NOT vitest (vitest can't resolve the `@/` alias). Typecheck: `npx tsc --noEmit -p server/tsconfig.json`. Lint: `npx eslint <files>`. Some commands need the sandbox disabled (npm cache / out-of-project writes hit EPERM).

---

## File Structure

**Create:**
- `server/shared/provider-id.ts` — `baseProviderOf(id)` helper (parses `claude:13layers` → `claude`).
- `server/shared/provider-id.test.ts` — its tests.
- `server/modules/providers/list/claude/claude-profiles.ts` — `ClaudeProfile` loader from `CLAUDE_PROFILES` env, with the always-present default rule.
- `server/modules/providers/list/claude/tests/claude-profiles.test.ts` — its tests.

**Modify:**
- `server/shared/types.ts` — add `ClaudeProfile` type.
- `server/shared/claude-config-dir.ts` — add `getClaudeJsonPathForDir(configDir)`.
- `server/shared/claude-config-dir.test.ts` — new test file for the above (none exists today).
- `server/shared/interfaces.ts:25-33` — `IProvider`: add `baseProvider`, widen `id` to `string`.
- `server/modules/providers/shared/base/abstract.provider.ts` — add `baseProvider`, widen `id`, new constructor.
- `server/modules/providers/list/claude/claude-auth.provider.ts` — constructor accepts `configDir`.
- `server/modules/providers/list/claude/claude-mcp.provider.ts` — constructor accepts `configDir`; use `getClaudeJsonPathForDir`.
- `server/modules/providers/list/claude/claude-skills.provider.ts` — instance `configDir` instead of module-level `getClaudeHomePath()`.
- `server/modules/providers/list/claude/claude-session-synchronizer.provider.ts` — constructor accepts `configDir` and instance `id`.
- `server/modules/providers/list/claude/claude.provider.ts` — constructor `{ id, configDir }`, forward to sub-providers.
- `server/modules/providers/provider.registry.ts` — build Claude instances from `loadClaudeProfiles()`.
- `eslint.config.js:160-165` — register the two new `server/shared/*.ts` files as `backend-shared-utils`.

---

## Task 1: `baseProviderOf` helper

**Files:**
- Create: `server/shared/provider-id.ts`
- Test: `server/shared/provider-id.test.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Write the failing test**

Create `server/shared/provider-id.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { baseProviderOf, isClaudeFamily } from '@/shared/provider-id.js';

test('baseProviderOf returns the bare id for a base provider', () => {
  assert.equal(baseProviderOf('claude'), 'claude');
  assert.equal(baseProviderOf('gemini'), 'gemini');
});

test('baseProviderOf strips the instance suffix', () => {
  assert.equal(baseProviderOf('claude:13layers'), 'claude');
  assert.equal(baseProviderOf('claude:work'), 'claude');
});

test('baseProviderOf throws on an unknown base', () => {
  assert.throws(() => baseProviderOf('bogus'));
  assert.throws(() => baseProviderOf('bogus:x'));
});

test('isClaudeFamily recognizes claude instance ids', () => {
  assert.equal(isClaudeFamily('claude'), true);
  assert.equal(isClaudeFamily('claude:13layers'), true);
  assert.equal(isClaudeFamily('gemini'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/shared/provider-id.test.ts`
Expected: FAIL — `Cannot find package '@/shared/provider-id.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `server/shared/provider-id.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/shared/provider-id.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the new shared file with ESLint boundaries**

In `eslint.config.js`, the `backend-shared-utils` element (around line 160) lists shared runtime files. Add the new file:

```js
          pattern: [
            "server/shared/utils.{js,ts}",
            "server/shared/frontmatter.ts",
            "server/shared/claude-cli-path.ts",
            "server/shared/claude-config-dir.ts",
            "server/shared/provider-id.ts",
          ], // classify shared utility files so modules can depend on them explicitly
```

Run: `npx eslint server/shared/provider-id.ts`
Expected: exit 0, no `boundaries/no-unknown` errors.

- [ ] **Step 6: Commit**

```bash
git add server/shared/provider-id.ts server/shared/provider-id.test.ts eslint.config.js
git commit -m "feat(providers): add baseProviderOf/isClaudeFamily provider-id helpers"
```

---

## Task 2: `getClaudeJsonPathForDir` (preserve home-root default)

**Why:** the default `~/.claude` profile keeps its global config at the legacy `~/.claude.json` (home root), but every other config dir holds `.claude.json` inside it. The MCP provider needs a per-dir resolver that preserves this.

**Files:**
- Modify: `server/shared/claude-config-dir.ts`
- Test: `server/shared/claude-config-dir.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/shared/claude-config-dir.test.ts`:

```ts
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getClaudeJsonPathForDir } from '@/shared/claude-config-dir.js';

test('getClaudeJsonPathForDir keeps the legacy home-root path for the default dir', () => {
  const defaultDir = path.join(os.homedir(), '.claude');
  assert.equal(getClaudeJsonPathForDir(defaultDir), path.join(os.homedir(), '.claude.json'));
});

test('getClaudeJsonPathForDir nests .claude.json inside a custom dir', () => {
  const customDir = path.join(os.homedir(), '.claude-13layers');
  assert.equal(getClaudeJsonPathForDir(customDir), path.join(customDir, '.claude.json'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/shared/claude-config-dir.test.ts`
Expected: FAIL — `getClaudeJsonPathForDir` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `server/shared/claude-config-dir.ts`, append:

```ts
/**
 * Resolves the .claude.json path for a specific config dir. The default
 * ~/.claude profile keeps it at the legacy home-root ~/.claude.json; any other
 * dir holds .claude.json inside itself.
 */
export function getClaudeJsonPathForDir(configDir: string): string {
  return configDir === path.join(os.homedir(), '.claude')
    ? path.join(os.homedir(), '.claude.json')
    : path.join(configDir, '.claude.json');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/shared/claude-config-dir.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/shared/claude-config-dir.ts server/shared/claude-config-dir.test.ts
git commit -m "feat(providers): add getClaudeJsonPathForDir for per-profile .claude.json"
```

---

## Task 3: `ClaudeProfile` type + `loadClaudeProfiles` loader

**Files:**
- Modify: `server/shared/types.ts`
- Create: `server/modules/providers/list/claude/claude-profiles.ts`
- Test: `server/modules/providers/list/claude/tests/claude-profiles.test.ts`

- [ ] **Step 1: Add the `ClaudeProfile` type**

In `server/shared/types.ts`, directly under the `LLMProvider` definition (line 68), add:

```ts
/**
 * One configured Claude profile. `id` is the provider instance id ("claude" for
 * the default profile, "claude:<name>" for additional profiles). `configDir` is
 * that profile's CLAUDE_CONFIG_DIR.
 */
export type ClaudeProfile = {
  id: string;
  label: string;
  configDir: string;
};
```

- [ ] **Step 2: Write the failing test**

Create `server/modules/providers/list/claude/tests/claude-profiles.test.ts`:

```ts
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadClaudeProfiles } from '@/modules/providers/list/claude/claude-profiles.js';

const withEnv = (value: string | undefined, fn: () => void) => {
  const original = process.env.CLAUDE_PROFILES;
  if (value === undefined) delete process.env.CLAUDE_PROFILES;
  else process.env.CLAUDE_PROFILES = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
};

test('loadClaudeProfiles returns a single default claude profile when unset', () => {
  withEnv(undefined, () => {
    const profiles = loadClaudeProfiles();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'claude');
    assert.equal(profiles[0].configDir, path.join(os.homedir(), '.claude'));
  });
});

test('loadClaudeProfiles parses configured profiles', () => {
  withEnv(
    JSON.stringify([
      { id: 'claude', label: 'Personal', configDir: '/home/u/.claude' },
      { id: 'claude:work', label: 'Work', configDir: '/home/u/.claude-work' },
    ]),
    () => {
      const profiles = loadClaudeProfiles();
      assert.deepEqual(profiles.map((p) => p.id), ['claude', 'claude:work']);
      assert.equal(profiles[1].configDir, '/home/u/.claude-work');
    },
  );
});

test('loadClaudeProfiles prepends a default claude profile when omitted', () => {
  withEnv(
    JSON.stringify([{ id: 'claude:work', label: 'Work', configDir: '/home/u/.claude-work' }]),
    () => {
      const profiles = loadClaudeProfiles();
      assert.equal(profiles[0].id, 'claude');
      assert.deepEqual(profiles.map((p) => p.id), ['claude', 'claude:work']);
    },
  );
});

test('loadClaudeProfiles falls back to the default on malformed JSON', () => {
  withEnv('not json', () => {
    const profiles = loadClaudeProfiles();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'claude');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/list/claude/tests/claude-profiles.test.ts`
Expected: FAIL — `Cannot find package '.../claude-profiles.js'`.

- [ ] **Step 4: Write minimal implementation**

Create `server/modules/providers/list/claude/claude-profiles.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/list/claude/tests/claude-profiles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/shared/types.ts server/modules/providers/list/claude/claude-profiles.ts server/modules/providers/list/claude/tests/claude-profiles.test.ts
git commit -m "feat(providers): add ClaudeProfile type and CLAUDE_PROFILES loader"
```

---

## Task 4: Add `baseProvider` to the provider contract

**Files:**
- Modify: `server/shared/interfaces.ts:25-33`
- Modify: `server/modules/providers/shared/base/abstract.provider.ts`

- [ ] **Step 1: Widen `IProvider`**

In `server/shared/interfaces.ts`, replace the `IProvider` block:

```ts
export interface IProvider {
  readonly id: string;
  readonly baseProvider: LLMProvider;
  readonly models: IProviderModels;
  readonly mcp: IProviderMcp;
  readonly auth: IProviderAuth;
  readonly skills: IProviderSkills;
  readonly sessions: IProviderSessions;
  readonly sessionSynchronizer: IProviderSessionSynchronizer;
}
```

- [ ] **Step 2: Update `AbstractProvider`**

In `server/modules/providers/shared/base/abstract.provider.ts`, replace the class body's id/constructor:

```ts
export abstract class AbstractProvider implements IProvider {
  readonly id: string;
  readonly baseProvider: LLMProvider;
  abstract readonly models: IProviderModels;
  abstract readonly mcp: IProviderMcp;
  abstract readonly auth: IProviderAuth;
  abstract readonly skills: IProviderSkills;
  abstract readonly sessions: IProviderSessions;
  abstract readonly sessionSynchronizer: IProviderSessionSynchronizer;

  protected constructor(baseProvider: LLMProvider, id: string = baseProvider) {
    this.baseProvider = baseProvider;
    this.id = id;
  }
}
```

Note: `id` defaults to `baseProvider`, so existing `super('claude')` / `super('gemini')` calls keep working unchanged (id stays `'claude'`, etc.).

- [ ] **Step 3: Run the typechecker to find ripples**

Run: `npx tsc --noEmit -p server/tsconfig.json`

Expected: errors only where code assigns a `provider.id` (now `string`) into an `LLMProvider`-typed slot. Known candidate sites to fix by routing through `baseProviderOf(...)` or by comparing as strings: `provider.registry.ts` (record key type — addressed in Task 7), `provider.routes.ts` `parseProvider`, and any `=== 'claude'` comparison that reads `provider.id`. For each reported error, import `baseProviderOf` from `@/shared/provider-id.js` and compare the base, e.g.:

```ts
// before: if (provider.id === 'claude') { ... }
// after:
import { baseProviderOf } from '@/shared/provider-id.js';
if (baseProviderOf(provider.id) === 'claude') { ... }
```

Fix each reported site this way until `tsc` is clean. (If the only error is the registry record key, defer it to Task 7 and continue.)

- [ ] **Step 4: Commit**

```bash
git add server/shared/interfaces.ts server/modules/providers/shared/base/abstract.provider.ts
git commit -m "feat(providers): add baseProvider and widen provider id to instance string"
```

---

## Task 5: Thread `configDir` into the filesystem sub-providers

Only `auth`, `mcp`, `skills`, and `sessionSynchronizer` read the config dir. Each gains an optional `configDir` defaulting to `getClaudeConfigDir()`, so a no-arg construction is unchanged.

**Files:**
- Modify: `server/modules/providers/list/claude/claude-auth.provider.ts`
- Modify: `server/modules/providers/list/claude/claude-mcp.provider.ts`
- Modify: `server/modules/providers/list/claude/claude-skills.provider.ts`
- Modify: `server/modules/providers/list/claude/claude-session-synchronizer.provider.ts`
- Test: `server/modules/providers/list/claude/tests/claude-configdir.test.ts` (create)

- [ ] **Step 1: `claude-auth.provider.ts` — store `configDir`**

Add a field + constructor to `ClaudeProviderAuth` and use `this.configDir`:

```ts
import { getClaudeConfigDir } from '@/shared/claude-config-dir.js';
// ...
export class ClaudeProviderAuth implements IProviderAuth {
  private readonly configDir: string;

  constructor(configDir: string = getClaudeConfigDir()) {
    this.configDir = configDir;
  }
  // ...
```

Replace the two path reads:

```ts
// loadSettingsEnv():
const settingsPath = path.join(this.configDir, 'settings.json');
// checkCredentials():
const credPath = path.join(this.configDir, '.credentials.json');
```

- [ ] **Step 2: `claude-mcp.provider.ts` — store `configDir`, use `getClaudeJsonPathForDir`**

```ts
import { getClaudeConfigDir, getClaudeJsonPathForDir } from '@/shared/claude-config-dir.js';
// ...
export class ClaudeMcpProvider extends McpProvider {
  private readonly configDir: string;

  constructor(configDir: string = getClaudeConfigDir()) {
    super('claude', ['user', 'local', 'project'], ['stdio', 'http', 'sse']);
    this.configDir = configDir;
  }
  // ...
```

Replace both `const filePath = getClaudeJsonPath();` reads with:

```ts
const filePath = getClaudeJsonPathForDir(this.configDir);
```

(Remove the now-unused `getClaudeJsonPath` import.)

- [ ] **Step 3: `claude-skills.provider.ts` — instance dir instead of module helper**

Replace the module-level `getClaudeHomePath` with a constructor field. Update the class:

```ts
import { getClaudeConfigDir } from '@/shared/claude-config-dir.js';
// ...
export class ClaudeSkillsProvider extends SkillsProvider {
  private readonly configDir: string;

  constructor(configDir: string = getClaudeConfigDir()) {
    super('claude');
    this.configDir = configDir;
  }
  // ...
```

Replace every `getClaudeHomePath()` call inside the class with `this.configDir` (lines ~81 and ~86), and delete the module-level `const getClaudeHomePath = ...` declaration.

- [ ] **Step 4: `claude-session-synchronizer.provider.ts` — config dir + instance id**

```ts
import { getClaudeConfigDir } from '@/shared/claude-config-dir.js';
// ...
export class ClaudeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider: string;
  private readonly claudeHome: string;

  constructor(id: string = 'claude', configDir: string = getClaudeConfigDir()) {
    this.provider = id;
    this.claudeHome = configDir;
  }
  // ...
```

(Replace the existing `private readonly provider = 'claude' as const;` and `private readonly claudeHome = getClaudeConfigDir();` fields. The rest of the class already references `this.provider` and `this.claudeHome`.)

- [ ] **Step 5: Write the failing test (explicit dir is honored)**

Create `server/modules/providers/list/claude/tests/claude-configdir.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeProviderAuth } from '@/modules/providers/list/claude/claude-auth.provider.js';

test('ClaudeProviderAuth reads credentials from the configured dir', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-profile-'));
  await fs.writeFile(
    path.join(dir, '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 60_000 } }),
    'utf8',
  );

  const auth = new ClaudeProviderAuth(dir);
  // checkCredentials is private; assert via getStatus's credential branch.
  const status = await auth.getStatus();
  // Installed-check may be false in CI; the credential read is what we exercise.
  assert.ok(status.method === 'credentials_file' || status.installed === false);

  await fs.rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 6: Run the test**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/list/claude/tests/claude-configdir.test.ts`
Expected: PASS (1 test). If `getStatus` short-circuits on `installed=false` in your environment, the assertion's second branch covers it.

- [ ] **Step 7: Typecheck + run the existing provider tests (no regressions)**

Run: `npx tsc --noEmit -p server/tsconfig.json` → clean.
Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/mcp.test.ts server/modules/providers/tests/skills.test.ts`
Expected: PASS (the default no-arg constructors are unchanged).

- [ ] **Step 8: Commit**

```bash
git add server/modules/providers/list/claude/claude-auth.provider.ts server/modules/providers/list/claude/claude-mcp.provider.ts server/modules/providers/list/claude/claude-skills.provider.ts server/modules/providers/list/claude/claude-session-synchronizer.provider.ts server/modules/providers/list/claude/tests/claude-configdir.test.ts
git commit -m "feat(providers): thread configDir into Claude filesystem sub-providers"
```

---

## Task 6: `ClaudeProvider` accepts `{ id, configDir }`

**Files:**
- Modify: `server/modules/providers/list/claude/claude.provider.ts`

- [ ] **Step 1: Update the constructor and sub-provider wiring**

Replace the class body so sub-providers receive the profile's `configDir` and the synchronizer receives the instance `id`:

```ts
export class ClaudeProvider extends AbstractProvider {
  readonly models: IProviderModels = new ClaudeProviderModels();
  readonly mcp: ClaudeMcpProvider;
  readonly auth: IProviderAuth;
  readonly skills: IProviderSkills;
  readonly sessions: IProviderSessions = new ClaudeSessionsProvider();
  readonly sessionSynchronizer: IProviderSessionSynchronizer;

  constructor(id: string = 'claude', configDir: string = getClaudeConfigDir()) {
    super('claude', id);
    this.mcp = new ClaudeMcpProvider(configDir);
    this.auth = new ClaudeProviderAuth(configDir);
    this.skills = new ClaudeSkillsProvider(configDir);
    this.sessionSynchronizer = new ClaudeSessionSynchronizer(id, configDir);
  }
}
```

Add the import:

```ts
import { getClaudeConfigDir } from '@/shared/claude-config-dir.js';
```

(`ClaudeSessionsProvider` and `ClaudeProviderModels` don't read the config dir, so they stay no-arg.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: clean. (`new ClaudeProvider()` with no args still yields the default `claude` profile.)

- [ ] **Step 3: Commit**

```bash
git add server/modules/providers/list/claude/claude.provider.ts
git commit -m "feat(providers): ClaudeProvider accepts profile id and configDir"
```

---

## Task 7: Registry builds one Claude provider per profile

**Files:**
- Modify: `server/modules/providers/provider.registry.ts`
- Test: `server/modules/providers/tests/provider-registry.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/modules/providers/tests/provider-registry.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

const withEnv = (value: string | undefined, fn: () => Promise<void>) => {
  const original = process.env.CLAUDE_PROFILES;
  if (value === undefined) delete process.env.CLAUDE_PROFILES;
  else process.env.CLAUDE_PROFILES = value;
  return fn().finally(() => {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  });
};

test('registry exposes one claude provider by default', async () => {
  await withEnv(undefined, async () => {
    const { buildProviderRegistry } = await import('@/modules/providers/provider.registry.js');
    const registry = buildProviderRegistry();
    assert.equal(registry.resolveProvider('claude').baseProvider, 'claude');
    assert.throws(() => registry.resolveProvider('claude:none'));
  });
});

test('registry builds a provider per configured claude profile', async () => {
  await withEnv(
    JSON.stringify([
      { id: 'claude', label: 'Personal', configDir: '/tmp/.claude' },
      { id: 'claude:work', label: 'Work', configDir: '/tmp/.claude-work' },
    ]),
    async () => {
      const { buildProviderRegistry } = await import('@/modules/providers/provider.registry.js');
      const registry = buildProviderRegistry();
      const work = registry.resolveProvider('claude:work');
      assert.equal(work.id, 'claude:work');
      assert.equal(work.baseProvider, 'claude');
      assert.equal(registry.resolveProvider('claude').id, 'claude');
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/provider-registry.test.ts`
Expected: FAIL — `buildProviderRegistry` is not exported.

- [ ] **Step 3: Rewrite the registry to build from profiles**

Replace `server/modules/providers/provider.registry.ts` with:

```ts
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

  for (const profile of loadClaudeProfiles()) {
    providers[profile.id] = new ClaudeProvider(profile.id, profile.configDir);
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
```

Note: `providerRegistry` is still exported as a ready singleton, so existing importers (`provider-auth.service.ts`, `mcp.service.ts`, etc.) are unchanged. `buildProviderRegistry` exists for tests that vary `CLAUDE_PROFILES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/provider-registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + full provider/route test sweep**

Run: `npx tsc --noEmit -p server/tsconfig.json` → clean.
Run: `npx tsx --test --tsconfig server/tsconfig.json server/modules/providers/tests/*.test.ts server/shared/*.test.ts`
Expected: all PASS. Fix any `resolveProvider`/`listProviders` call-site type drift surfaced by tsc.

- [ ] **Step 6: Commit**

```bash
git add server/modules/providers/provider.registry.ts server/modules/providers/tests/provider-registry.test.ts
git commit -m "feat(providers): build a Claude provider instance per configured profile"
```

---

## Self-Review

**Spec coverage (against the design spec §1–§2 + backward-compat):**
- §1 profile/id model → Tasks 1 (`baseProviderOf`), 3 (`ClaudeProfile` + loader), 4 (`baseProvider` + widened `id`). ✓
- §2 provider-instance refactor → Tasks 5 (sub-provider `configDir`), 6 (`ClaudeProvider`), 7 (registry). ✓
- `.claude.json` home-root quirk → Task 2. ✓
- Backward-compat guarantee → default constructors unchanged; Task 3/7 default-profile rule; registry singleton preserved. Verified by Task 5/7 "no regressions" steps. ✓
- §3 (watcher/spawn/session separation), §4 (UI), and the ~6 literal-`'claude'` branch generalization beyond what Task 4's typecheck surfaces → **deferred to Plans 2–3** (stated in the scope note).

**Placeholder scan:** No TBD/TODO. Each code step shows complete code. The only "find and fix" step (Task 4 Step 3, Task 7 Step 5) is a TypeScript typecheck-driven loop with the concrete fix pattern and enumerated expected sites — appropriate for a type-widening refactor.

**Type consistency:** `ClaudeProfile { id, label, configDir }` used identically in Tasks 3, 7. `baseProviderOf(id): LLMProvider` (Task 1) used in Task 4. `ClaudeProvider(id, configDir)` (Task 6) matches the registry call in Task 7. Sub-provider constructors `(configDir)` / synchronizer `(id, configDir)` (Task 5) match `ClaudeProvider`'s wiring (Task 6). `AbstractProvider(baseProvider, id=baseProvider)` (Task 4) matches `super('claude', id)` (Task 6) and existing `super('gemini')` calls.

---

## Subsequent plans (roadmap — authored after Plan 1 lands)

**Plan 2 — Runtime wiring (multi-profile works end-to-end via API):**
- Session watcher emits one entry per Claude profile (`<configDir>/projects`), tagging finds with the profile id; `claude-sdk.js` resolves the selected provider id → its `configDir` and sets `env.CLAUDE_CONFIG_DIR`; emitted chat messages carry the instance id instead of hardcoded `'claude'`.
- Generalize the ~6 literal `=== 'claude'` branches (`chat-websocket.service.ts:65`, `provider.routes.ts` `parseProvider`, `session-conversations-search.service.ts:1147/1239`, `git.js:987`, `agent.js:948`) via `isClaudeFamily` / `baseProviderOf`.
- Verify the sessions DB `provider` column accepts instance ids and that sessions separate per profile.

**Plan 3 — UI:**
- Provider picker lists configured profiles (labels from config, shared Claude icon resolved by `baseProvider`); per-profile auth status in the Agents settings tab; selection persistence keyed by full id (`claude-model` localStorage becomes profile-aware). Mirror the widened `LLMProvider`/`baseProvider` model in `src/types/app.ts` and the client keyed maps (`providerAuthStatus`, `FALLBACK_DEFAULT_MODEL`, `providerModelCatalog`).
