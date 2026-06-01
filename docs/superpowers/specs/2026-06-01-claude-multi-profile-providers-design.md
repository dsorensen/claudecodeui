# Multi-profile Claude via provider instances

**Date:** 2026-06-01
**Status:** Design approved, pending spec review
**Depends on:** the `CLAUDE_CONFIG_DIR` resolver (`server/shared/claude-config-dir.ts`) already landed.

## Summary

Let the app run more than one Claude account/profile at once (e.g. a personal
`~/.claude` and a `~/.claude-13layers`) by modeling each profile as an
**instance of the Claude provider**, reusing the app's existing provider axis
(registry, per-provider auth status, per-provider session tagging in the DB,
file watchers, and the provider picker) instead of building a new orthogonal
"profile" dimension.

## Goals

- Support N Claude profiles, each with its own config dir, credentials,
  sessions, MCP, skills, and login state.
- Reuse the existing provider machinery so profile separation (especially
  session storage) comes for free — no DB migration.
- Config-driven: adding a profile is a config edit, not a code change. No
  personal profile names baked into shared types.
- **Byte-identical default behavior** when no extra profiles are configured.

## Non-goals

- Changing how non-Claude providers (gemini, cursor, codex, opencode) work.
- A general "accounts" abstraction across all providers. This is scoped to the
  Claude family; other providers can adopt the same pattern later if wanted.
- Migrating existing `claude` sessions to a new id. The default profile keeps
  the bare `claude` id.

## Current architecture (relevant facts)

- `server/modules/providers/provider.registry.ts` holds
  `Record<LLMProvider, IProvider>` with one singleton per provider id; resolved
  dynamically by string via `resolveProvider(provider: string)`.
- `LLMProvider` is a **closed union** declared in two places:
  `server/shared/types.ts:68` and `src/types/app.ts:1`
  (`'claude' | 'codex' | 'gemini' | 'cursor' | 'opencode'`).
- `IProvider` (`server/shared/interfaces.ts:25`) has `readonly id: LLMProvider`
  plus six sub-providers: `models`, `mcp`, `auth`, `skills`, `sessions`,
  `sessionSynchronizer`. `ClaudeProvider` constructs each with no args and calls
  `super('claude')`.
- The Claude sub-providers read their config dir through
  `getClaudeConfigDir()` / `getClaudeJsonPath()` (already centralized).
- **Sessions are tagged by provider id in the DB**; the session watcher
  (`PROVIDER_WATCH_PATHS`) is keyed by provider; auth status is per-provider.
- The chat WebSocket already carries and validates a `provider` field
  (`chat-websocket.service.ts:65`), so the selected id already flows
  client → WS → spawn.
- Literal `'claude'` coupling is bounded: the union (2 files), the registry
  record, `parseProvider`'s allowlist (`provider.routes.ts:184`), ~6 server
  `=== 'claude'` branches, and a few client keyed maps
  (`providerAuthStatus.claude`, `FALLBACK_DEFAULT_MODEL.claude`,
  `providerModelCatalog.claude`).

## Design

### 1. Profile / provider-id model

- **Profile list** — config-driven `{ id, label, configDir }[]` for the Claude
  family, sourced from a `CLAUDE_PROFILES` env var (JSON), consistent with the
  existing `CLAUDE_CONFIG_DIR` `.env` approach. Example:

  ```
  CLAUDE_PROFILES=[
    {"id":"claude","label":"Claude — personal","configDir":"/Users/dan/.claude"},
    {"id":"claude:13layers","label":"Claude — 13 Layers","configDir":"/Users/dan/.claude-13layers"}
  ]
  ```

  The bare `claude` profile is **always present**: if `CLAUDE_PROFILES` is unset
  or omits an `id: "claude"` entry, a default `claude` profile is derived from
  `getClaudeConfigDir()` and prepended. So when unset, the list is exactly one
  default profile (current behavior).
- **Id scheme** — base provider stays `claude`. The default profile keeps the
  **bare `claude` id** (backward compatibility). Additional profiles use
  `claude:<name>` (e.g. `claude:13layers`).
