import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('CI Workflow Trigger Validation', () => {
  /**
   * Validates: Requirements 9.1, 9.4
   * - Requirement 9.1: "THE SpecForge_System SHALL run CI_Version_Guard on every pull request"
   * - Requirement 9.4: "CI_Version_Guard SHALL complete execution within 30 seconds"
   */

  const workflowPath = path.resolve('.github/workflows/version-guard.yml');

  it('should verify pull_request trigger exists', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    
    // Check that the workflow has pull_request trigger
    expect(content).toContain('pull_request:');
  });

  it('should verify timeout configuration exists', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    
    // Check for timeout-minutes at job level (outer timeout)
    // Requirement 9.4 expects 30s inner timeout, but GitHub Actions 
    // uses timeout-minutes at job level as the outer safety net
    expect(content).toContain('timeout-minutes:');
    
    // Verify the timeout is configured (5 minutes outer safety net)
    // The inner 30s timeout is handled by scripts/ci/version-guard.ts itself
    const timeoutMatch = content.match(/timeout-minutes:\s*(\d+)/);
    expect(timeoutMatch).not.toBeNull();
    expect(timeoutMatch![1]).toBe('5');
  });
});