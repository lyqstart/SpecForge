import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Daemon Wiring Integrity', () => {
  it('DaemonConfig uses handshake.json (not daemon.sock.json)', () => {
    const configPath = path.resolve(__dirname, '../../packages/daemon-core/src/daemon/DaemonConfig.ts');
    const content = fs.readFileSync(configPath, 'utf-8');
    
    expect(content).toContain('handshake.json');
    expect(content).not.toContain('daemon.sock.json');
  });

  it('thin-client reads from runtime/handshake.json', () => {
    const clientPath = path.resolve(__dirname, '../../.opencode/tools/lib/thin-client.ts');
    const content = fs.readFileSync(clientPath, 'utf-8');
    
    expect(content).toContain('runtime');
    expect(content).toContain('handshake.json');
  });

  it('Daemon instantiates cross-package modules', () => {
    const daemonPath = path.resolve(__dirname, '../../packages/daemon-core/src/daemon/Daemon.ts');
    const content = fs.readFileSync(daemonPath, 'utf-8');
    
    expect(content).toContain('PermissionEngine');
    expect(content).toContain('WorkflowEngine');
    expect(content).toContain('EventLogger');
    expect(content).toContain('ToolDispatcher');
  });

  it('HTTPServer accepts deps-based constructor', () => {
    const httpPath = path.resolve(__dirname, '../../packages/daemon-core/src/http/HTTPServer.ts');
    const content = fs.readFileSync(httpPath, 'utf-8');
    
    expect(content).toContain('HTTPServerDeps');
    expect(content).toContain('stateManager');
    expect(content).toContain('workflowEngine');
    expect(content).toContain('toolDispatcher');
  });

  it('EventBus has persistence hook', () => {
    const busPath = path.resolve(__dirname, '../../packages/daemon-core/src/event-bus/EventBus.ts');
    const content = fs.readFileSync(busPath, 'utf-8');
    
    expect(content).toContain('setPersistenceHook');
    expect(content).toContain('persistenceHook');
  });
});
