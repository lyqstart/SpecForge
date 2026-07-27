/**
 * id-rules.ts — SpecForge v1.1 集中 ID 规则（§3）
 *
 * 所有 ID 正则必须集中实现（§3.3），禁止每个 Gate、Parser、Agent 工具各写一套正则。
 */
export const MODULE_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,11}$/;

export function isValidModuleCode(code: string): boolean {
  return MODULE_CODE_PATTERN.test(code);
}

export const WI_ID_PATTERN = /^WI-[0-9]{4}$/;
export const REQ_ID_PATTERN = /^REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;
export const AC_ID_PATTERN = /^AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}$/;
export const DD_ID_PATTERN = /^DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;
export const ARCH_ID_PATTERN = /^ARCH-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;
export const DATA_ID_PATTERN = /^DATA-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;
export const CP_ID_PATTERN = /^CP-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/;
export const TASK_ID_PATTERN = /^TASK-WI-[0-9]{4}-[0-9]{3}$/;

export function isValidWorkItemId(id: string): boolean {
  return WI_ID_PATTERN.test(id);
}
export function isValidRequirementId(id: string): boolean {
  return REQ_ID_PATTERN.test(id);
}
export function isValidAcceptanceCriteriaId(id: string): boolean {
  return AC_ID_PATTERN.test(id);
}
export function isValidDesignDecisionId(id: string): boolean {
  return DD_ID_PATTERN.test(id);
}
export function isValidArchitectureId(id: string): boolean {
  return ARCH_ID_PATTERN.test(id);
}
export function isValidDataModelId(id: string): boolean {
  return DATA_ID_PATTERN.test(id);
}
export function isValidCorrectnessPropertyId(id: string): boolean {
  return CP_ID_PATTERN.test(id);
}
export function isValidTaskId(id: string): boolean {
  return TASK_ID_PATTERN.test(id);
}

export function extractModuleFromReqId(reqId: string): string | null {
  const match = reqId.match(/^REQ-([A-Z][A-Z0-9]{1,11})-[0-9]{3}$/);
  return match ? match[1] : null;
}
export function extractModuleFromAcId(acId: string): string | null {
  const match = acId.match(/^AC-([A-Z][A-Z0-9]{1,11})-[0-9]{3}-[0-9]{2}$/);
  return match ? match[1] : null;
}
export function extractModuleFromDdId(ddId: string): string | null {
  const match = ddId.match(/^DD-([A-Z][A-Z0-9]{1,11})-[0-9]{3}$/);
  return match ? match[1] : null;
}
export function extractWiFromTaskId(taskId: string): string | null {
  const match = taskId.match(/^TASK-(WI-[0-9]{4})-[0-9]{3}$/);
  return match ? match[1] : null;
}
