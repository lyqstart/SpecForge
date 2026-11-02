const { OpenCodeAdapter, OpenCodeHttpRuntimeClient } = require('../../../packages/opencode-adapter/dist/index.js');

(async () => {
  const runtimeClient = new OpenCodeHttpRuntimeClient({ baseUrl: 'http://127.0.0.1:4096' });
  const adapter = new OpenCodeAdapter({ runtimeClient, compatibleKernelRange: '>=1.14.0 <2.0.0' });
  const cwd = process.cwd();
  const { sessionId } = await adapter.spawnAgent({ agentRole: 'sf-verifier', spawnIntentId: `event-probe-${Date.now()}`, cwd });
  const stream = adapter.subscribeEvents(sessionId);
  const iterator = stream[Symbol.asyncIterator]();
  const next = iterator.next();
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const url = new URL(`/session/${encodeURIComponent(sessionId)}`, 'http://127.0.0.1:4096');
    url.searchParams.set('directory', cwd);
    const response = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'SpecForge isolated event probe' }) });
    if (!response.ok) throw new Error(`session update HTTP ${response.status}: ${await response.text()}`);
    const result = await Promise.race([next, new Promise((_, reject) => setTimeout(() => reject(new Error('event timeout')), 10000))]);
    console.log(JSON.stringify({ utc: new Date().toISOString(), sessionId, event: result.value, done: result.done }));
    if (result.done || result.value?.type !== 'opencode.session.updated' || result.value?.sessionId !== sessionId) throw new Error('Expected translated session.updated event');
  } finally { adapter.unsubscribeEvents(sessionId); }
})().catch(error => { console.error(error); process.exitCode = 1; });
