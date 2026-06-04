# Sidebar Recency-Ordered Session View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement the "flat recency-ordered session view" (a sidebar toggle that flattens every session across all projects into one list sorted by most-recent activity) onto the rewritten TypeScript codebase, on branch `feat/sidebar-recency`.

**Architecture:** Pure client-side feature. A boolean UI preference (`flatSessionView`) stored in the existing `useUiPreferences` localStorage store drives a segmented "Grouped / Recent" toggle in the sidebar header. When on, `SidebarContent` renders a new `SidebarFlatSessionList` (built from new pure utils that flatten + sort + filter sessions across projects) instead of the project tree. The 965-line `useSidebarController` is **not** modified — all derivation happens in `Sidebar.tsx` + `utils.ts`, which already have every input needed.

**Tech Stack:** React 18 + TypeScript, Vite 7, Tailwind, i18next, lucide-react. Tests via `node:test` run through `tsx` (no frontend test runner exists). Verify with `npm run typecheck`, `npm run lint`, and manual driving at `http://localhost:5173`.

---

## Context & ground rules

- **Branch:** all work happens on `feat/sidebar-recency` (already created at upstream `1e125f3`). Confirm with `git branch --show-current` before starting.
- **This is a PORT, not a paste.** The original feature (commit `bb3724c` on `feat/sidebar-flat-view`) was written against the OLD architecture and will NOT compile here. Key differences already accounted for in this plan:
  - Projects are keyed by `project.projectId` (DB id), **not** `project.name`. Sessions carry `__projectId`, **not** `__projectName`.
  - `getAllSessions(project)` takes **one** argument (no `additionalSessions`).
  - There is a 5th provider: `opencode`.
  - `getSessionDate` is provider-agnostic (`lastActivity` → `createdAt`).
  - Persistence uses the boolean `useUiPreferences` store, **not** a `claude-settings` enum.
- **Sandbox note (this machine):** `tsx`-based commands (the `node:test` runner) fail under the Bash sandbox with `EPERM … .pipe`. Run test commands with the sandbox disabled (or in your own terminal). `tsc`/`eslint` are generally fine sandboxed; if they EPERM, disable the sandbox too.
- **Commits:** the repo enforces Conventional Commits (commitlint) and runs `eslint` on staged files via husky + lint-staged. Keep messages in `type(scope): subject` form.

## File Structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `src/hooks/useUiPreferences.ts` | Modify | Add boolean `flatSessionView` preference (type + default). |
| `src/components/sidebar/utils/utils.ts` | Modify | Add pure `getAllSessionsAcrossProjects` + `filterFlatSessions`; relocate `formatCompactSessionAge` here (shared). |
| `src/components/sidebar/utils/flatSessions.test.ts` | Create | `node:test` unit tests for the two new pure functions. |
| `src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx` | Modify | Import `formatCompactSessionAge` from utils instead of defining it locally. |
| `src/i18n/locales/en/sidebar.json` (+ 7 locales) | Modify | New `viewMode.*` + `sessions.*` strings. |
| `src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx` | Create | One flat session card (provider logo, title, project subheading, age, msg count, rename/delete). |
| `src/components/sidebar/view/subcomponents/SidebarFlatSessionList.tsx` | Create | The flat list container: empty/loading states, maps sessions to items, footer note. |
| `src/components/sidebar/view/subcomponents/SidebarHeader.tsx` | Modify | Add the Grouped/Recent segmented toggle (+ 2 props). |
| `src/components/sidebar/view/subcomponents/SidebarContent.tsx` | Modify | Accept toggle props + `flatListProps`; thread to header; add render branch. |
| `src/components/sidebar/view/Sidebar.tsx` | Modify | Read the preference, derive flat sessions, build `flatListProps`, pass everything down. |

---

## Task 1: Add the `flatSessionView` UI preference

**Files:**
- Modify: `src/hooks/useUiPreferences.ts:3-10` (type), `:35-42` (defaults)

The store auto-derives `PREFERENCE_KEYS`/`VALID_KEYS` from `DEFAULTS`, so adding one boolean field is all that's needed; it becomes cross-tab synced for free.

- [ ] **Step 1: Add the field to the `UiPreferences` type**

In `src/hooks/useUiPreferences.ts`, change the type (lines 3-10) to add `flatSessionView`:

