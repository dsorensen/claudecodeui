# Upgrade to Upstream v1.34.0 (preserving multi-Claude) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring this fork fully up to `siteboon/claudecodeui` v1.34.0 via a real merge, keeping the multi-Claude-profile system, DEV-56 (reconnect replay), DEV-57 (cross-mode lock), Claude-OAuth-preference, and the sidebar work intact — and establish a cadence so we stop lagging.

**Architecture:** One real `git merge upstream/main` on a branch (so future merges have clean ancestry), with conflict resolution scoped to two well-understood zones: **Zone A — provider / multi-Claude code** (resolve in favor of our architecture, layer upstream's non-conflicting fixes on top) and **Zone B — thinking-mode UI** (a deliberate keep-vs-drop decision). All ~150 other upstream files (i18n locales, notification utils, etc.) merge clean. Three decisions are pre-made by the repo owner: adopt **dynamic model loading**, keep **multi-Claude**, and the thinking-mode call is flagged in Task 4.

**Tech Stack:** Node/Express + TypeScript server (`tsc` → `dist-server`), React/Vite client, `@anthropic-ai/claude-agent-sdk`, `node:test` for unit tests, husky hooks.

---

## Conflict surface (measured, not guessed)

Merge base: `1e125f3` (2026-05-31). `git merge-tree` against `upstream/main` (v1.34.0) reports **13 content conflicts + 3 upstream deletions**. Everything else merges clean.

**Zone A — provider / multi-Claude (our crown jewels):**
- `server/claude-sdk.js` — our DEV-56 replay buffer + `markSessionCompleted` grace, DEV-57 cross-mode refuse, per-profile `configDir` spawn, Fable comment
- `server/modules/providers/list/claude/claude-models.provider.ts` — our OPTIONS list + Fable/opus[1m]
- `server/modules/providers/list/claude/claude-auth.provider.ts` — our "prefer Claude OAuth over env API key" (02332fb)
- `server/shared/types.ts` — our `ProviderInstanceId` widening + `baseProviderOf`
- `server/modules/websocket/services/shell-websocket.service.ts` — DEV-57 ownership logic
- `server/routes/agent.js`, `server/routes/commands.js`, `server/index.js`, `server/cli.js` — overlap from PRs we cherry-picked independently
- `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx` — our per-profile model picker

**Zone B — thinking mode (our feature vs upstream removal):**
- `src/components/chat/constants/thinkingModes.ts` *(upstream DELETED)*
- `src/components/chat/view/subcomponents/ThinkingModeSelector.tsx` *(upstream DELETED)*
- `src/components/chat/view/subcomponents/ChatComposer.tsx`
- `src/components/chat/hooks/useChatComposerState.ts`
- `src/components/chat/view/ChatInterface.tsx`

**Upstream deletion, not thinking-related:**
- `public/modelConstants.js` *(upstream DELETED — superseded by dynamic loading)*

**Merges clean (no action beyond accepting them):** all `src/i18n/locales/**` (incl. new `zh-TW`), `src/utils/notificationSound.ts`, `src/utils/pageTitleNotification.ts`, `src/components/chat/hooks/useChatRealtimeHandlers.ts` (the completion-notification hook), settings notification tab, prism plugin, shell button additions, sandbox SIGHUP fix, editor toolbar fix.

---

## Pre-merge decisions (locked)

1. **Multi-Claude:** preserve entirely. Every Zone A conflict resolves to *keep our architecture, add upstream's orthogonal fixes*.
2. **Dynamic model loading:** ADOPT upstream `cdcac18`. Note: v1.34.0 still returns `CLAUDE_FALLBACK_MODELS` from `getSupportedModels()` (live `supportedModels()` is commented out because it spawns a stray jsonl session). So "dynamic" here means *drop the 3-day disk cache and read the provider every time* — the fallback catalog stays the source of truth, so our Fable/opus[1m] entries remain necessary.
3. **Completion notification (upstream `d70dc07`):** ADOPT — it's a sound + tab-title cue, orthogonal to DEV-56, and merges clean.
4. **Thinking mode:** decided in **Task 4** (default = KEEP ours).

---

### Task 0: Safety net & green baseline

**Files:** none (git + verification only)

- [ ] **Step 1: Confirm clean tree on `main`**

Run: `git status -s`
Expected: only `?? .linear-issue` (untracked, ignore). If anything else is dirty, stop and stash.

- [ ] **Step 2: Record the green baseline**

Run:
```bash
npm run typecheck && npm test 2>&1 | tail -20 && npm run build 2>&1 | tail -5
```
Expected: typecheck exit 0, tests pass, build succeeds. Write the test pass-count down — this is the number Task 6 must match or beat.

- [ ] **Step 3: Create the merge branch + a rollback tag**

```bash
git tag pre-1.34-merge
git switch -c chore/merge-upstream-1.34
git fetch upstream --tags
```
Expected: on `chore/merge-upstream-1.34`; `git tag` shows `pre-1.34-merge`. Rollback at any point: `git merge --abort` (mid-merge) or `git reset --hard pre-1.34-merge`.

---

### Task 1: Start the merge, land the clean files

**Files:** whole tree (merge in progress)

- [ ] **Step 1: Begin the merge without committing**

Run: `git merge --no-commit --no-ff upstream/main`
Expected: exits non-zero with "Automatic merge failed; fix conflicts". This is correct.

- [ ] **Step 2: Confirm the conflict set matches this plan**

Run: `git diff --name-only --diff-filter=U` and `git status -s | grep -E '^(DU|UD|AA|UU)'`
Expected: the 13 Zone A/B files as `UU`, and `thinkingModes.ts` / `ThinkingModeSelector.tsx` / `public/modelConstants.js` as `UD` (deleted by them). If the set differs materially, upstream moved since this plan was written — re-run the merge-tree analysis before continuing.

- [ ] **Step 3: Sanity-check that clean files staged**

Run: `git diff --cached --name-only | grep -E 'i18n/locales/zh-TW|notificationSound|pageTitleNotification|useChatRealtimeHandlers' | head`
Expected: these appear (auto-merged, staged). Do NOT commit yet.

---

### Task 2: Resolve Zone A — provider / multi-Claude

**Files (Modify, conflicted):** `server/shared/types.ts`, `server/modules/providers/list/claude/claude-models.provider.ts`, `server/modules/providers/list/claude/claude-auth.provider.ts`, `server/claude-sdk.js`, `server/modules/websocket/services/shell-websocket.service.ts`, `server/routes/agent.js`, `server/routes/commands.js`, `server/index.js`, `server/cli.js`, `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx`

**Resolution rule for the whole zone:** keep OUR semantics for anything touching profiles / provider-instance ids / DEV-56 / DEV-57 / OAuth-preference; ACCEPT upstream's additions that are orthogonal (new model fields, cache-token accounting, tool-result-error surfacing, shell buttons, heartbeat). When in doubt, our behavior wins and upstream's addition gets layered in by hand.

- [ ] **Step 1: `server/shared/types.ts`** — open the conflict. Keep our `ProviderInstanceId` / widened `LLMProvider` / `baseProviderOf` additions; append any new upstream type members. Remove conflict markers.

Verify shape: `git grep -n "ProviderInstanceId\|baseProviderOf" server/shared/types.ts` still present.

- [ ] **Step 2: `claude-models.provider.ts`** — keep our `CLAUDE_FALLBACK_MODELS.OPTIONS` (must retain `fable` and `opus[1m]`); take upstream's surrounding provider plumbing changes from `cdcac18` (the dynamic-loading hooks). Leave the commented-out live-`supportedModels()` block as-is.

Verify: `git grep -n "value: 'fable'\|value: 'opus\[1m\]'" server/modules/providers/list/claude/claude-models.provider.ts` → both present.

- [ ] **Step 3: `claude-auth.provider.ts`** — keep our OAuth-over-API-key preference (commit 02332fb). Layer in upstream's "recognize claude auth token env" + any redaction. Resolve markers.

Verify: the function that prefers OAuth before `ANTHROPIC_API_KEY` is intact (`git grep -ni "oauth" server/modules/providers/list/claude/claude-auth.provider.ts`).

- [ ] **Step 4: `server/claude-sdk.js`** — the big one. KEEP: the WebSocketWriter replay buffer + `markSessionCompleted` 5-minute grace (DEV-56), the cross-mode refuse (DEV-57), per-profile `configDir` spawn, and the `// Valid models: … fable` comment. ACCEPT upstream's additive bits: include-cache-tokens-in-usage and show-tool-result-errors. Resolve every marker; do not drop a DEV-56/57 hunk to take an upstream hunk — merge both.

Verify: `git grep -n "markSessionCompleted\|replay\|getClaudeProfileConfigDir" server/claude-sdk.js` all present.

- [ ] **Step 5: `shell-websocket.service.ts`** — keep DEV-57 ownership/refuse logic; accept upstream's shell disconnect/restart button wiring + heartbeat if present in this file. Resolve markers.

- [ ] **Step 6: `agent.js`, `commands.js`, `index.js`, `cli.js`** — these conflict because we cherry-picked the same upstream PRs independently. For each hunk: if upstream's version equals our cherry-pick, take upstream's (`theirs`); where our profile/opencode wiring diverges, keep ours. Resolve markers file by file.

- [ ] **Step 7: `ProviderSelectionEmptyState.tsx`** — keep our per-profile Claude picker (groups by profile instance id); accept upstream styling/copy. Resolve markers.

- [ ] **Step 8: Typecheck Zone A before moving on**

Run: `npm run typecheck 2>&1 | tail -20`
Expected: exit 0. Fix any type breakage from the merge here, not later.

- [ ] **Step 9: Stage the resolved Zone A files**

```bash
git add server/shared/types.ts server/modules/providers/list/claude/claude-models.provider.ts \
  server/modules/providers/list/claude/claude-auth.provider.ts server/claude-sdk.js \
  server/modules/websocket/services/shell-websocket.service.ts server/routes/agent.js \
  server/routes/commands.js server/index.js server/cli.js \
  src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx
```

---

### Task 3: Adopt dynamic model loading + drop `modelConstants.js`

**Files:** `server/modules/providers/services/provider-models.service.ts` (auto-merged or take upstream), `public/modelConstants.js` (Modify→delete)

- [ ] **Step 1: Take upstream's `provider-models.service.ts`** (route through provider every request, no 3-day cache) — if it conflicted, resolve to upstream's version; if it auto-merged, confirm it contains the no-cache path.

Verify: `git show upstream/main:server/modules/providers/services/provider-models.service.ts | grep -n "cache" | head` — confirm the changed cache behavior is what's in your tree.

- [ ] **Step 2: Honor the `public/modelConstants.js` deletion**

Run: `git rm public/modelConstants.js`
Expected: staged for deletion. (Confirm nothing in OUR code still imports it: `git grep -n "modelConstants" src server` → if hits remain in our files, repoint them to the provider service instead, then `git add` those.)

- [ ] **Step 3: Re-run the provider-models test**

Run: `npx tsx --test server/modules/providers/tests/provider-models.service.test.ts`
Expected: pass.

---

### Task 4: DECISION — thinking mode (keep ours vs adopt removal)

> **Why upstream removed it:** the removed selector only prepended the legacy keyword tiers `think` / `think hard` / `think harder` / `ultrathink` to the prompt. Those keywords map to extended-thinking token budgets; with current models the SDK enables extended thinking by default, so the dedicated UI became redundant. We *extended* this feature (`c183434`, thinking mode for all Claude profiles), so removing it would delete our work.

**Default path = KEEP OURS.** (To instead adopt removal, see Step ALT.)

**Files:** `src/components/chat/constants/thinkingModes.ts`, `src/components/chat/view/subcomponents/ThinkingModeSelector.tsx`, `src/components/chat/view/subcomponents/ChatComposer.tsx`, `src/components/chat/hooks/useChatComposerState.ts`, `src/components/chat/view/ChatInterface.tsx`

- [ ] **Step 1 (KEEP): restore the two files upstream deleted**

```bash
git checkout --ours src/components/chat/constants/thinkingModes.ts \
  src/components/chat/view/subcomponents/ThinkingModeSelector.tsx
git add src/components/chat/constants/thinkingModes.ts \
  src/components/chat/view/subcomponents/ThinkingModeSelector.tsx
```

- [ ] **Step 2 (KEEP): resolve the three composer files** — in `ChatComposer.tsx`, `useChatComposerState.ts`, `ChatInterface.tsx`, keep OUR thinking-mode wiring (selector render, composer state field, prompt-prefix). Accept any upstream composer changes that are *not* the thinking-removal hunks. Resolve markers, then `git add` the three files.

Verify: `git grep -n "ThinkingModeSelector\|thinkingMode" src/components/chat` → still wired.

- [ ] **Step ALT (only if adopting removal instead):**
```bash
git rm src/components/chat/constants/thinkingModes.ts \
  src/components/chat/view/subcomponents/ThinkingModeSelector.tsx
git checkout --theirs src/components/chat/view/subcomponents/ChatComposer.tsx \
  src/components/chat/hooks/useChatComposerState.ts src/components/chat/view/ChatInterface.tsx
git add src/components/chat/view/subcomponents/ChatComposer.tsx \
  src/components/chat/hooks/useChatComposerState.ts src/components/chat/view/ChatInterface.tsx
```
Then drop the related `chat.json` i18n keys if they cause unused-key lint.

- [ ] **Step 3: Typecheck the chat module**

Run: `npm run typecheck 2>&1 | tail -20`
Expected: exit 0.

---

### Task 5: Confirm the free wins landed (completion notification)

**Files:** `src/components/chat/hooks/useChatRealtimeHandlers.ts`, `src/utils/notificationSound.ts`, `src/utils/pageTitleNotification.ts`, settings notification tab (all auto-merged)

- [ ] **Step 1: Confirm the notification feature is present and coexists with DEV-56**

Run: `git grep -n "notificationSound\|pageTitleNotification" src/components/chat/hooks/useChatRealtimeHandlers.ts`
Expected: present. This is upstream's "ping when a run finishes" — independent of our DEV-56 reconnect-replay (server-side). Both stay.

---

### Task 6: Complete the merge & full verification

**Files:** version bump in `package.json`

- [ ] **Step 1: Ensure no conflict markers remain**

Run: `git grep -nE '^<{7}|^={7}$|^>{7}' -- . ':!docs' || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 2: Bump version to match upstream**

Edit `package.json` `"version"` → `"1.34.0"`, then `git add package.json`.

- [ ] **Step 3: Full verification gauntlet**

Run:
```bash
npm run typecheck && npm test 2>&1 | tail -25 && npm run build 2>&1 | tail -5
```
Expected: typecheck exit 0; test pass-count ≥ the Task 0 baseline; build (client + server) succeeds.

- [ ] **Step 4: Commit the merge**

```bash
git commit --no-edit   # or write a summary listing kept features + adopted upstream items
```

- [ ] **Step 5: Live smoke test** — restart the server in the tmux pane and verify by hand:

```bash
tmux send-keys -t 'claudecodeui/2:2.1' C-c
tmux send-keys -t 'claudecodeui/2:2.1' 'npm run server' Enter
```
Then hard-refresh the app and confirm, one by one:
  - New-chat model picker lists **Fable, Default, Sonnet, Sonnet 1M, Opus 4.8 1M, Haiku**.
  - Both Claude profiles (Personal, 13 Layers) still appear (multi-Claude intact).
  - Thinking-mode selector still present (if KEEP) / gone (if ALT).
  - A finishing run plays the completion sound / sets the tab-title marker.
  - DEV-56: drop the socket mid-run (refresh) → UI recovers, no stuck "Processing".
  - DEV-57: opening the same session in shell while chat owns it is refused.

- [ ] **Step 6: Merge to `main` and push**

```bash
git switch main && git merge --ff-only chore/merge-upstream-1.34 && git push origin main
```
Expected: fast-forward, push succeeds. If `--ff-only` fails (main moved), rebase the branch or merge normally.

---

### Task 7: Stop lagging — establish a cadence

**Files:** this doc (append a "divergence ledger")

- [ ] **Step 1: Record the intentional divergences** so the next merge knows the resolution up front. Append to this file:
  - KEEP-OURS zones: multi-Claude provider stack, DEV-56, DEV-57, Claude-OAuth-preference, sidebar recency view, thinking-mode (if kept).
  - These are *expected* conflict points on every future `git merge upstream/main`.

- [ ] **Step 2: Switch from cherry-picking to merging.** Most of this merge's pain came from having independently cherry-picked ~10 upstream PRs (#617, #719, #762, #781, #782, #793, #804, #806, #807, #808), which then re-conflicted. Going forward, pull upstream via `git fetch upstream && git merge upstream/main` on a cadence (e.g. monthly or per upstream minor) instead of cherry-picking individual PRs.

- [ ] **Step 3: Commit the ledger.** `git add docs/superpowers/plans/2026-06-10-upgrade-to-upstream-1.34.md && git commit -m "docs: record 1.34 merge divergence ledger + cadence"`

---

## Self-review notes

- **Coverage:** Zone A (multi-Claude preservation) → Task 2; Zone B (thinking) → Task 4; dynamic loading → Task 3; completion notification → Task 5; version/verify → Task 6; cadence → Task 7. The three deletions (`thinkingModes.ts`, `ThinkingModeSelector.tsx`, `public/modelConstants.js`) are each explicitly handled.
- **Risk hotspot:** `server/claude-sdk.js` carries DEV-56 + DEV-57 + profiles + Fable simultaneously — resolve it slowly (Task 2 Step 4), never blanket-take one side.
- **Rollback:** `git merge --abort` mid-merge, or `git reset --hard pre-1.34-merge` after. The `pre-1.34-merge` tag is the escape hatch.

---

## Divergence Ledger (executed 2026-06-10)

**Result:** merged `upstream/main` @ `6a53c31` (v1.34.0) into `chore/merge-upstream-1.34`; merge commit `d052e1f` (parents `546ac08` + `6a53c31`). Rollback tag `pre-1.34-merge`. Verified: typecheck clean · **228/228 tests pass** (baseline 225 + 2 new OAuth tests + 1 upstream) · build succeeds.

**Actual conflict surface (differed from the pre-merge estimate — upstream had advanced past the SHAs the plan was written against):**
- The plan predicted 13 content conflicts; the real merge produced **only 4**: `server/shared/types.ts`, `server/modules/providers/list/claude/claude-models.provider.ts`, `server/modules/providers/list/claude/claude-auth.provider.ts`, `src/components/chat/view/subcomponents/ChatComposer.tsx`.
- **`server/claude-sdk.js` auto-merged cleanly** (the plan's #1 risk file), as did `shell-websocket.service.ts`, the route files, `ChatInterface.tsx`, `useChatComposerState.ts`, `ProviderSelectionEmptyState.tsx`, and `provider-models.service.ts`. Each was audited post-merge by feature fingerprint (DEV-56/57, multi-Claude, OAuth, dynamic loading) and by the full test suite — all intact.
- The 3 upstream deletions applied as clean removals (not modify/delete conflicts): `public/modelConstants.js`, `thinkingModes.ts`, `ThinkingModeSelector.tsx`.

**KEEP-OURS zones — expected to re-conflict on every future `git merge upstream/main`:**
- Multi-Claude provider stack (`ClaudeProfile`, per-profile `configDir`, per-profile model picker).
- DEV-56 (reconnect replay buffer + completion grace, `server/claude-sdk.js` + `websocket-writer.service.ts`).
- DEV-57 (cross-mode chat/shell session lock, `shell-websocket.service.ts` + `claude-sdk.js`).
- Claude OAuth-over-API-key precedence (`resolveClaudeAuthStatus`). NOTE: extended this merge to also recognize `process.env.ANTHROPIC_AUTH_TOKEN` (upstream parity), still OAuth-first.
- Fable 5 + Opus 4.8 (1M) catalog entries in `claude-models.provider.ts`.
- Sidebar recency/filter work.

**Resolved DIVERGENCES adopted FROM upstream (no longer ours to defend):**
- **Thinking-mode selector: DROPPED.** The plan defaulted to KEEP, but upstream refactored the entire composer onto the `PromptInput` family and deleted the selector; KEEP would have meant fragile reconstruction that re-conflicts on every composer merge. Repo owner confirmed DROP. **Future merges should NOT expect thinking-mode files to exist** — do not restore them. (One harmless orphaned i18n key `thinkingMode` remains in upstream's `zh-TW/chat.json`.)
- **Dynamic model loading** (no 3-day disk cache for `claude`) and the **run-completion notification** (sound + tab-title cue) are now upstream-aligned; the notification is orthogonal to DEV-56 and both coexist.

**Cadence (the actual fix for "lagging behind"):** stop cherry-picking individual upstream PRs (that produced ~10 of this round's re-conflicts). Going forward: `git fetch upstream && git merge upstream/main` on a cadence (monthly or per upstream minor). This merge established clean ancestry, so the next merge starts from `d052e1f` as the new base.
