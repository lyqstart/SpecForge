import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOWS_DIR = path.resolve(__dirname, '../../configs/workflows/builtin');

describe('Full Feature Spec Flow', () => {
  it('feature_spec.json has complete happy path from intake to completed', () => {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, 'feature_spec.json'), 'utf-8');
    const wf = JSON.parse(content);
    
    // Trace happy path
    const visited = new Set<string>();
    let current = wf.stateMachine.initial;
    
    while (current && !visited.has(current)) {
      visited.add(current);
      const state = wf.stateMachine.states[current];
      if (!state || !state.next) break;
      
      if (typeof state.next === 'object' && state.next.pass) {
        current = state.next.pass;
      } else if (typeof state.next === 'string') {
        current = state.next;
      } else {
        break;
      }
    }
    
    expect(visited.has('intake')).toBe(true);
    expect(visited.has('requirements')).toBe(true);
    expect(visited.has('design')).toBe(true);
    expect(visited.has('tasks')).toBe(true);
    expect(visited.has('development')).toBe(true);
    expect(visited.has('review')).toBe(true);
    expect(visited.has('verification')).toBe(true);
    expect(visited.has('completed')).toBe(true);
  });

  it('all workflows can reach completed from initial', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
      const wf = JSON.parse(content);
      
      // BFS from initial
      const queue = [wf.stateMachine.initial];
      const visited = new Set<string>();
      let reachedCompleted = false;
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        
        if (current === 'completed') {
          reachedCompleted = true;
          break;
        }
        
        const state = wf.stateMachine.states[current];
        if (!state?.next) continue;
        
        const targets = typeof state.next === 'string'
          ? [state.next]
          : Object.values(state.next) as string[];
        
        for (const t of targets) {
          if (!visited.has(t)) queue.push(t);
        }
      }
      
      expect(reachedCompleted, `${file}: cannot reach completed from ${wf.stateMachine.initial}`).toBe(true);
    }
  });
});
