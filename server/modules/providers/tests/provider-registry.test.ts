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
