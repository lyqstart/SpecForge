/**
 * Runtime-owned design-scope policy.
 *
 * The required analysis scope is derived from authoritative trigger facts and
 * can be consumed before a Design Agent writes an artifact. Gate validation
 * imports the same policy, preventing prompt/runtime drift.
 */

import { readFile } from 'node:fs/promises';
import {
  legacyWorkItemSpecArtifact,
  workItemTriggerResult,
} from '@specforge/types/directory-layout';

export type DesignAnalysisScope = 'solution_design' | 'system_governance';

export interface SystemGovernanceRequirement {
  required: boolean;
  reasons: string[];
  source_path?: string;
  blocking_issue?: string;
}

const SYSTEM_GOVERNANCE_WORKFLOW_PATHS = new Set([
  'architecture_change_path',
  'design_change_path',
]);

const CHANGE_CLASSIFICATION_BOOLEAN_KEYS = [
  'requirement_changed',
  'acceptance_criteria_changed',
  'business_rule_changed',
  'user_visible_behavior_changed',
  'data_semantics_changed',
  'design_changed',
  'module_boundary_changed',
  'api_contract_changed',
  'architecture_changed',
] as const;

const SYSTEM_GOVERNANCE_CLASSIFICATION_KEYS = [
  'business_rule_changed',
  'data_semantics_changed',
  'design_changed',
  'module_boundary_changed',
  'api_contract_changed',
  'architecture_changed',
] as const;

const ANALYSIS_SCOPE_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?analysis_scope(?:\*\*)?\s*:\s*(solution_design|system_governance)\s*$/im;

export function evaluateSystemGovernanceRequirement(
  triggerResult: unknown
): SystemGovernanceRequirement {
  if (typeof triggerResult !== 'object' || triggerResult === null) {
    return {
      required: false,
      reasons: [],
      blocking_issue: 'trigger_result.json 必须是 JSON 对象',
    };
  }

  const trigger = triggerResult as {
    workflow_path?: unknown;
    classification?: unknown;
  };
  const reasons: string[] = [];

  if (typeof trigger.workflow_path !== 'string' || trigger.workflow_path.trim().length === 0) {
    return {
      required: false,
      reasons: [],
      blocking_issue: 'trigger_result.json 缺少有效 workflow_path',
    };
  }

  if (typeof trigger.classification !== 'object' || trigger.classification === null) {
    return {
      required: false,
      reasons: [],
      blocking_issue: 'trigger_result.json 缺少有效 classification',
    };
  }

  const classification = trigger.classification as Record<string, unknown>;
  const invalidBooleanKeys = CHANGE_CLASSIFICATION_BOOLEAN_KEYS.filter(
    key => typeof classification[key] !== 'boolean'
  );
  if (invalidBooleanKeys.length > 0 || !Array.isArray(classification.unknowns)) {
    const invalidFields = [
      ...invalidBooleanKeys.map(key => `classification.${key}`),
      ...(!Array.isArray(classification.unknowns) ? ['classification.unknowns'] : []),
    ];
    return {
      required: false,
      reasons: [],
      blocking_issue: `trigger_result.json classification 不完整或类型错误: ${invalidFields.join(', ')}`,
    };
  }

  if (SYSTEM_GOVERNANCE_WORKFLOW_PATHS.has(trigger.workflow_path)) {
    reasons.push(`workflow_path=${trigger.workflow_path}`);
  }

  for (const key of SYSTEM_GOVERNANCE_CLASSIFICATION_KEYS) {
    if (classification[key] === true) {
      reasons.push(`classification.${key}=true`);
    }
  }

  const unknowns = classification.unknowns as unknown[];
  if (unknowns.length > 0) {
    reasons.push(`classification.unknowns=${unknowns.length}`);
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}

export async function resolveSystemGovernanceRequirement(
  workItemId: string,
  baseDir: string
): Promise<SystemGovernanceRequirement> {
  const candidatePaths = [
    workItemTriggerResult(baseDir, workItemId),
    legacyWorkItemSpecArtifact(baseDir, workItemId, 'trigger_result.json'),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const content = await readFile(candidatePath, 'utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return {
          required: false,
          reasons: [],
          source_path: candidatePath,
          blocking_issue: `trigger_result.json 不是合法 JSON: ${(err as Error).message}`,
        };
      }

      return {
        ...evaluateSystemGovernanceRequirement(parsed),
        source_path: candidatePath,
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') continue;
      return {
        required: false,
        reasons: [],
        source_path: candidatePath,
        blocking_issue: `Failed to read trigger_result.json: ${error.message}`,
      };
    }
  }

  return {
    required: false,
    reasons: [],
    blocking_issue: 'trigger_result.json not found；无法确定 Design Agent analysis_scope',
  };
}

export function readDeclaredDesignAnalysisScope(content: string): DesignAnalysisScope | null {
  const match = ANALYSIS_SCOPE_PATTERN.exec(content);
  return (match?.[1] as DesignAnalysisScope | undefined) ?? null;
}

export function hasSystemGovernanceScope(content: string): boolean {
  return readDeclaredDesignAnalysisScope(content) === 'system_governance';
}
