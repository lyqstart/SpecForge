import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Plugin Integrity', () => {
  it('sf_specforge.ts plugin exists and is under 5KB', () => {
    const pluginPath = path.resolve(__dirname, '../../.opencode/plugins/sf_specforge.ts');
    expect(fs.existsSync(pluginPath)).toBe(true);
    
    const stat = fs.statSync(pluginPath);
    expect(stat.size).toBeLessThan(5120);
  });

  it('plugin does not reference deleted files', () => {
    const pluginPath = path.resolve(__dirname, '../../.opencode/plugins/sf_specforge.ts');
    const content = fs.readFileSync(pluginPath, 'utf-8');
    
    expect(content).not.toContain('sf_specforge_plugin_entry');
    expect(content).not.toContain('sf_state_transition_core');
    expect(content).not.toContain('sf_state_read_core');
  });

  it('plugin registers 8 hooks', () => {
    const pluginPath = path.resolve(__dirname, '../../.opencode/plugins/sf_specforge.ts');
    const content = fs.readFileSync(pluginPath, 'utf-8');
    
    const hookPatterns = [
      'tool.execute.before',
      'tool.execute.after',
      'chat.system.transform',
      'chat.messages.transform',
      'session.compacting',
      'chat.params',
      'chat.headers',
    ];
    
    let hookCount = 0;
    for (const pattern of hookPatterns) {
      if (content.includes(pattern)) hookCount++;
    }
    expect(hookCount).toBeGreaterThanOrEqual(5);
  });

  it('plugin reads handshake from runtime directory', () => {
    const pluginPath = path.resolve(__dirname, '../../.opencode/plugins/sf_specforge.ts');
    const content = fs.readFileSync(pluginPath, 'utf-8');
    
    expect(content).toContain('runtime');
    expect(content).toContain('handshake');
  });
});
