/**
 * opencode-json-agent-prune.test.ts
 *
 * Verifies that mergeOpenCodeJsonUserLevel correctly prunes stale
 * SpecForge-managed agents from opencode.json while preserving
 * user-defined agents.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { mergeOpenCodeJsonUserLevel } from '../lib/opencode_merge';

describe('OpenCode JSON agent pruning', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-agent-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeOpencodeJson(agents: Record<string, unknown>, plugin?: string[]): void {
    const config: Record<string, unknown> = { agent: agents };
    if (plugin) config.plugin = plugin;
    fs.writeFileSync(
      path.join(tmpDir, 'opencode.json'),
      JSON.stringify(config, null, 2)
    );
  }

  function readOpencodeJson(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
  }

  it('should prune stale sf-* agent that is in managed_agents', async () => {
    writeOpencodeJson({
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
      'sf-stale-agent': { mode: 'subagent', prompt: '{file:./agents/sf-stale-agent.md}' },
    });

    const sourceAgents = {
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
    };

    const manifest = {
      schema_version: '1.0',
      shared_version: '6.0.0-dev',
      install_mode: 'user_level',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      managed_agents: ['sf-orchestrator', 'sf-stale-agent'],
      managed_agent_hashes: {},
      files: {},
    } as any;

    await mergeOpenCodeJsonUserLevel(tmpDir, sourceAgents, manifest, false);

    const result = readOpencodeJson();
    const agents = result.agent as Record<string, unknown>;
    expect(agents['sf-orchestrator']).toBeDefined();
    expect(agents['sf-stale-agent']).toBeUndefined();
  });

  it('should preserve user-defined non-sf agents', async () => {
    writeOpencodeJson({
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
      'my-custom-agent': { mode: 'primary', prompt: 'I am a custom agent' },
    });

    const sourceAgents = {
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
    };

    const manifest = {
      schema_version: '1.0',
      shared_version: '6.0.0-dev',
      install_mode: 'user_level',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      managed_agents: ['sf-orchestrator'],
      managed_agent_hashes: {},
      files: {},
    } as any;

    await mergeOpenCodeJsonUserLevel(tmpDir, sourceAgents, manifest, false);

    const result = readOpencodeJson();
    const agents = result.agent as Record<string, unknown>;
    expect(agents['sf-orchestrator']).toBeDefined();
    expect(agents['my-custom-agent']).toBeDefined();
  });

  it('should prune stale sf-* agent that references SpecForge agent file', async () => {
    writeOpencodeJson({
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
      'sf-old-agent': { mode: 'subagent', prompt: '{file:./agents/sf-old-agent.md}' },
    });

    const sourceAgents = {
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
    };

    // manifest does NOT list sf-old-agent in managed_agents
    const manifest = {
      schema_version: '1.0',
      shared_version: '6.0.0-dev',
      install_mode: 'user_level',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      managed_agents: ['sf-orchestrator'],
      managed_agent_hashes: {},
      files: {},
    } as any;

    await mergeOpenCodeJsonUserLevel(tmpDir, sourceAgents, manifest, false);

    const result = readOpencodeJson();
    const agents = result.agent as Record<string, unknown>;
    expect(agents['sf-orchestrator']).toBeDefined();
    // sf-old-agent references {file:./agents/sf-...} so it should be pruned
    expect(agents['sf-old-agent']).toBeUndefined();
  });

  it('should keep all current source agents', async () => {
    writeOpencodeJson({});

    const sourceAgents = {
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
      'sf-design': { mode: 'subagent', prompt: '{file:./agents/sf-design.md}' },
      'sf-reviewer': { mode: 'subagent', prompt: '{file:./agents/sf-reviewer.md}' },
    };

    await mergeOpenCodeJsonUserLevel(tmpDir, sourceAgents, null, false);

    const result = readOpencodeJson();
    const agents = result.agent as Record<string, unknown>;
    expect(agents['sf-orchestrator']).toBeDefined();
    expect(agents['sf-design']).toBeDefined();
    expect(agents['sf-reviewer']).toBeDefined();
  });

  it('should not prune sf-* agent with user custom prompt (non file ref)', async () => {
    writeOpencodeJson({
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
      'sf-custom': { mode: 'primary', prompt: 'User defined prompt without file ref' },
    });

    const sourceAgents = {
      'sf-orchestrator': { mode: 'primary', prompt: '{file:./agents/sf-orchestrator.md}' },
    };

    const manifest = {
      schema_version: '1.0',
      shared_version: '6.0.0-dev',
      install_mode: 'user_level',
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      managed_agents: ['sf-orchestrator'],
      managed_agent_hashes: {},
      files: {},
    } as any;

    await mergeOpenCodeJsonUserLevel(tmpDir, sourceAgents, manifest, false);

    const result = readOpencodeJson();
    const agents = result.agent as Record<string, unknown>;
    expect(agents['sf-orchestrator']).toBeDefined();
    // sf-custom has user prompt, not a SpecForge file ref — should be preserved
    expect(agents['sf-custom']).toBeDefined();
  });
});