```ts
type UiPreferences = {
  autoExpandTools: boolean;
  showRawParameters: boolean;
  showThinking: boolean;
  autoScrollToBottom: boolean;
  sendByCtrlEnter: boolean;
  sidebarVisible: boolean;
  flatSessionView: boolean;
};
```

- [ ] **Step 2: Add its default**

Change the `DEFAULTS` object (lines 35-42) to:

```ts
const DEFAULTS: UiPreferences = {
  autoExpandTools: false,
  showRawParameters: false,
  showThinking: true,
  autoScrollToBottom: true,
  sendByCtrlEnter: false,
  sidebarVisible: true,
  flatSessionView: false,
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). This file is self-contained; nothing consumes the new key yet.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUiPreferences.ts
git commit -m "feat(sidebar): add flatSessionView UI preference

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure flat-view logic + tests (the recency core)

**Files:**
- Modify: `src/components/sidebar/utils/utils.ts` (add 2 functions; relocate `formatCompactSessionAge`)
- Modify: `src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx:2-10,34-60,81` (import relocated helper)
- Test: `src/components/sidebar/utils/flatSessions.test.ts` (create)

This is the only genuinely unit-testable part (pure functions), so it gets real TDD.

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/utils/flatSessions.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';

import type { Project } from '../../../types/app';
import { filterFlatSessions, getAllSessionsAcrossProjects } from './utils';

// Minimal i18n stub: returns the key unchanged.
const t = ((key: string) => key) as unknown as TFunction;

const makeProject = (
  projectId: string,
  displayName: string,
  sessions: Array<Record<string, unknown>>,
): Project =>
  ({
    projectId,
    displayName,
    fullPath: `/tmp/${projectId}`,
    sessions,
  }) as unknown as Project;

test('getAllSessionsAcrossProjects flattens, sorts by recency desc, tags __projectId', () => {
  const projects = [
    makeProject('p1', 'Alpha', [{ id: 's-old', lastActivity: '2026-01-01T10:00:00Z' }]),
    makeProject('p2', 'Beta', [{ id: 's-new', lastActivity: '2026-01-02T10:00:00Z' }]),
  ];

  const result = getAllSessionsAcrossProjects(projects);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 's-new', 'most recent session is first');
  assert.equal(result[0].__projectId, 'p2', 'session tagged with its project id');
  assert.equal(result[0].__provider, 'claude', 'claude sessions get the claude provider tag');
  assert.equal(result[1].id, 's-old');
});

test('filterFlatSessions matches session title OR project display name; empty query returns all', () => {
  const projects = [makeProject('p1', 'Alpha', []), makeProject('p2', 'Beta', [])];
  const sessions = [
    { id: 's1', summary: 'fix login bug', __provider: 'claude', __projectId: 'p1' },
    { id: 's2', summary: 'unrelated work', __provider: 'claude', __projectId: 'p2' },
  ] as unknown as ReturnType<typeof getAllSessionsAcrossProjects>;

  assert.equal(filterFlatSessions(sessions, projects, '', t).length, 2, 'empty query returns all');
  assert.equal(filterFlatSessions(sessions, projects, 'login', t).length, 1, 'matches session title');
  assert.equal(
    filterFlatSessions(sessions, projects, 'beta', t)[0]?.id,
    's2',
    'matches parent project display name',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (sandbox disabled): `npx tsx --test src/components/sidebar/utils/flatSessions.test.ts`
Expected: FAIL — `getAllSessionsAcrossProjects`/`filterFlatSessions` are not exported from `./utils` (import error / not a function).

- [ ] **Step 3: Relocate `formatCompactSessionAge` into utils**

In `src/components/sidebar/utils/utils.ts`, add this exported function (place it right after `getSessionTime`, before `createSessionViewModel`, ~line 75). It is moved verbatim from `SidebarSessionItem.tsx`:

```ts
/**
 * Compact relative time for sidebar rows: <1m, Xm, Xhr, Xd.
 */
export const formatCompactSessionAge = (dateString: string, currentTime: Date): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffInMinutes = Math.floor(Math.max(0, currentTime.getTime() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) {
    return '<1m';
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}hr`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d`;
};
```

- [ ] **Step 4: Add the two flat-view functions**

In the same file, append after `getAllSessions` (i.e. after line 125):

```ts
export const getAllSessionsAcrossProjects = (projects: Project[]): SessionWithProvider[] => {
  const tagged: SessionWithProvider[] = [];

  for (const project of projects) {
    for (const session of getAllSessions(project)) {
      tagged.push({ ...session, __projectId: project.projectId });
    }
  }

  return tagged.sort((a, b) => getSessionDate(b).getTime() - getSessionDate(a).getTime());
};

