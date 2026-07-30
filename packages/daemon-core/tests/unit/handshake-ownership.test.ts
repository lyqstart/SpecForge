import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { HandshakeManager } from '../../src/daemon/HandshakeManager.js';
import type { DaemonConfig } from '../../src/daemon/DaemonConfig.js';

describe('HandshakeManager ownership-safe cleanup', () => {
  let root: string;
  let handshakePath: string;
  let config: DaemonConfig;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-handshake-ownership-'));
    handshakePath = path.join(root, 'handshake.json');
    config = {
      getHandshakeFile: () => handshakePath,
      getDaemonVersion: () => 'test',
      isServiceMode: () => false,
    } as unknown as DaemonConfig;
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not delete a handshake that this manager never wrote', async () => {
    const foreign = {
      schema_version: '1.0',
      pid: 123,
      port: 456,
      token: 'foreign',
      startedAt: 1,
      version: 'test',
      serviceMode: false,
      artifact_contract_versions: { task_document: '1.0' },
    };
    await fs.writeFile(handshakePath, JSON.stringify(foreign));

    const manager = new HandshakeManager(config);
    await manager.cleanup();

    expect(JSON.parse(await fs.readFile(handshakePath, 'utf-8'))).toEqual(foreign);
  });

  it('deletes the handshake when the current file still matches this manager', async () => {
    const manager = new HandshakeManager(config);
    await manager.writeHandshake(123, 456, 'owned');
    await manager.cleanup();

    await expect(fs.access(handshakePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a handshake replaced by another daemon after this manager wrote', async () => {
    const manager = new HandshakeManager(config);
    await manager.writeHandshake(123, 456, 'owned');
    const foreign = {
      schema_version: '1.0',
      pid: 999,
      port: 777,
      token: 'replacement',
      startedAt: Date.now() + 1,
      version: 'test',
      serviceMode: false,
      artifact_contract_versions: { task_document: '1.0' },
    };
    await fs.writeFile(handshakePath, JSON.stringify(foreign));

    await manager.cleanup();

    expect(JSON.parse(await fs.readFile(handshakePath, 'utf-8'))).toEqual(foreign);
  });
});
