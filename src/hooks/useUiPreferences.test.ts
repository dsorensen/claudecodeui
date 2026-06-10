import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePreferences } from './useUiPreferences';

test('filtersExpanded defaults to collapsed (false) when absent', () => {
  assert.equal(normalizePreferences({}).filtersExpanded, false);
});

test('filtersExpanded respects an explicit boolean', () => {
  assert.equal(normalizePreferences({ filtersExpanded: true }).filtersExpanded, true);
  assert.equal(normalizePreferences({ filtersExpanded: false }).filtersExpanded, false);
});

test('filtersExpanded coerces stringified booleans (legacy storage)', () => {
  assert.equal(normalizePreferences({ filtersExpanded: 'true' }).filtersExpanded, true);
  assert.equal(normalizePreferences({ filtersExpanded: 'false' }).filtersExpanded, false);
});

test('an existing stored blob without filtersExpanded keeps other prefs and defaults the new key', () => {
  const prefs = normalizePreferences({ flatSessionView: true, sidebarVisible: false });
  assert.equal(prefs.flatSessionView, true); // existing pref preserved
  assert.equal(prefs.sidebarVisible, false); // existing pref preserved
  assert.equal(prefs.filtersExpanded, false); // backward-compat default
});
