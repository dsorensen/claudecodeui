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
