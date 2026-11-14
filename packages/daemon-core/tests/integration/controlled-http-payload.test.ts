import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { EventBus } from '../../src/event-bus/EventBus';
import '../../src/tools/index';
import { ReconnectingDaemonClient } from '../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client';
import { DaemonClient } from '../../../../setup/userlevel-opencode/tools/lib/thin-client';

const LIMIT = 1024 * 1024;
const INVOKE = '/api/v1/tool/invoke';
const NATIVE = '/api/v1/v11/write-guard/native';
const token = 'synthetic-payload-token';

describe('controlled HTTP full-envelope admission', () => {
  let server: HTTPServer;
  let port: number;
  let owned: string;
  let plugin: ReconnectingDaemonClient;
  const dispatch = vi.fn(async (_request: unknown) => ({ success: true }));

  beforeEach(async () => {
    owned = await fs.mkdtemp(join(tmpdir(), 'sf-http-payload-'));
    const configRoot = join(owned, 'config');
    const runtime = join(configRoot, 'sf-user', 'runtime');
    await fs.mkdir(runtime, { recursive: true });
    vi.stubEnv('OPENCODE_CONFIG_DIR', configRoot);
    dispatch.mockReset().mockResolvedValue({ success: true });
    server = new HTTPServer({
      config: new DaemonConfig([]),
      eventBus: new EventBus(),
      toolDispatcher: { dispatch } as never,
    });
    server.setToken(token);
    ({ port } = await server.start());
    const handshakePath = join(runtime, 'handshake.json');
    await fs.writeFile(
      handshakePath,
      JSON.stringify({
        schema_version: '1.0',
        pid: process.pid,
        port,
        token,
        bound_to: '127.0.0.1',
        startedAt: Date.now(),
        artifact_contract_versions: { task_document: 'task-document/v1' },
      })
    );
    plugin = new ReconnectingDaemonClient({ handshakePath });
  });

  afterEach(async () => {
    plugin?.dispose();
    await server?.stop();
    vi.unstubAllEnvs();
    await fs.rm(owned, { recursive: true, force: true });
  });

  function request(
    route: string,
    body: string,
    options: { auth?: boolean; chunked?: boolean } = {}
  ) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const headers: http.OutgoingHttpHeaders = { 'Content-Type': 'application/json' };
      if (options.auth !== false) headers.authorization = `Bearer ${token}`;
      if (!options.chunked) headers['Content-Length'] = Buffer.byteLength(body);
      const req = http.request(
        { hostname: '127.0.0.1', port, path: route, method: 'POST', headers },
        res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        }
      );
      req.on('error', reject);
      if (options.chunked) {
        const bytes = Buffer.from(body);
        for (let offset = 0; offset < bytes.length; offset += 4096)
          req.write(bytes.subarray(offset, offset + 4096));
        req.end();
      } else req.end(body);
    });
  }

  it('carries Chinese escaped content unchanged through both installed client templates', async () => {
    const args = {
      file_type: 'candidate_requirements',
      work_item_id: 'WI-9001',
      module_id: 'CORE',
      content: '需求\\"\n'.repeat(9000),
    };
    expect(Buffer.byteLength(JSON.stringify(args))).toBeGreaterThan(65536);
    await plugin.checkNativeTool(owned, 'sf_artifact_write', args);
    const result = await new DaemonClient().invokeTool(
      'sf_artifact_write',
      args,
      { directory: owned, agent: 'sf-requirements' },
      { retry: false }
    );
    expect(result).toEqual({ success: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      tool: 'sf_artifact_write',
      args,
      context: { directory: owned, agent: 'sf-requirements' },
    });
  });

  it.each([INVOKE, NATIVE])(
    'accepts exactly one MiB on %s without replacing nested data',
    async route => {
      const envelope =
        route === INVOKE
          ? { tool: 'sf_artifact_write', args: { content: '', data: 'literal' } }
          : {
              projectPath: owned,
              tool: 'sf_artifact_write',
              args: { content: '', data: 'literal' },
            };
      envelope.args.content = 'x'.repeat(LIMIT - Buffer.byteLength(JSON.stringify(envelope)));
      const body = JSON.stringify(envelope);
      expect(Buffer.byteLength(body)).toBe(LIMIT);
      const result = await request(route, body, { chunked: true });
      expect(result.status).toBe(200);
      if (route === INVOKE) expect(dispatch.mock.calls[0][0]).toMatchObject(envelope);
      else expect(JSON.parse(result.body).data.allowed).toBe(true);
    }
  );

  it.each([false, true])('rejects limit+1 before dispatch (chunked=%s)', async chunked => {
    const result = await request(INVOKE, ' '.repeat(LIMIT + 1), { chunked });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('authenticates before oversized-data CAS or handlers', async () => {
    const store = vi.fn();
    Object.assign(server, { cas: { store } });
    const result = await request(INVOKE, JSON.stringify({ data: 'x'.repeat(70000) }), {
      auth: false,
    });
    expect(result.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('never lets an unauthenticated public endpoint create CAS content', async () => {
    const store = vi.fn();
    Object.assign(server, { cas: { store } });
    expect(
      (await request('/health', JSON.stringify({ data: 'x'.repeat(70000) }), { auth: false }))
        .status
    ).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects a chunked overflow before the sender ends the request', async () => {
    const result = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: INVOKE,
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'Transfer-Encoding': 'chunked' },
        },
        res => {
          res.resume();
          res.on('end', () => {
            resolve(res.statusCode ?? 0);
            req.destroy();
          });
        }
      );
      req.on('error', reject);
      req.write('x'.repeat(LIMIT + 1));
      // Intentionally no end(): response must not wait for EOF.
    });
    expect(result).toBe(413);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps unknown native tools denied with full large arguments', async () => {
    const result = await request(
      NATIVE,
      JSON.stringify({ projectPath: owned, tool: 'invalid', args: { content: 'x'.repeat(70000) } })
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).data.allowed).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('preserves owner rejection after admission', async () => {
    dispatch.mockRejectedValueOnce(new Error('Permission denied: synthetic owner refusal'));
    const result = await request(
      INVOKE,
      JSON.stringify({ tool: 'sf_artifact_write', args: { content: 'x'.repeat(70000) } })
    );
    expect(result.status).toBe(403);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not extend the ordinary-route envelope or accept malformed JSON', async () => {
    expect(
      (await request('/api/v1/state/read', JSON.stringify({ content: 'x'.repeat(70000) }))).status
    ).toBe(413);
    expect((await request(INVOKE, '{' + ' '.repeat(70000))).status).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
