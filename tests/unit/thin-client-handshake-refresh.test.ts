import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DaemonClient } from '../../setup/userlevel-opencode/tools/lib/thin-client';

describe('retained thin client consumes current handshake before sending', () => {
  let root: string;
  let handshake: string;
  const servers: Server[] = [];
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sf-handshake-refresh-'));
    handshake = join(root, 'sf-user/runtime/handshake.json');
    mkdirSync(dirname(handshake), { recursive: true });
    vi.stubEnv('OPENCODE_CONFIG_DIR', root);
  });
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    }
    vi.unstubAllEnvs();
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('sf-handshake-refresh-')) throw Error('UNSAFE_TEST_CLEANUP');
    rmSync(root, { recursive: true, force: true });
  });
  async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('TCP_ADDRESS_REQUIRED');
    return address.port;
  }
  function bind(port: number, token: string, contract = 'task-document/v1') {
    writeFileSync(handshake, JSON.stringify({ pid: process.pid, port, token, bound_to: '127.0.0.1', startedAt: Date.now(), schema_version: '1.0', artifact_contract_versions: { task_document: contract } }));
  }
  function reply(response: ServerResponse, data: unknown) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ success: true, data }));
  }
  it('uses the new endpoint and token on the same instance without contacting the obsolete listener', async () => {
    const seen: string[] = [];
    const oldPort = await listen((req, res) => { seen.push('old:' + req.headers.authorization); reply(res, 'old'); });
    const newPort = await listen((req, res) => { seen.push('new:' + req.headers.authorization); reply(res, 'new'); });
    bind(oldPort, 'fixture-old');
    const client = new DaemonClient();
    expect(await client.call('GET', '/fixture', undefined, { projectRoot: root })).toBe('old');
    bind(newPort, 'fixture-new');
    expect(await client.call('GET', '/fixture', undefined, { projectRoot: root }, { retry: false })).toBe('new');
    expect(seen).toEqual(['old:Bearer fixture-old', 'new:Bearer fixture-new']);
  });
  it.each(['missing', 'invalid'] as const)('rejects %s current handshake before contacting the cached endpoint', async mode => {
    let requests = 0;
    const port = await listen((_req, res) => { requests++; reply(res, 'obsolete'); });
    bind(port, 'fixture-old');
    const client = new DaemonClient();
    if (mode === 'missing') unlinkSync(handshake); else bind(port, 'fixture-new', 'unsupported-contract');
    await expect(client.call('POST', '/fixture', {}, { projectRoot: root })).rejects.toThrow(mode === 'missing' ? 'handshake file not found' : 'artifact contract mismatch');
    expect(requests).toBe(0);
  });
  it('uses the reloaded endpoint after a definite authentication refusal during rotation', async () => {
    const seen: string[] = [];
    const newPort = await listen((req, res) => { seen.push('new:' + req.headers.authorization); reply(res, 'new'); });
    const oldPort = await listen((req, res) => { seen.push('old:' + req.headers.authorization); bind(newPort, 'fixture-new'); res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: { code: 'AUTH_REQUIRED', message: 'fixture refusal before execution' } })); });
    bind(oldPort, 'fixture-old');
    expect(await new DaemonClient().call('POST', '/fixture', {}, { projectRoot: root })).toBe('new');
    expect(seen).toEqual(['old:Bearer fixture-old', 'new:Bearer fixture-new']);
  });
});