- **Type model** — add `baseProvider: LLMProvider` to `IProvider`. `id` widens
  to the full instance id (string). Type-level logic (model catalog, skills/MCP
  format, icon) resolves by `baseProvider`; instance-level logic (sessions,
  auth, watcher, picker, spawn target) keys by full `id`. A small helper
  `baseProviderOf(id)` (server + client) parses `claude:foo` → `claude`.

### 2. Provider-instance refactor

- Thread an optional `configDir` into the Claude sub-providers (`auth`, `mcp`,
  `sessions`, `skills`, `sessionSynchronizer`). `getClaudeConfigDir()` /
  `getClaudeJsonPath()` become the **default** when no override is passed (so a
  single-profile setup is unchanged).
- `ClaudeProvider` constructor takes `{ id, configDir }` and forwards `configDir`
  to each sub-provider; `baseProvider` is `claude`.
- The registry builds one `ClaudeProvider` per configured profile from the
  profile list. Non-Claude providers are registered exactly as today. The
  registry record becomes keyed by `string` (instance id) rather than the
  closed union.

### 3. Session / watcher / auth / spawn wiring

- **Sessions DB** — already tagged by provider id. Default profile writes under
  `claude` (existing rows untouched); additional profiles write under their full
  id. **No schema migration.**
- **Watcher** — emit one watch entry per Claude profile
  (`<configDir>/projects`), tagging discovered sessions with that profile's id.
- **Auth status** — already per-provider; each profile reports its own
  login/credentials and is surfaced in the provider list for the picker.
- **Spawn** (`server/claude-sdk.js`) — resolve the selected provider id to its
  `configDir` and set `env.CLAUDE_CONFIG_DIR` for that run (overriding the
  inherited value). The id already arrives via the chat WebSocket.
- **Coupling touch-points** — generalize to "is this a Claude-family id?"
  (`baseProviderOf(id) === 'claude'`): `parseProvider`'s allowlist, the ~6
  server `=== 'claude'` branches, and the client keyed-map lookups (resolve the
  model catalog / default model / auth status by base provider).

### 4. UI

- The provider picker lists all configured providers, including each Claude
  profile. Labels come from the profile config (e.g. "Claude — personal",
  "Claude — 13 Layers"); all Claude profiles share the Claude icon (resolved by
  `baseProvider`).
- Selection persists per full id. Today's `claude-model` localStorage key
  becomes profile-aware (keyed by full id).
- The Agents settings tab shows per-profile auth status (resolve the keyed map
  by full id instead of literal `.claude`).

## Backward-compatibility guarantee

With no `CLAUDE_PROFILES` configured, the registry holds exactly one `claude`
provider at the resolved config dir — byte-identical to current behavior.
Existing sessions (tagged `claude`) and clients that send `provider: "claude"`
keep working unchanged. The feature is purely additive.

## Testing

- Registry builds N Claude instances from a profile config; each sub-provider
  reads its own dir (the hardened `patchHomeDir` tests already isolate the
  resolver).
- `parseProvider` / id parsing accepts Claude-family instance ids and rejects
  unknown ids.
- `baseProviderOf` parses `claude`, `claude:13layers`, and non-Claude ids.
- Spawn sets `CLAUDE_CONFIG_DIR` to the selected profile's dir.
- Session separation: sessions created under profile A do not appear under
  profile B.
- Default (no profiles configured) path resolves to a single `claude` provider.

## Risks / open questions

- Keeping `LLMProvider` exhaustiveness clean while `id` widens to instance
  strings — every exhaustive switch must key on `baseProvider`, not `id`.
  Mitigated by the `baseProviderOf` helper and `baseProvider` field.
- Model-catalog / `FALLBACK_DEFAULT_MODEL` / localStorage keys keyed by literal
  base need base-resolution on both server and client.
- Minor UX wrinkle: two "Claude" entries in the picker (handled via labels +
  shared icon).
- `CLAUDE_PROFILES` env JSON vs a dedicated JSON config file — env chosen for
  consistency with `CLAUDE_CONFIG_DIR`; revisit if the list grows unwieldy.

## Out of scope / future

- Per-profile model/skill overrides (profiles share the Claude type's catalog).
- Applying the instance pattern to other providers.
