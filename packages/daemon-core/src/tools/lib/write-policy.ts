/**
 * write-policy.ts — Thin re-export barrel for backward compatibility
 *
 * All types, rules, and evaluation functions are canonically defined in
 * write-guard-v11.ts.  This file re-exports them so that existing consumers
 * (bash-guard.ts, command-write-audit.ts, etc.) continue to compile without
 * changes while the canonical source is write-guard-v11.ts.
 *
 * New code should import directly from './write-guard-v11.js' instead.
 */

export type {
  WritePolicyRule,
  WritePolicyContext,
  WritePolicyResult,
  WriteGuardContext,
  WriteCheckResult,
} from './write-guard-v11.js';

export {
  DEFAULT_WRITE_POLICY_RULES,
  evaluatePolicy,
  checkWrite,
  enforceWritePolicy,
} from './write-guard-v11.js';
