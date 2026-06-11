import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PROFILES, interpretProfilesResponse } from './useClaudeProfiles.logic';

test('a non-OK response is non-authoritative (null) so it is NOT cached and can be retried', () => {
  // Regression: a transient 401 before the auth token lands must not poison the
  // module cache with the single-default fallback for the rest of the page load.
  assert.equal(interpretProfilesResponse(false, null), null);
  assert.equal(interpretProfilesResponse(false, { data: { profiles: [] } }), null);
});

test('an OK response with profiles is authoritative and returned verbatim', () => {
  const profiles = [
    { id: 'claude', label: 'Personal', isDefault: true },
    { id: 'claude:13layers', label: '13 Layers', isDefault: false },
  ];
  assert.deepEqual(interpretProfilesResponse(true, { data: { profiles } }), profiles);
});

test('an OK response with no/empty/malformed profiles falls back to the single default (authoritative)', () => {
  assert.deepEqual(interpretProfilesResponse(true, { data: { profiles: [] } }), DEFAULT_PROFILES);
  assert.deepEqual(interpretProfilesResponse(true, {}), DEFAULT_PROFILES);
  assert.deepEqual(interpretProfilesResponse(true, null), DEFAULT_PROFILES);
});
