import assert from 'node:assert/strict';
import test from 'node:test';

import { isInternalContent } from '@/modules/providers/list/claude/claude-sessions.provider.js';

test('treats <local-command-caveat> as internal content', () => {
  assert.equal(isInternalContent('<local-command-caveat>Caveat: messages below were generated…'), true);
});

test('still treats existing internal prefixes as internal', () => {
  assert.equal(isInternalContent('<system-reminder>x'), true);
  assert.equal(isInternalContent('Caveat: x'), true);
});

test('treats normal chat content as not internal', () => {
  assert.equal(isInternalContent('Hello, how do I run the tests?'), false);
});