export const filterFlatSessions = (
  sessions: SessionWithProvider[],
  projects: Project[],
  searchFilter: string,
  t: TFunction,
): SessionWithProvider[] => {
  const normalizedSearch = searchFilter.trim().toLowerCase();
  if (!normalizedSearch) {
    return sessions;
  }

  const projectDisplayById = new Map<string, string>();
  for (const project of projects) {
    projectDisplayById.set(project.projectId, (project.displayName || project.projectId).toLowerCase());
  }

  return sessions.filter((session) => {
    const sessionTitle = getSessionName(session, t).toLowerCase();
    if (sessionTitle.includes(normalizedSearch)) {
      return true;
    }

    const projectId = session.__projectId;
    if (projectId) {
      const display = projectDisplayById.get(projectId);
      if (display && display.includes(normalizedSearch)) {
        return true;
      }
      if (projectId.toLowerCase().includes(normalizedSearch)) {
        return true;
      }
    }

    return false;
  });
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run (sandbox disabled): `npx tsx --test src/components/sidebar/utils/flatSessions.test.ts`
Expected: PASS — `# pass 2`, `# fail 0`.

- [ ] **Step 6: Update `SidebarSessionItem.tsx` to use the relocated helper**

In `src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx`:

1. Change the utils import (line 9) from:
   ```ts
   import { createSessionViewModel } from '../../utils/utils';
   ```
   to:
   ```ts
   import { createSessionViewModel, formatCompactSessionAge } from '../../utils/utils';
   ```
2. Delete the local `formatCompactSessionAge` definition — the comment block + function at lines 34-60 (everything from `/**` above `const formatCompactSessionAge` through its closing `};`). Leave line 81 (`const compactSessionAge = formatCompactSessionAge(...)`) unchanged — it now resolves to the imported function.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If it complains `formatCompactSessionAge` is declared but never used in utils — it isn't, it's exported and consumed by `SidebarSessionItem`.)

- [ ] **Step 8: Commit**

```bash
git add src/components/sidebar/utils/utils.ts \
        src/components/sidebar/utils/flatSessions.test.ts \
        src/components/sidebar/view/subcomponents/SidebarSessionItem.tsx
git commit -m "feat(sidebar): add flatten/filter utils for recency session view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add i18n strings

**Files:**
- Modify: `src/i18n/locales/en/sidebar.json` (source of truth)
- Modify: `src/i18n/locales/{de,it,ja,ko,ru,tr,zh-CN}/sidebar.json` (same keys; English values are acceptable — i18next falls back to `en` for any missing key, so untranslated keys are harmless)

All other strings the new components use already exist (`sessions.noSessions`, `sessions.loadingSessions`, `search.tryDifferentQuery`, `tooltips.*`).

- [ ] **Step 1: Add keys to `en/sidebar.json`**

Add these four entries inside the existing `"sessions"` object:

```json
    "noSessionsDescription": "Your recent sessions from all projects will appear here",
    "noMatchingSessions": "No matching sessions",
    "flatViewNote": "Showing recent sessions from each project.",
    "switchToGrouped": "Switch to grouped view for older sessions."
```

Add this new top-level `"viewMode"` object (sibling of `"sessions"`):

```json
  "viewMode": {
    "grouped": "Grouped",
    "flat": "Recent",
    "groupedTooltip": "Group sessions by project",
    "flatTooltip": "Show all sessions by recency"
  }
