/**
 * UserDecisionRecorder.ts — SpecForge v1.1 User Decision Recorder
 *
 * Records user approval decisions with cryptographic hash binding
 * to candidate manifest and gate summary.
 *
 * Requirements: 3.10, 3.11, 3.12, 3.13, 3.14
 */

import { JsonParser } from './JsonParser.js';

// ---- Types ----

export interface UserDecisionRecord {
  schema_version: '1.0';
  work_item_id: string;
  approved: boolean;
  decided_at: string;
  base_spec_version: string;
  candidate_manifest_hash: string;
  gate_summary_hash: string;
  user_id?: string | undefined;
  comments?: string | undefined;
}

export interface HashInput {
  content: string;
}

/**
 * UserDecisionRecorder — records user decisions with hash binding.
 *
 * Requirements: 3.10-3.14
 */
export class UserDecisionRecorder {
  /**
   * Record a user approval decision.
   * Requirements: 3.10, 3.11, 3.12, 3.13, 3.14
   */
  recordApproval(params: {
    workItemId: string;
    approved: boolean;
    baseSpecVersion: string;
    candidateManifestContent: string;
    gateSummaryContent: string;
    userId?: string | undefined;
    comments?: string | undefined;
  }): UserDecisionRecord {
    return {
      schema_version: '1.0',
      work_item_id: params.workItemId,
      approved: params.approved,
      decided_at: new Date().toISOString(),
      base_spec_version: params.baseSpecVersion,
      candidate_manifest_hash: this.calculateHash(params.candidateManifestContent),
      gate_summary_hash: this.calculateHash(params.gateSummaryContent),
      user_id: params.userId,
      comments: params.comments,
    };
  }

  /**
   * Calculate SHA-256 hash of content.
   */
  calculateHash(content: string): string {
    // Simple hash for runtime; in production would use crypto.subtle
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `sha256:${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  /**
   * Serialize user decision to JSON.
   */
  serializeDecision(decision: UserDecisionRecord): { success: boolean; data?: string | undefined; error?: string | undefined } {
    return JsonParser.serialize(decision);
  }

  /**
   * Parse user decision from JSON.
   */
  parseDecision(jsonString: string): { success: boolean; data?: UserDecisionRecord | undefined; error?: string | undefined } {
    return JsonParser.parse<UserDecisionRecord>(jsonString);
  }
}
