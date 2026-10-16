import { describe, expect, it, vi } from 'vitest';
import { OpenCodeAdapter, OpenCodeHttpRuntimeClient } from '../src';
const catalog = { connected: ['custom'], all: [{ id: 'custom', models: {
  'claude-name-but-no-vision': { limit: { context: 8192 }, capabilities: { toolcall: false, input: { image: false } } },
} }] };
describe('real capability discovery', () => {
  it('uses provider facts instead of inferring from the name', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(catalog)));
    const adapter = new OpenCodeAdapter({ runtimeClient: new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch }) });
    expect(await adapter.getCapabilities('custom/claude-name-but-no-vision')).toMatchObject({ maxContextLength: 8192, vision: false, tools: false, functionCalling: false });
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/provider');
  });
  it('rejects missing transport instead of returning invented defaults', async () => {
    await expect(new OpenCodeAdapter().getCapabilities('custom/model')).rejects.toThrow('CAPABILITY_DISCOVERY_UNAVAILABLE');
  });
  it.each([{}, { ...catalog, connected: [] }, { ...catalog, all: [] }])('rejects missing/unavailable model data', async body => {
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: (async () => new Response(JSON.stringify(body))) as typeof fetch });
    await expect(client.getModelCapabilities('custom/claude-name-but-no-vision')).rejects.toThrow(/CAPABILITY_/);
  });
});
