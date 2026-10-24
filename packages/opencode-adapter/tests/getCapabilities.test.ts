import { describe, it, expect } from 'vitest';
import { OpenCodeAdapter, OpenCodeHttpRuntimeClient } from '../src';

// Provider facts are explicit fixtures. Model names carry no capability facts.
describe('OpenCodeAdapter capability contract', () => {
  for (const vision of [false, true]) for (const tools of [false, true]) for (const context of [8192, 64000, 200000]) {
    it('maps actual provider fields: ' + JSON.stringify({ vision, tools, context }), async () => {
      const runtime = new OpenCodeHttpRuntimeClient({ fetchFn: (async () => new Response(JSON.stringify({
        connected: ['custom'], all: [{ id: 'custom', models: { model: {
          capabilities: { input: { image: vision }, toolcall: tools }, limit: { context },
        } } }],
      }))) as typeof fetch });
      const adapter = new OpenCodeAdapter({ runtimeClient: runtime });
      expect(await adapter.getCapabilities('custom/model')).toEqual({ streaming: null, jsonOutput: null,
        vision, tools, functionCalling: tools, maxContextLength: context, outputFormats: ['text', 'markdown'] });
    });
  }
  it.each(['', '   ', undefined, null, 'unknown-model'])('fails without verified discovery for %s', async model => {
    await expect(new OpenCodeAdapter().getCapabilities(model as string)).rejects.toThrow('CAPABILITY_DISCOVERY_UNAVAILABLE');
  });
  it('propagates transport failure instead of inventing fallback capabilities', async () => {
    const runtime = new OpenCodeHttpRuntimeClient({ fetchFn: (async () => new Response('', { status: 503 })) as typeof fetch });
    await expect(new OpenCodeAdapter({ runtimeClient: runtime }).getCapabilities('custom/model')).rejects.toThrow('HTTP 503');
  });
});
