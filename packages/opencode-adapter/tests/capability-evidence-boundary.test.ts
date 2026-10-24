import { describe, expect, it } from 'vitest';
import { OpenCodeAdapter, OpenCodeHttpRuntimeClient } from '../src';
import { CapabilityTranslator } from '../src/translators/CapabilityTranslator';

describe('capability evidence, absence is not false', () => {
  for (const invalid of [null, 'false', 0, {}, []]) {
    it(`rejects malformed explicit feature ${JSON.stringify(invalid)}`, () => {
      expect(() => new CapabilityTranslator().translate({ provider: 'fixture', model: 'model', features: { streaming: invalid as any } })).toThrow('CAPABILITY_RESPONSE_INVALID');
      expect(() => new CapabilityTranslator().translate({ provider: 'fixture', model: 'model', features: { json_output: invalid as any } })).toThrow('CAPABILITY_RESPONSE_INVALID');
    });
  }
  for (const field of ['toolcall', 'image', 'context']) {
    it(`rejects malformed required provider ${field}`, async () => {
      const entry: any = { limit: { context: 100 }, capabilities: { toolcall: true, input: { image: false } } };
      if (field === 'context') entry.limit.context = '100';
      else if (field === 'image') entry.capabilities.input.image = 'false';
      else entry.capabilities.toolcall = 'true';
      const catalog = { connected: ['fixture'], all: [{ id: 'fixture', models: { model: entry } }] };
      const client = new OpenCodeHttpRuntimeClient({ fetchFn: (async () => new Response(JSON.stringify(catalog))) as typeof fetch });
      await expect(client.getModelCapabilities('fixture/model')).rejects.toThrow('CAPABILITY_RESPONSE_INVALID');
    });
  }
  it('does not fabricate streaming or JSON support from a real-shape provider response', async () => {
    const catalog = { connected: ['fixture'], all: [{ id: 'fixture', models: { model: { limit: { context: 12345 }, capabilities: { toolcall: false, input: { image: false } } } } }] };
    const adapter = new OpenCodeAdapter({ runtimeClient: new OpenCodeHttpRuntimeClient({ fetchFn: (async () => new Response(JSON.stringify(catalog))) as typeof fetch }) });
    const result = await adapter.getCapabilities('fixture/model');
    expect(result).toMatchObject({ streaming: null, jsonOutput: null, maxContextLength: 12345, tools: false, vision: false, functionCalling: false });
    expect(result.outputFormats).not.toContain('json');
  });
  for (const value of [true, false, undefined]) {
    it(`preserves explicit feature evidence ${String(value)} through translation and JSON transport`, () => {
      const translator = new CapabilityTranslator();
      const result = translator.translate({ provider: 'fixture', model: 'model', context_window: 100, tools: [], features: { streaming: value, json_output: value, vision: false, function_calling: false } });
      const transported = JSON.parse(JSON.stringify(result));
      expect(transported.streaming).toBe(value ?? null); expect(transported.jsonOutput).toBe(value ?? null);
      expect(result.outputFormats.includes('json')).toBe(value === true);
      expect(translator.hasCapability('streaming', result)).toBe(value === true);
    });
  }
  it('does not let cached positive evidence override a later explicit negative', () => {
    const t = new CapabilityTranslator();
    const entry = { provider: 'fixture', model: 'model', features: { streaming: true }, context_window: 100 };
    t.discoverCapabilities('fixture/model', entry);
    expect(t.discoverCapabilities('fixture/model', { ...entry, features: { streaming: false } }).capabilities?.streaming).toBe(false);
  });
  it('cannot discover a model by returning guessed defaults', () => {
    expect(new CapabilityTranslator().discoverCapabilities('fixture/unknown').success).toBe(false);
  });
  it('does not turn incomplete merged evidence into a negative claim', () => {
    const t = new CapabilityTranslator(), unknown = t.getDefaultCapabilities();
    const no = { ...unknown, streaming: false };
    expect(t.mergeCapabilities([no, unknown]).streaming).toBeNull();
    expect(t.mergeCapabilities([{ ...no, streaming: true }, unknown]).streaming).toBe(true);
  });
});
