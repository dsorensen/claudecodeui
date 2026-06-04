# Claude Multi-Profile — Plan 3: UI (Core Usability) Design

**Status:** Design approved 2026-06-03. Next step: `superpowers:writing-plans`.

**One-line goal:** Make multiple Claude profiles **selectable** and **visible** end-to-end on the current TypeScript codebase.

## Background

Plans 1 and 2 (merged) built the multi-profile **backend**: provider instances keyed by id (`claude`, `claude:work`), a `ClaudeProvider(id, configDir)`, `baseProviderOf`/`isClaudeFamily` (`server/shared/provider-id.ts`), per-profile session watching/indexing, and family-aware dispatch. Crucially, Plan 2 already wired the backend to **consume** a forwarded instance id (spawn the right `CLAUDE_CONFIG_DIR`) and to **store** sessions keyed by that id (DB `provider` column holds `claude:work`).

What is missing is the UI/API layer that lets a human **produce** that id (pick a profile) and **see** the sessions it creates. Today:

- `src/types/app.ts` defines `LLMProvider` as a hardcoded 5-value union of **base** providers; icon/model/auth maps key off it.
- **No HTTP endpoint exposes the profile list** to the frontend — profiles only exist server-side.
- The provider picker (`ProviderSelectionEmptyState.tsx`) hardcodes 5 base providers; selection persists as `localStorage['selected-provider']` (a base name).
- **Issue 1** (deferred from Plan 2): `bucketSessionRowsByProvider` (`server/modules/projects/services/projects-with-sessions-fetch.service.ts`) buckets DB rows into a fixed base-provider record, so a `claude:work` row hits `if (!bucket) continue;` and is **silently dropped** from `getProjectsWithSessions` and the watcher's `projects_updated` broadcast. With multiple profiles, a non-default profile's sessions are indexed but invisible. The default single-`claude` path is unaffected.

## Scope

**In scope (core usability):**

1. Backend endpoint exposing configured Claude profiles.
2. Issue 1 fix: profile sessions visible in the sidebar, carrying their instance id.
3. Additive frontend type model for instance ids.
4. Profile picker (one command-group per profile) + profile-aware model persistence + instance-id-keyed `selected-provider`.
5. Resume-under-correct-profile (clicking a `claude:work` session resumes under that profile).
6. Per-session profile **badge** in the sidebar.

**Out of scope — deferred to a future Plan 4** (decided during brainstorming):

- Per-profile **auth status** cards in the Agents settings tab.
- Un-collapsing the general internal/frontend APIs: `sessions.service.listProviderIds()`, `sessions.service.listArchivedSessions` provider field, `mcp.service.addMcpServerToAllProviders` results. (Plan 3 adds a *dedicated* profiles endpoint instead of widening these, keeping blast radius small.)

## Key design decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Sidebar display of profile sessions | **Merge + profile badge** | All Claude sessions stay in the one Claude list (fixed 5-array `Project` shape preserved); a small label badge marks non-default-profile sessions, shown **only when >1 Claude profile is configured**. Distinguishes accounts without restructuring the sidebar. |
| Frontend type representation of instance ids | **Additive `ProviderInstanceId`** | Keep `LLMProvider` (5 base names) as the key for icon/model/auth maps. Add `ProviderInstanceId = LLMProvider \| ` `` `claude:${string}` `` used only at boundaries that carry an id. A frontend `baseProviderOf(id)` resolves type-level concerns by base — mirrors `server/shared/provider-id.ts`. Most surgical. |
| Picker shape | **One command-group per profile** | The picker is already a `Command` palette where each provider is a `CommandGroup`. Expanding Claude into one group per profile is the idiomatic, minimal fit. |
| Model persistence | Default profile keeps `localStorage['claude-model']`; non-default uses `claude-model:<id>` | Back-compat for existing users; only the Claude branch of model persistence changes. |

## Architecture — the instance-id "spine"

A single string — the **provider instance id** (`'claude'`, `'claude:work'`) — flows along one path:

```
profiles API ─▶ picker (sets selected-provider = instance id)
            └─▶ chat websocket forward ─▶ [Plan 2 backend: spawns right configDir, stores session as claude:work]
                                       └─▶ session row.provider = 'claude:work'
                                            └─▶ bucketSessionRowsByProvider (keep in `claude` array, carry id)
                                                 └─▶ sidebar: render + badge + resume with that id
```

`LLMProvider` remains the type key for icon/model/auth; `baseProviderOf(instanceId)` bridges the spine back to those maps.

## Components & changes

### Backend

**B1. Profiles endpoint.** `GET /api/providers/claude/profiles` → `[{ id: string; label: string; isDefault: boolean }]`, sourced from `loadClaudeProfiles()`. `isDefault` is `id === 'claude'`. **Never returns `configDir`** (server path). This is the only new server surface.

**B2. Issue 1 fix.** In `bucketSessionRowsByProvider`, choose the bucket via `baseProviderOf(row.provider)` instead of the raw `row.provider`, so `claude:work` lands in the `claude` array. Wrap in a guard so a genuinely-unknown base (`baseProviderOf` throws) still drops the row (preserving current behavior for junk rows). **Add an instance-id field** (e.g. `providerInstanceId: string`) to `SessionSummary`, populated from `row.provider` in `mapSessionRowToSummary`, so the id survives into the frontend for badge + resume. Non-Claude rows are unaffected (their `providerInstanceId` equals the base).

