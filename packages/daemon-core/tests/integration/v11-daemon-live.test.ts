import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

interface Handshake { pid: number; port: number; token: string; }

describe('v1.1 Live Daemon Integration', () => {
  let port: number;
  let token: string;
  let baseUrl: string;
  const projectDir = 'D:\\code\\temp\\SpecForge';

  beforeAll(() => {
    // Read handshake from legacy location (daemon still writes here)
    const handshakePath = path.join(os.homedir(), '.specforge', 'runtime', 'handshake.json');
    if (!fs.existsSync(handshakePath)) {
      throw new Error(`Daemon handshake not found at ${handshakePath}. Is daemon running?`);
    }
    const h: Handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
    port = h.port;
    token = h.token;
    baseUrl = `http://localhost:${port}`;
  });

  async function invokeTool(tool: string, args: Record<string, any>): Promise<any> {
    const body = JSON.stringify({ tool, args, context: { directory: projectDir } });
    const res = await fetch(`${baseUrl}/api/v1/tool/invoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });
    const json = await res.json();
    return json.data ?? json;
  }

  it('daemon is alive', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('v1.1 forbidden transition: created → implementation_running is BLOCKED', async () => {
    const result = await invokeTool('sf_state_transition', {
      work_item_id: 'WI-LIVE-V11-001',
      from_state: 'created',
      to_state: 'implementation_running',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Forbidden transition');
  });

  it('v1.1 forbidden transition: approval_required → merging is BLOCKED', async () => {
    const result = await invokeTool('sf_state_transition', {
      work_item_id: 'WI-LIVE-V11-002',
      from_state: 'approval_required',
      to_state: 'merging',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Forbidden transition');
  });

  it('v1.1 forbidden transition: closed → any is BLOCKED', async () => {
    const result = await invokeTool('sf_state_transition', {
      work_item_id: 'WI-LIVE-V11-003',
      from_state: 'closed',
      to_state: 'intake_ready',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Forbidden transition');
  });

  it('v1.1 forbidden transition: merged → closed is BLOCKED', async () => {
    const result = await invokeTool('sf_state_transition', {
      work_item_id: 'WI-LIVE-V11-004',
      from_state: 'merged',
      to_state: 'closed',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Forbidden transition');
  });

  it('v1.1 forbidden transition: blocked → closed is BLOCKED', async () => {
    const result = await invokeTool('sf_state_transition', {
      work_item_id: 'WI-LIVE-V11-005',
      from_state: 'blocked',
      to_state: 'closed',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Forbidden transition');
  });

  it('daemon has extension_gate registered', async () => {
    const result = await invokeTool('sf_gate_run', {
      work_item_id: 'WI-LIVE-V11-006',
      gate_ids: ['extension_gate'],
    });
    // Gate might fail (no WI dir), but it shouldn't be "unknown gate"
    // It should either pass (no extension_request) or fail with file-not-found
    expect(result.error).not.toContain('Unknown gate');
  });
});
