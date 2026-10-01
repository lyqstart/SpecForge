import { describe, it, expect } from 'vitest';
import { guardBashCommand } from '../../src/tools/lib/bash-guard.js';

describe('guardBashCommand safety boundary', () => {
  it('blocks commands that are unsafe independently of authorization', () => {
    const result = guardBashCommand('sudo rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('dangerous');
  });

  it('does not perform write authorization', () => {
    expect(guardBashCommand('echo hello > file.txt')).toEqual({
      command: 'echo hello > file.txt',
      allowed: true,
    });
  });
});
