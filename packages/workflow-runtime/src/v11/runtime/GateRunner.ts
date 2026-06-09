/**
 * GateRunner.ts — SpecForge v1.1 Gate Runner
 *
 * Executes gate checks and generates gate reports.
 * Transitions work item to approval_required on pass, gates_failed on fail.
 *
 * Requirements: 3.5, 3.6, 3.7, 3.8, 3.9
 */


// ---- v1.1 Standard Types ----

/** v1.1 Standard Gate Report structure */
export interface V11GateReport {
  schema_version: '1.0';
  work_item_id: string;
  gate_id: string;
  gate_type: 'hard_gate' | 'soft_gate';
  required: boolean;
  status: 'passed' | 'failed' | 'skipped';
  input_files: string[];
  checks: Array<{ name: string; passed: boolean; description?: string }>;
  blocking_issues: string[];
  warnings: string[];
  waiver_allowed: boolean;
  runner: string;
  started_at: string;
  finished_at: string;
}

// ---- Types ----

export interface GateCheckResult {
  gate_id: string;
  passed: boolean;
  status: 'passed' | 'failed' | 'skipped' | 'waived';
  reason: string;
  details?: Record<string, unknown>;
  executed_at: string;
}

export interface GateSummaryResult {
  total_gates: number;
  passed: number;
  failed: number;
  skipped: number;
  waived: number;
  all_passed: boolean;
}

export interface GateDefinition {
  gate_id: string;
  gate_type: 'hard_gate' | 'soft_gate';
  required: boolean;
  checkFn: () => GateCheckResult | Promise<GateCheckResult>;
}

export interface GateExecutionResult {
  all_passed: boolean;
  results: GateCheckResult[];
  summary: GateSummaryResult;
}

/**
 * GateRunner — executes gate checks and generates reports.
 *
 * Requirements: 3.5-3.9
 */
export class GateRunner {
  private readonly gateDefinitions: Map<string, GateDefinition> = new Map();

  /**
   * Register a gate definition.
   */
  registerGate(definition: GateDefinition): void {
    this.gateDefinitions.set(definition.gate_id, definition);
  }

  /**
   * Run all registered gates.
   * Requirements: 3.5, 3.6, 3.7
   */
  async runGates(): Promise<GateExecutionResult> {
    const results: GateCheckResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let waived = 0;

    for (const [gateId, definition] of this.gateDefinitions) {
      try {
        const result = await definition.checkFn();
        results.push(result);

        switch (result.status) {
          case 'passed': passed++; break;
          case 'failed': failed++; break;
          case 'skipped': skipped++; break;
          case 'waived': waived++; break;
        }
      } catch (err) {
        const errorResult: GateCheckResult = {
          gate_id: gateId,
          passed: false,
          status: 'failed',
          reason: `Gate execution error: ${err instanceof Error ? err.message : String(err)}`,
          executed_at: new Date().toISOString(),
        };
        results.push(errorResult);
        failed++;
      }
    }

    const summary: GateSummaryResult = {
      total_gates: results.length,
      passed,
      failed,
      skipped,
      waived,
      all_passed: failed === 0,
    };

    return {
      all_passed: summary.all_passed,
      results,
      summary,
    };
  }

  /**
   * Generate gate_summary.md content.
   * Requirement: 3.7
   */
  generateGateSummaryMarkdown(result: GateExecutionResult): string {
    const lines: string[] = [
      '# Gate Summary',
      '',
      `**Executed At**: ${new Date().toISOString()}`,
      `**Total Gates**: ${result.summary.total_gates}`,
      `**Passed**: ${result.summary.passed}`,
      `**Failed**: ${result.summary.failed}`,
      `**Skipped**: ${result.summary.skipped}`,
      `**Waived**: ${result.summary.waived}`,
      `**Overall**: ${result.all_passed ? '✅ PASSED' : '❌ FAILED'}`,
      '',
      '## Gate Results',
      '',
    ];

    for (const gate of result.results) {
      const statusIcon = gate.status === 'passed' ? '✅' : gate.status === 'failed' ? '❌' : '⏭️';
      lines.push(`### ${statusIcon} ${gate.gate_id}`);
      lines.push(`- **Status**: ${gate.status}`);
      lines.push(`- **Reason**: ${gate.reason}`);
      if (gate.details) {
        lines.push(`- **Details**: ${JSON.stringify(gate.details)}`);
      }
      lines.push(`- **Executed At**: ${gate.executed_at}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Validate a v1.1 Gate Report.
   * Rejects old structures (gate_name, details-only).
   */
  validateV11GateReport(report: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const r = report as Record<string, unknown>;

    if (!r || typeof r !== 'object') {
      return { valid: false, errors: ['Gate report must be an object'] };
    }

    // Old field rejection
    if ('gate_name' in r && !('gate_id' in r)) {
      errors.push('Old "gate_name" field detected. v1.1 requires "gate_id"');
    }
    if ('details' in r && !('checks' in r)) {
      errors.push('Old "details" field detected. v1.1 requires "checks" array');
    }

    // Required fields
    const requiredFields = ['gate_id', 'gate_type', 'required', 'status', 'input_files', 'checks', 'blocking_issues', 'warnings', 'waiver_allowed', 'runner', 'started_at', 'finished_at'];
    for (const field of requiredFields) {
      if (!(field in r)) {
        errors.push(`Missing required field: "${field}"`);
      }
    }

    // gate_type must be hard_gate or soft_gate
    if (r.gate_type && r.gate_type !== 'hard_gate' && r.gate_type !== 'soft_gate') {
      errors.push(`gate_type must be "hard_gate" or "soft_gate", got "${r.gate_type}"`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Determine the next state based on gate results.
   * Requirements: 3.8, 3.9
   */
  determineNextState(result: GateExecutionResult): 'approval_required' | 'gates_failed' {
    return result.all_passed ? 'approval_required' : 'gates_failed';
  }
}