```

- [ ] **Step 2: Replicate the same keys into the other 7 locales**

Add the identical `sessions.*` additions and `viewMode` object (same English values) to each of:
`src/i18n/locales/de/sidebar.json`, `it`, `ja`, `ko`, `ru`, `tr`, `zh-CN`. (Translation can follow later; English fallback keeps the UI functional.)

- [ ] **Step 3: Verify the JSON is valid and the keys exist**

Run:
```bash
node -e "for (const l of ['en','de','it','ja','ko','ru','tr','zh-CN']) { const j=require('./src/i18n/locales/'+l+'/sidebar.json'); if(!j.viewMode||!j.sessions.flatViewNote) throw new Error('missing keys in '+l); } console.log('all locales OK')"
```
Expected: `all locales OK`

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/*/sidebar.json
git commit -m "feat(sidebar): add i18n strings for recency session view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create `SidebarFlatSessionItem`

**Files:**
- Create: `src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx`

Mirrors `SidebarSessionItem` (same rename/delete UX, mobile + desktop layouts) with three deltas: it resolves its parent project from a `projectsById` map (instead of receiving `project`), adds a project-name subheading, and selects **both** the project and the session on click (since flat view has no project already in context).

- [ ] **Step 1: Write the component**

Create the file with exactly this content:

```tsx
import { useEffect, useRef } from 'react';
import { Check, Edit2, Folder, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Badge, Button, Tooltip } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { LLMProvider, Project, ProjectSession } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { createSessionViewModel, formatCompactSessionAge } from '../../utils/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type SidebarFlatSessionItemProps = {
  session: SessionWithProvider;
  projectsById: Map<string, Project>;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectId: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectId: string) => void;
  onDeleteSession: (projectId: string, sessionId: string, sessionTitle: string, provider: LLMProvider) => void;
  t: TFunction;
};

