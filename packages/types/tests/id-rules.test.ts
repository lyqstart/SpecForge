/**
 * id-rules.test.ts — ID 规则单元测试（§3）
 *
 * 验证所有 ID 正则和校验函数。
 */

import { describe, it, expect } from 'vitest';

import {
  MODULE_CODE_PATTERN,
  WI_ID_PATTERN,
  REQ_ID_PATTERN,
  AC_ID_PATTERN,
  DD_ID_PATTERN,
  TASK_ID_PATTERN,
  isValidModuleCode,
  isValidWorkItemId,
  isValidRequirementId,
  isValidAcceptanceCriteriaId,
  isValidDesignDecisionId,
  isValidTaskId,
  extractModuleFromReqId,
  extractModuleFromAcId,
  extractModuleFromDdId,
  extractWiFromTaskId,
} from '../src/id-rules';

describe('MODULE_CODE（§3.1）', () => {
  it('accepts valid MODULE_CODE: AUTH', () => {
    expect(isValidModuleCode('AUTH')).toBe(true);
  });

  it('accepts valid MODULE_CODE: ORD2', () => {
    expect(isValidModuleCode('ORD2')).toBe(true);
  });

  it('accepts 2-char MODULE_CODE: AB', () => {
    expect(isValidModuleCode('AB')).toBe(true);
  });

  it('accepts 12-char MODULE_CODE (max length)', () => {
    expect(isValidModuleCode('ABCDEFGHIJKL')).toBe(true);
  });

  it('rejects single character', () => {
    expect(isValidModuleCode('A')).toBe(false);
  });

  it('rejects lowercase', () => {
    expect(isValidModuleCode('auth')).toBe(false);
  });

  it('rejects hyphens', () => {
    expect(isValidModuleCode('AU-TH')).toBe(false);
  });

  it('rejects underscores', () => {
    expect(isValidModuleCode('AU_TH')).toBe(false);
  });

  it('rejects starting with number', () => {
    expect(isValidModuleCode('1AUTH')).toBe(false);
  });

  it('rejects 13 chars (over max)', () => {
    expect(isValidModuleCode('ABCDEFGHIJKLM')).toBe(false);
  });
});

describe('WI ID（§3.2）', () => {
  it('accepts valid WI-0001', () => {
    expect(isValidWorkItemId('WI-0001')).toBe(true);
  });

  it('accepts valid WI-9999', () => {
    expect(isValidWorkItemId('WI-9999')).toBe(true);
  });

  it('rejects WI-001 (3 digits)', () => {
    expect(isValidWorkItemId('WI-001')).toBe(false);
  });

  it('rejects WI-00001 (5 digits)', () => {
    expect(isValidWorkItemId('WI-00001')).toBe(false);
  });

  it('rejects wi-0001 (lowercase)', () => {
    expect(isValidWorkItemId('wi-0001')).toBe(false);
  });
});

describe('REQ ID（§3.2）', () => {
  it('accepts valid REQ-AUTH-001', () => {
    expect(isValidRequirementId('REQ-AUTH-001')).toBe(true);
  });

  it('rejects REQ-001 (missing module)', () => {
    expect(isValidRequirementId('REQ-001')).toBe(false);
  });

  it('extracts module AUTH from REQ-AUTH-001', () => {
    expect(extractModuleFromReqId('REQ-AUTH-001')).toBe('AUTH');
  });

  it('returns null for invalid REQ ID', () => {
    expect(extractModuleFromReqId('INVALID')).toBeNull();
  });
});

describe('AC ID（§3.2）', () => {
  it('accepts valid AC-AUTH-001-01', () => {
    expect(isValidAcceptanceCriteriaId('AC-AUTH-001-01')).toBe(true);
  });

  it('extracts module AUTH from AC-AUTH-001-01', () => {
    expect(extractModuleFromAcId('AC-AUTH-001-01')).toBe('AUTH');
  });
});

describe('DD ID（§3.2）', () => {
  it('accepts valid DD-AUTH-001', () => {
    expect(isValidDesignDecisionId('DD-AUTH-001')).toBe(true);
  });

  it('extracts module AUTH from DD-AUTH-001', () => {
    expect(extractModuleFromDdId('DD-AUTH-001')).toBe('AUTH');
  });
});

describe('TASK ID（§3.2）', () => {
  it('accepts valid TASK-WI-0001-001', () => {
    expect(isValidTaskId('TASK-WI-0001-001')).toBe(true);
  });

  it('extracts WI-0001 from TASK-WI-0001-001', () => {
    expect(extractWiFromTaskId('TASK-WI-0001-001')).toBe('WI-0001');
  });

  it('returns null for invalid task ID', () => {
    expect(extractWiFromTaskId('INVALID')).toBeNull();
  });
});