### Frontend

**F1. Types + helper.** Add `ProviderInstanceId` to `src/types/app.ts`; change `ProjectSession.__provider` to `ProviderInstanceId`. Add a frontend `baseProviderOf(id): LLMProvider` / `isClaudeFamily(id)` helper (small module mirroring the backend). `SessionProviderLogo` resolves its logo by `baseProviderOf(provider)` (it already falls back to the Claude logo for unknown strings, so this is a correctness hardening, not a bug fix).

**F2. `useClaudeProfiles()` hook.** Fetches `GET /api/providers/claude/profiles` once (cached), returns `{ profiles, byId, isMultiProfile }`. On error, falls back to a single default `{ id:'claude', label:'Claude', isDefault:true }` so the picker still works.

**F3. Picker.** In `ProviderSelectionEmptyState.tsx` (and the active-session model selector if a separate one exists), build the Claude `CommandGroup`s dynamically from `useClaudeProfiles()` — one group per profile, headed by its label; the other four providers are unchanged. Selecting a model sets `provider = profile.id` (instance id) + the model, and persists `selected-provider = profile.id`. Provider state (`useChatProviderState`) widens `provider` to `ProviderInstanceId`; on load the stored value is validated against available profiles, falling back to `'claude'`. **Model persistence:** default profile → `claude-model`; non-default → `claude-model:<id>`.

**F4. Resume correctness.** Replace the hardcoded `__provider: 'claude'` constants (`src/hooks/useProjectsState.ts` session-selection branches; `src/components/sidebar/utils/utils.ts:126`) with the session's real instance id (`session.providerInstanceId ?? 'claude'`), so selecting a `claude:work` session sets `provider = 'claude:work'` and the next message/resume forwards the correct id. Non-Claude provider constants are left as-is.

**F5. Sidebar badge.** `SidebarFlatSessionItem` and `SidebarSessionItem` render a small label badge (the profile's `label`) **iff** the session's instance id is a non-default Claude profile **and** `isMultiProfile` is true. id→label and the multi-profile flag come from `useClaudeProfiles()`, threaded through the sidebar props the same way other session-row data is.

## Data flow (end to end)

1. App load → `useClaudeProfiles()` fetches the profiles endpoint.
2. Picker renders one Claude group per profile → user picks a model under "Claude · work" → `provider = 'claude:work'`, persisted; model persisted under `claude-model:claude:work`.
3. Send → chat websocket `claude-command` with the instance id in `options.provider` → backend (Plan 2) resolves configDir, spawns, stores session as `claude:work`.
4. Sessions list → `bucketSessionRowsByProvider` keeps the `claude:work` row in the `claude` array with `providerInstanceId` set → frontend session gets `__provider = 'claude:work'`.
5. Sidebar shows the session in the Claude list, badged "work" (because >1 profile).
6. Click the session → `__provider = 'claude:work'` becomes the active provider → resume forwards `claude:work` → backend resumes under the right configDir.

## Error handling

- Profiles endpoint failure → single default `claude` profile (picker still works, no badges).
- Stored `selected-provider` references a removed profile → fall back to `'claude'`.
- Stored model not in the catalog → provider default model (existing behavior).
- Missing profile label for a session's id → no badge (do not crash).
- Unknown provider base in a DB row → still dropped (B2 guard), as today.

## Testing

- **Backend (TDD):** a failing test asserting a `claude:work` row is currently dropped by `bucketSessionRowsByProvider` → apply B2 → row lands in the `claude` array with `providerInstanceId` preserved; non-Claude rows unaffected; an unknown-base row still dropped. Endpoint test: returns configured profiles with `isDefault`, never `configDir`.
- **Frontend (`node:test` via tsx):** `baseProviderOf`/`isClaudeFamily`; profile-aware model-key derivation (`claude` → `claude-model`, `claude:work` → `claude-model:claude:work`); badge-visibility predicate (`isClaudeNonDefault(id) && isMultiProfile`).
- **Manual:** set `CLAUDE_PROFILES` with two profiles → picker shows both groups → start a session under each → both visible in the sidebar, the non-default badged → click each resumes under the correct profile.

## Task decomposition (preview for writing-plans)

1. Backend profiles endpoint (+ test).
2. Issue 1 bucket fix + `SessionSummary.providerInstanceId` (+ TDD test).
3. Frontend types + `baseProviderOf` helper + `SessionProviderLogo` base resolution (+ test).
4. `useClaudeProfiles()` hook.
5. Picker expansion + `selected-provider`/model persistence (profile-aware).
6. Resume-provider derivation (replace hardcoded `__provider` constants).
7. Sidebar profile badge (both session-item components).
8. Manual verification.

Tasks 1 and 2 are backend and independent of each other. Task 3 is the frontend foundation that 4–7 depend on. 5 depends on 3+4; 6 depends on 3 (and B2's `providerInstanceId`); 7 depends on 3+4. Execution order: 1, 2, 3, 4, then 5/6/7, then 8.

## Non-goals / explicitly preserved

- The fixed 5-array `Project`/`SessionsByProvider` shape is **unchanged** (merge strategy, not separate buckets).
- The default single-profile experience is byte-for-byte unchanged (no badge, `claude-model` key, `selected-provider = 'claude'`).
- The four non-Claude providers are untouched beyond compiling against the widened `__provider` type.