export default function SidebarFlatSessionItem({
  session,
  projectsById,
  selectedSession,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  t,
}: SidebarFlatSessionItemProps) {
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const isEditing = editingSession === session.id;
  const compactSessionAge = formatCompactSessionAge(sessionView.sessionTime, currentTime);
  const projectId = session.__projectId ?? '';
  const project = projectsById.get(projectId);
  const projectDisplay = project?.displayName || projectId;
  const editingContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const container = editingContainerRef.current;
      if (container && !container.contains(event.target as Node)) {
        onCancelEditingSession();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isEditing, onCancelEditingSession]);

  const selectSession = () => {
    if (project) {
      onProjectSelect(project);
    }
    onSessionSelect(session, projectId);
  };

  const saveEditedSession = () => {
    onSaveEditingSession(projectId, session.id, editingSessionName, session.__provider);
  };

  const requestDeleteSession = () => {
    onDeleteSession(projectId, session.id, sessionView.sessionName, session.__provider);
  };

  return (
    <div className="group relative">
      {sessionView.isActive && !isSelected && (
        <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 transform">
          <Tooltip content={t('tooltips.activeSessionIndicator')} position="right">
            <div
              role="status"
              aria-label={t('tooltips.activeSessionIndicator')}
              className="h-2 w-2 animate-pulse rounded-full bg-green-500"
            />
          </Tooltip>
        </div>
      )}

      <div className="md:hidden">
        <div
          className={cn(
            'p-2 mx-3 my-0.5 rounded-md bg-card border active:scale-[0.98] transition-all duration-150 relative',
            isSelected ? 'bg-primary/5 border-primary/20' : '',
            !isSelected && sessionView.isActive
              ? 'border-green-500/30 bg-green-50/5 dark:bg-green-900/5'
              : 'border-border/30',
          )}
          onClick={selectSession}
        >
          <div className="flex items-start gap-2">
            <div
              className={cn(
                'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5',
                isSelected ? 'bg-primary/10' : 'bg-muted/50',
              )}
            >
              <SessionProviderLogo provider={session.__provider} className="h-3 w-3" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</div>
                {compactSessionAge && (
                  <span className="ml-auto flex-shrink-0 text-[11px] text-muted-foreground">{compactSessionAge}</span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Folder className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/70" />
                  <span className="truncate text-[11px] text-muted-foreground/80">{projectDisplay}</span>
                </div>
                {sessionView.messageCount > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-xs">
                    {sessionView.messageCount}
                  </Badge>
                )}
              </div>
            </div>

            {!sessionView.isCursorSession && (
              <button
                className="ml-1 flex h-5 w-5 items-center justify-center rounded-md bg-red-50 opacity-70 transition-transform active:scale-95 dark:bg-red-900/20"
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeleteSession();
                }}
              >
                <Trash2 className="h-2.5 w-2.5 text-red-600 dark:text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start p-2 h-auto font-normal text-left hover:bg-accent/50 transition-colors duration-200',
            isSelected && 'bg-accent text-accent-foreground',
          )}
          onClick={selectSession}
        >
          <div className="flex w-full min-w-0 items-start gap-2">
            <SessionProviderLogo provider={session.__provider} className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</div>
                {compactSessionAge && (
                  <span
                    className={cn(
                      'ml-auto flex-shrink-0 text-[11px] text-muted-foreground transition-opacity duration-200',
                      isEditing ? 'opacity-0' : 'group-hover:opacity-0',
                    )}
                  >
                    {compactSessionAge}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Folder className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/70" />
                  <span className="truncate text-[11px] text-muted-foreground/80">{projectDisplay}</span>
                </div>
                {sessionView.messageCount > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-xs">
                    {sessionView.messageCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Button>

        <div
          ref={editingContainerRef}
          className={cn(
            'absolute right-2 top-1/2 flex -translate-y-1/2 transform items-center gap-1 transition-all duration-200',
            isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {isEditing ? (
            <>
              <input
                type="text"
                value={editingSessionName}
                onChange={(event) => onEditingSessionNameChange(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    saveEditedSession();
                  } else if (event.key === 'Escape') {
                    onCancelEditingSession();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                className="w-32 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <button
                className="flex h-6 w-6 items-center justify-center rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40"
                onClick={(event) => {
                  event.stopPropagation();
                  saveEditedSession();
                }}
                title={t('tooltips.save')}
              >
                <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              </button>
              <button
                className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelEditingSession();
                }}
                title={t('tooltips.cancel')}
              >
                <X className="h-3 w-3 text-gray-600 dark:text-gray-400" />
              </button>
            </>
          ) : (
            <>
              <button
                className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartEditingSession(session.id, sessionView.sessionName);
                }}
                title={t('tooltips.editSessionName')}
              >
                <Edit2 className="h-3 w-3 text-gray-600 dark:text-gray-400" />
              </button>
              {!sessionView.isCursorSession && (
                <button
                  className="flex h-6 w-6 items-center justify-center rounded bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteSession();
                  }}
                  title={t('tooltips.deleteSessionOptions', 'Archive or permanently delete this session')}
                >
                  <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (The component is not yet rendered anywhere; this confirms types/imports resolve.)

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/view/subcomponents/SidebarFlatSessionItem.tsx
git commit -m "feat(sidebar): add SidebarFlatSessionItem card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Create `SidebarFlatSessionList`

**Files:**
- Create: `src/components/sidebar/view/subcomponents/SidebarFlatSessionList.tsx`

The container: handles loading / no-sessions / no-search-match states, maps sessions to `SidebarFlatSessionItem`, and renders the footer note with a "switch back to grouped" button. Its props type is exported so `Sidebar.tsx` can type the props object it builds.

- [ ] **Step 1: Write the component**

Create the file with exactly this content:

```tsx
import { LayoutList, MessageSquare, Search } from 'lucide-react';
import type { TFunction } from 'i18next';

import type { LLMProvider, LoadingProgress, Project, ProjectSession } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import SidebarFlatSessionItem from './SidebarFlatSessionItem';

export type SidebarFlatSessionListProps = {
  projects: Project[];
  projectsById: Map<string, Project>;
  filteredFlatSessions: SessionWithProvider[];
  flatSessionsTotal: number;
  selectedSession: ProjectSession | null;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  searchFilter: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectId: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectId: string) => void;
  onDeleteSession: (projectId: string, sessionId: string, sessionTitle: string, provider: LLMProvider) => void;
  onSwitchToGroupedView: () => void;
  t: TFunction;
};

export default function SidebarFlatSessionList({
  projects,
  projectsById,
  filteredFlatSessions,
  flatSessionsTotal,
  selectedSession,
  isLoading,
  currentTime,
  editingSession,
  editingSessionName,
  searchFilter,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onSwitchToGroupedView,
  t,
}: SidebarFlatSessionListProps) {
  if (isLoading) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
        <p className="text-sm text-muted-foreground">{t('sessions.loadingSessions')}</p>
      </div>
    );
  }

  if (projects.length === 0 || flatSessionsTotal === 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('sessions.noSessions')}</h3>
        <p className="text-sm text-muted-foreground">{t('sessions.noSessionsDescription')}</p>
      </div>
    );
  }

  if (filteredFlatSessions.length === 0 && searchFilter.trim().length > 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <Search className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('sessions.noMatchingSessions')}</h3>
        <p className="text-sm text-muted-foreground">{t('search.tryDifferentQuery')}</p>
      </div>
    );
  }

  return (
    <div className="pb-safe-area-inset-bottom md:space-y-1">
      {filteredFlatSessions.map((session) => (
        <SidebarFlatSessionItem
          key={`${session.__projectId}-${session.id}`}
          session={session}
          projectsById={projectsById}
          selectedSession={selectedSession}
          currentTime={currentTime}
          editingSession={editingSession}
          editingSessionName={editingSessionName}
          onEditingSessionNameChange={onEditingSessionNameChange}
          onStartEditingSession={onStartEditingSession}
          onCancelEditingSession={onCancelEditingSession}
          onSaveEditingSession={onSaveEditingSession}
          onProjectSelect={onProjectSelect}
          onSessionSelect={onSessionSelect}
          onDeleteSession={onDeleteSession}
          t={t}
        />
      ))}

      <div className="mt-3 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
        <div className="flex items-start gap-1.5">
          <LayoutList className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>
            {t('sessions.flatViewNote')}{' '}
            <button
              type="button"
              className="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
              onClick={onSwitchToGroupedView}
            >
              {t('sessions.switchToGrouped')}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
```

> Note: `loadingProgress` is included in the props type for API parity with the sidebar's other lists but is intentionally not destructured/used in the body (the simple spinner is enough). If `eslint` flags an unused prop, it is only in the type, not the destructure, so there is nothing to remove.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/sidebar/view/subcomponents/SidebarFlatSessionList.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/view/subcomponents/SidebarFlatSessionList.tsx
git commit -m "feat(sidebar): add SidebarFlatSessionList container

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire the toggle and flat list through the tree

**Files:**
- Modify: `src/components/sidebar/view/subcomponents/SidebarHeader.tsx` (props + toggle UI, 2 spots)
- Modify: `src/components/sidebar/view/subcomponents/SidebarContent.tsx` (props + thread to header + render branch)
- Modify: `src/components/sidebar/view/Sidebar.tsx` (read pref, derive flat data, build `flatListProps`, pass down)

These three files are coupled by TypeScript (the header's new props are required by content, content's by Sidebar), so they land as one task with a single typecheck/lint/commit at the end. Apply the edits in this order.

- [ ] **Step 1: `SidebarHeader.tsx` — add props**

In the `SidebarHeaderProps` type (after `onCollapseSidebar: () => void;`, line 27) add:

```ts
  flatSessionView: boolean;
  onFlatSessionViewChange: (value: boolean) => void;
```

In the destructured params (after `onCollapseSidebar,`, line 46) add:

```ts
  flatSessionView,
  onFlatSessionViewChange,
```

- [ ] **Step 2: `SidebarHeader.tsx` — add the toggle imports & component**

Add `History` and `LayoutList` to the lucide import (line 1):

```ts
import { Archive, Folder, FolderPlus, History, LayoutList, MessageSquare, Plus, RefreshCw, Search, X, PanelLeftClose } from 'lucide-react';
```

Inside the `SidebarHeader` function body, just after the `LogoBlock` definition (after line 65), add a local toggle component:

```tsx
  const ViewModeToggle = () => (
    <div className="flex rounded-lg bg-muted/50 p-0.5">
      <button
        onClick={() => onFlatSessionViewChange(false)}
        aria-pressed={!flatSessionView}
        title={t('viewMode.groupedTooltip')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all',
          !flatSessionView
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutList className="h-3 w-3" />
        {t('viewMode.grouped')}
      </button>
      <button
        onClick={() => onFlatSessionViewChange(true)}
        aria-pressed={flatSessionView}
        title={t('viewMode.flatTooltip')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all',
          flatSessionView
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <History className="h-3 w-3" />
        {t('viewMode.flat')}
      </button>
    </div>
  );
```

- [ ] **Step 3: `SidebarHeader.tsx` — render the toggle (desktop + mobile)**

In the **desktop** search block, immediately after `<div className="mt-2.5 space-y-2">` (line 127) and before the `{/* Search mode toggle */}` comment, insert:

```tsx
            <ViewModeToggle />
```

Do the same in the **mobile** search block: immediately after `<div className="mt-2.5 space-y-2">` (line 245), insert:

```tsx
            <ViewModeToggle />
```

- [ ] **Step 4: `SidebarContent.tsx` — import the flat list**

After the `SidebarProjectList` import (line 12) add:

```tsx
import SidebarFlatSessionList, { type SidebarFlatSessionListProps } from './SidebarFlatSessionList';
```

- [ ] **Step 5: `SidebarContent.tsx` — add props**

In `SidebarContentProps` (after `projectListProps: SidebarProjectListProps;`, line 146) add:

```ts
  flatSessionView: boolean;
  onFlatSessionViewChange: (value: boolean) => void;
  flatListProps: SidebarFlatSessionListProps;
```

In the destructured params (after `projectListProps,`, line 182) add:

```ts
  flatSessionView,
  onFlatSessionViewChange,
  flatListProps,
```

- [ ] **Step 6: `SidebarContent.tsx` — thread props to the header**

In the `<SidebarHeader ... />` element, after `onCollapseSidebar={onCollapseSidebar}` (line 209) add:

```tsx
        flatSessionView={flatSessionView}
        onFlatSessionViewChange={onFlatSessionViewChange}
```

- [ ] **Step 7: `SidebarContent.tsx` — add the render branch**

Replace lines 511-513, which currently read:

```tsx
        ) : (
          <SidebarProjectList {...projectListProps} />
        )}
```

with:

```tsx
        ) : flatSessionView ? (
          <SidebarFlatSessionList {...flatListProps} />
        ) : (
          <SidebarProjectList {...projectListProps} />
        )}
```

- [ ] **Step 8: `Sidebar.tsx` — imports**

Change the React import (line 1) to add `useMemo`:

```tsx
import { useEffect, useMemo } from 'react';
```

After the existing util/type imports (after line 17, `import type { SidebarProjectListProps } from './subcomponents/SidebarProjectList';`) add:

```tsx
import { filterFlatSessions, getAllSessionsAcrossProjects } from '../utils/utils';
import type { SidebarFlatSessionListProps } from './subcomponents/SidebarFlatSessionList';
```

- [ ] **Step 9: `Sidebar.tsx` — read the preference**

Change line 50 from:

```tsx
  const { sidebarVisible } = preferences;
```

to:

```tsx
  const { sidebarVisible, flatSessionView } = preferences;
```

- [ ] **Step 10: `Sidebar.tsx` — derive flat data and build `flatListProps`**

Immediately after the `projectListProps` object literal closes (after line 190, the `};` ending `projectListProps`) and before the `return (` (line 192), insert:

```tsx
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.projectId, project])),
    [projects],
  );

  const flatSessions = useMemo(() => getAllSessionsAcrossProjects(projects), [projects]);

  const filteredFlatSessions = useMemo(
    () => filterFlatSessions(flatSessions, projects, searchFilter, t),
    [flatSessions, projects, searchFilter, t],
  );

  const flatSessionsTotal = useMemo(
    () =>
      projects.reduce(
        (acc, project) =>
          acc +
          (project.sessions?.length || 0) +
          (project.cursorSessions?.length || 0) +
          (project.codexSessions?.length || 0) +
          (project.geminiSessions?.length || 0) +
          (project.opencodeSessions?.length || 0),
        0,
      ),
    [projects],
  );

  const flatListProps: SidebarFlatSessionListProps = {
    projects,
    projectsById,
    filteredFlatSessions,
    flatSessionsTotal,
    selectedSession,
    isLoading,
    loadingProgress,
    currentTime,
    editingSession,
    editingSessionName,
    searchFilter,
    onEditingSessionNameChange: setEditingSessionName,
    onStartEditingSession: (sessionId, initialName) => {
      setEditingSession(sessionId);
      setEditingSessionName(initialName);
    },
    onCancelEditingSession: () => {
      setEditingSession(null);
      setEditingSessionName('');
    },
    onSaveEditingSession: (projectId: string, sessionId: string, summary: string, provider: LLMProvider) => {
      void updateSessionSummary(projectId, sessionId, summary, provider);
    },
    onProjectSelect: handleProjectSelect,
    onSessionSelect: handleSessionClick,
    onDeleteSession: showDeleteSessionConfirmation,
    onSwitchToGroupedView: () => setPreference('flatSessionView', false),
    t,
  };
```

- [ ] **Step 11: `Sidebar.tsx` — pass props to `SidebarContent`**

In the `<SidebarContent ... />` element, after `projectListProps={projectListProps}` (line 298) add:

```tsx
            flatSessionView={flatSessionView}
            onFlatSessionViewChange={(value) => setPreference('flatSessionView', value)}
            flatListProps={flatListProps}
```

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Common failures to watch for:
- `handleSessionClick`/`showDeleteSessionConfirmation`/`updateSessionSummary` arg mismatch → confirm signatures match the existing `projectListProps` usage (lines 173-188), which use them identically.
- Missing prop on `SidebarContent`/`SidebarHeader` → ensure Steps 1-7 added all three props at each level.

- [ ] **Step 13: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add src/components/sidebar/view/subcomponents/SidebarHeader.tsx \
        src/components/sidebar/view/subcomponents/SidebarContent.tsx \
        src/components/sidebar/view/Sidebar.tsx
git commit -m "feat(sidebar): wire grouped/recent toggle and flat session list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Manual verification (drive the app)

**Files:** none (verification only)

No frontend test runner exists, so the integrated behavior is verified by running the app. (On this machine the dev server needs the sandbox disabled — `tsx` IPC. Run it in your own terminal/tmux as set up earlier.)

- [ ] **Step 1: Start the app**

Run (in a terminal without the sandbox): `npm run dev`
Expected: Vite ready on `http://localhost:5173`, backend "CloudCLI Server - Ready" on `:3001`.

- [ ] **Step 2: Verify the toggle appears and switches views**

Open `http://localhost:5173`. In the sidebar header (with ≥1 project present), confirm a "Grouped / Recent" segmented toggle is visible above the search box.
- Click **Recent** → the project tree is replaced by a flat list of sessions; the most recently active session is at the top, each row shows a provider logo, the session title, a folder + project name subheading, a compact age (e.g. `5m`), and a message-count badge.
- Confirm the footer note "Showing recent sessions from each project. Switch to grouped view for older sessions." appears, and clicking the link returns to **Grouped**.

- [ ] **Step 3: Verify search, navigation, and edit/delete in flat mode**

- Type in the search box while in Recent mode → list filters by session title or project name.
- Click a session card → it opens that session (both project and session become selected).
- Hover a card (desktop) → rename (pencil) and delete (trash) controls appear; rename inline (Enter saves, Esc cancels); cursor-provider sessions show no delete button.

- [ ] **Step 4: Verify persistence**

Set the toggle to **Recent**, reload the page → it should still be in Recent mode (preference persisted in `localStorage['uiPreferences'].flatSessionView`). Open a second tab → it reflects the same mode (cross-tab sync).

- [ ] **Step 5: Final full-project gate**

Run: `npm run typecheck && npm run lint`
Expected: both PASS with no errors.

---

## Self-Review

**1. Spec coverage** — every behavior of the original feature is covered:
- Flat recency list across projects → Task 2 (`getAllSessionsAcrossProjects`) + Task 5.
- Header toggle → Task 6 (Steps 1-3).
- Per-session card (logo, title, project subheading, age, badge, active dot, rename/delete) → Task 4.
- Search filter (title or project name) → Task 2 (`filterFlatSessions`).
- Empty / no-match / loading states + footer "switch to grouped" → Task 5.
- Persistence + cross-tab sync → Task 1 + Task 6 (Step 11) via `useUiPreferences`.
- i18n → Task 3.
- **Intentionally dropped vs. the original:** the Settings → Appearance dropdown and its `claude-settings` enum + dual-controller sync. Rationale: the header toggle fully delivers "see sessions by most recent," and the boolean `useUiPreferences` store is the new codebase's idiom. *Optional extension:* if a Settings entry is wanted later, add a `SettingsToggle` in `AppearanceSettingsTab.tsx` bound to the same `flatSessionView` pref (read/write via a `useUiPreferences()` instance) — no enum needed.

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"; every code step contains complete, paste-ready code.

**3. Type consistency** — names verified against real source:
- `getAllSessionsAcrossProjects(projects)` / `filterFlatSessions(sessions, projects, searchFilter, t)` / `formatCompactSessionAge(dateString, currentTime)` are used identically in Tasks 2, 4, 5, 6.
- Callback signatures (`onSessionSelect(session, projectId)`, `onSaveEditingSession(projectId, sessionId, summary, provider)`, `onDeleteSession(projectId, sessionId, sessionTitle, provider)`) match `SidebarSessionItem.tsx` and the controller usage in `Sidebar.tsx:173-188`.
- `flatSessionView: boolean` + `onFlatSessionViewChange: (value: boolean) => void` are consistent across Header, Content, and Sidebar.
- `SessionWithProvider`, `Project`, `ProjectSession`, `LLMProvider`, `LoadingProgress` import paths verified (`../../../../types/app` from `view/subcomponents/`; `../../../types/app` from `utils/`).
