import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Tool Dispatcher E2E', () => {
  it('all 18 tool files import from thin-client', () => {
    const toolsDir = path.resolve(__dirname, '../../.opencode/tools');
    const files = fs.readdirSync(toolsDir).filter(f => f.startsWith('sf_') && f.endsWith('.ts'));
    
    expect(files.length).toBe(18);
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
      expect(content).toContain('thin-client');
      expect(content).toContain('async execute');
      expect(content).not.toContain('async handler');
    }
  });

  it('all tool files pass context to daemon', () => {
    const toolsDir = path.resolve(__dirname, '../../.opencode/tools');
    const files = fs.readdirSync(toolsDir).filter(f => f.startsWith('sf_') && f.endsWith('.ts'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
      expect(content).toContain('context.sessionID');
      expect(content).toContain('context.agent');
    }
  });

  it('all tool files return stringified results', () => {
    const toolsDir = path.resolve(__dirname, '../../.opencode/tools');
    const files = fs.readdirSync(toolsDir).filter(f => f.startsWith('sf_') && f.endsWith('.ts'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
      expect(content).toContain('JSON.stringify');
    }
  });

  it('18 handler stubs exist in daemon-core', () => {
    const handlersDir = path.resolve(__dirname, '../../packages/daemon-core/src/tools/handlers');
    const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.ts'));
    expect(files.length).toBe(18);
  });
});
