/**
 * id-rules.ts — SpecForge v1.1 集中 ID 规则（§3）
 *
 * 所有 ID 正则必须集中实现（§3.3），禁止每个 Gate、Parser、Agent 工具各写一套正则。
 *
 * 固定 ID 正则（§3.2）：
 * - WI:      WI-[0-9]{4}
 * - REQ:     REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
 * - AC:      AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}
 * - DD:      DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
 * - TASK:    TASK-WI-[0-9]{4}-[0-9]{3}
 *
 * MODULE_CODE（§3.1）：[A-Z][A-Z0-9]{1,11}
 */

// ---------------------------------------------------------------------------
// MODULE_CODE（§3.1）
// ---------------------------------------------------------------------------

/**
 * MODULE_CODE 正则（§3.1）。
 * 2 到 12 位，必须以大写字母开头，只允许大写字母和数字。
 */
export const MODULE_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,11}$/;

/**
 * 校验字符串是否为合法 MODULE_CODE。
 */
export function isValidModuleCode(code: string): boolean {
  return MODULE_CODE_PATTERN.test(code);
}

// ---------------------------------------------------------------------------
// 固定 ID 正则（§3.2）
// ---------------------------------------------------------------------------

/**
 * Work Item ID 正则：WI-[0-9]{4}
 */
export const WI_ID_PATTERN = /^WI-[0-9]{4}$/;

/**
 * Requirement ID 正则：REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
 */
export const REQ_ID_PATTERN = /^REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;

/**
 * Acceptance Criteria ID 正则：AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}
 */
export const AC_ID_PATTERN = /^AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}$/;

/**
 * Design Decision ID 正则：DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
 */
export const DD_ID_PATTERN = /^DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;

/**
 * Task ID 正则：TASK-WI-[0-9]{4}-[0-9]{3}
 */
export const TASK_ID_PATTERN = /^TASK-WI-[0-9]{4}-[0-9]{3}$/;

// ---------------------------------------------------------------------------
// 校验函数
// ---------------------------------------------------------------------------

/**
 * 校验字符串是否为合法 Work Item ID。
 */
export function isValidWorkItemId(id: string): boolean {
  return WI_ID_PATTERN.test(id);
}

/**
 * 校验字符串是否为合法 Requirement ID。
 */
export function isValidRequirementId(id: string): boolean {
  return REQ_ID_PATTERN.test(id);
}

/**
 * 校验字符串是否为合法 Acceptance Criteria ID。
 */
export function isValidAcceptanceCriteriaId(id: string): boolean {
  return AC_ID_PATTERN.test(id);
}

/**
 * 校验字符串是否为合法 Design Decision ID。
 */
export function isValidDesignDecisionId(id: string): boolean {
  return DD_ID_PATTERN.test(id);
}

/**
 * 校验字符串是否为合法 Task ID。
 */
export function isValidTaskId(id: string): boolean {
  return TASK_ID_PATTERN.test(id);
}

/**
 * 从 REQ ID 中提取 MODULE_CODE。
 * 例：REQ-AUTH-001 → AUTH
 */
export function extractModuleFromReqId(reqId: string): string | null {
  const match = reqId.match(/^REQ-([A-Z][A-Z0-9]{1,11})-[0-9]{3}$/);
  return match ? match[1] : null;
}

/**
 * 从 AC ID 中提取 MODULE_CODE。
 * 例：AC-AUTH-001-01 → AUTH
 */
export function extractModuleFromAcId(acId: string): string | null {
  const match = acId.match(/^AC-([A-Z][A-Z0-9]{1,11})-[0-9]{3}-[0-9]{2}$/);
  return match ? match[1] : null;
}

/**
 * 从 DD ID 中提取 MODULE_CODE。
 * 例：DD-AUTH-001 → AUTH
 */
export function extractModuleFromDdId(ddId: string): string | null {
  const match = ddId.match(/^DD-([A-Z][A-Z0-9]{1,11})-[0-9]{3}$/);
  return match ? match[1] : null;
}

/**
 * 从 TASK ID 中提取 WI ID。
 * 例：TASK-WI-0001-001 → WI-0001
 */
export function extractWiFromTaskId(taskId: string): string | null {
  const match = taskId.match(/^TASK-(WI-[0-9]{4})-[0-9]{3}$/);
  return match ? match[1] : null;
}
