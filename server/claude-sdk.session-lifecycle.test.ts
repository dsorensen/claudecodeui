import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
  COMPLETED_SESSION_TTL_MS,
  addSession,
  getSession,
  isClaudeSDKSessionActive,
  markSessionCompleted,
} from '@/claude-sdk.js';

test('markSessionCompleted flips an active session out of the active state but keeps it', () => {
  addSession('lifecycle-flip', {});
  assert.equal(isClaudeSDKSessionActive('lifecycle-flip'), true);

  markSessionCompleted('lifecycle-flip');

  assert.equal(isClaudeSDKSessionActive('lifecycle-flip'), false, 'no longer reports active');
  const retained = getSession('lifecycle-flip') as { status?: string } | undefined;
  assert.ok(retained, 'session is retained for the grace period');
  assert.equal(retained.status, 'completed');
});

test('markSessionCompleted removes the session after the grace period', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    addSession('lifecycle-ttl', {});
    markSessionCompleted('lifecycle-ttl');
    assert.ok(getSession('lifecycle-ttl'), 'retained before the TTL elapses');

    mock.timers.tick(COMPLETED_SESSION_TTL_MS);

    assert.equal(getSession('lifecycle-ttl'), undefined, 'removed after the TTL');
  } finally {
    mock.timers.reset();
  }
});

test('markSessionCompleted does not remove a session re-activated within the grace period', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    addSession('lifecycle-reactivate', {});
    markSessionCompleted('lifecycle-reactivate');

    // A new run starts under the same session id before the TTL fires.
    addSession('lifecycle-reactivate', {});

    mock.timers.tick(COMPLETED_SESSION_TTL_MS);

    assert.ok(getSession('lifecycle-reactivate'), 'the re-activated run is not evicted');
    assert.equal(isClaudeSDKSessionActive('lifecycle-reactivate'), true);
  } finally {
    mock.timers.reset();
  }
});

test('markSessionCompleted is a no-op for an unknown session', () => {
  assert.doesNotThrow(() => markSessionCompleted('lifecycle-unknown'));
  assert.equal(getSession('lifecycle-unknown'), undefined);
});
