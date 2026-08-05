import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const handoffPath = join(
  repoRoot,
  'docs/implementation/architecture-consistency/current-handoff.md',
);
const p0Path = join(
  repoRoot,
  'docs/implementation/architecture-consistency/P0-contract-consumer-closure.md',
);
const experiencePath = join(
  repoRoot,
  'docs/rule/specforge-development-error-ledger-and-experience.md',
);

describe('P0 parent phase and subtask lifecycle boundary', () => {
  it('keeps P0 in progress and prevents starting P1 from a closed V64 subtask', () => {
    const handoff = readFileSync(handoffPath, 'utf-8');
    const p0 = readFileSync(p0Path, 'utf-8');
    const experience = readFileSync(experiencePath, 'utf-8');

    expect(handoff).toContain('V64_TASK_STATUS=CLOSED');
    expect(handoff).toContain(
      'P0_PHASE1_STATUS=REAL_PROJECT_VALIDATED_AT_APPROVAL_REQUIRED',
    );
    expect(handoff).toContain('P0_OVERALL_STATUS=IN_PROGRESS');
    expect(handoff).toContain('P1_ACTION=NOT_STARTED');
    expect(handoff).toContain(
      'NEXT_ACTION=RESOLVE_P0_CONTINUATION_BOUNDARY_BEFORE_P1',
    );
    expect(handoff).toContain('P0_CONTINUATION_BOUNDARY=ISOLATED_REAL_PROJECT');
    expect(handoff).toContain(
      'P0_VALIDATION_PROJECT=D:\\code\\temp\\SpecForge-P0-Validation',
    );
    expect(handoff).toContain('WORKDESK_WI0004_ACTION=NONE');
    expect(handoff).toContain(
      'NEXT_ACTION=USER_MANUALLY_OPEN_OPENCODE_AND_PASTE_VERIFIED_UNICODE_WI0001',
    );
    expect(handoff).toContain(
      'P0_VALIDATION_PROJECT_RELATION_TO_PHASE11=NOT_PHASE11_EVIDENCE',
    );
    expect(handoff).not.toMatch(/^CURRENT_TASK_STATUS=CLOSED\s*$/m);
    expect(handoff).not.toMatch(
      /^NEXT_ACTION=START_NEXT_AUTHORITY_PHASE_ONLY_AFTER_NEW_IMPACT_ANALYSIS\s*$/m,
    );

    expect(p0).toContain('> **状态**：IN_PROGRESS');
    expect(p0).toContain(
      'P0_PHASE1_STATUS=REAL_PROJECT_VALIDATED_AT_APPROVAL_REQUIRED',
    );
    expect(p0).toContain('P0_OVERALL_STATUS=IN_PROGRESS');
    expect(p0).toContain('P1_ACTION=NOT_STARTED');
    expect(p0).toContain(
      '项目路径=D:\\code\\temp\\SpecForge-P0-Validation',
    );
    expect(p0).toContain('与Phase 11关系=不构成Phase 11完成证据');
    expect(p0).toContain(
      'INSUFFICIENT_EVIDENCE=CODE_PERMISSION,ACTUAL_CODE_CONSUMER,DESTRUCTIVE_CHANGE,PROMOTION,MERGE,VERIFICATION,CLOSE',
    );
    expect(p0).toContain(
      'P0_COMPLETION_EVIDENCE_MISSING=CODE_PERMISSION,ACTUAL_CODE_CONSUMER,DESTRUCTIVE_CHANGE,PROMOTION,MERGE,VERIFICATION,CLOSE',
    );

    expect(experience).toContain(
      '### ERR-108：V64子任务关闭状态被无作用域地写成当前任务关闭，并把P0未完成状态错误投影为可进入下一阶段',
    );
    expect(experience).toContain(
      '## EXP-086：子任务关闭不能覆盖父阶段生命周期',
    );
    expect(experience).toContain(
      '父阶段未满足关闭条件或仍有INSUFFICIENT_EVIDENCE时，后续阶段保持NOT_STARTED',
    );
    expect(experience).toContain(
      '### ERR-109：V65修改状态生产者后遗漏两个既有固定文本消费者，正确状态被旧CURRENT_TASK_STATUS断言阻断',
    );
    expect(experience).toContain(
      '## EXP-087：状态生产者变更必须先完成全消费者清单再冻结范围',
    );
    expect(handoff).toContain(
      '## V65测试消费者漂移与V66闭包边界（2026-08-05）',
    );
    expect(p0).toContain(
      '### 25.46 ERR-109状态生产者与固定文本消费者原子同步',
    );
    expect(experience).toContain(
      '### ERR-110：V66历史失败复现错误复用V66当前目标补丁，V65旧测试被目标修复提前消除',
    );
    expect(experience).toContain(
      '## EXP-088：历史失败验证必须消费不可变历史证据，不能复用当前目标补丁',
    );
    expect(handoff).toContain(
      '## V66历史失败伪复现与V67闭包边界（2026-08-05）',
    );
    expect(p0).toContain(
      '### 25.47 ERR-110历史失败复现不得复用当前目标补丁',
    );
    expect(experience).toContain(
      '### ERR-111：V67草稿状态文档再次产生额外EOF空白行，被git diff --check阻断',
    );
    expect(experience).toContain(
      '### ERR-112：V67隔离证据使用普通git diff，遗漏8aed中不存在的新增测试文件',
    );
    expect(experience).toContain(
      '## EXP-089：包含新增文件的Git证据必须从Manifest精确暂存集合生成',
    );
    expect(handoff).toContain(
      '## V67封包前ERR-111—ERR-112闭包（2026-08-05）',
    );
    expect(p0).toContain(
      '### 25.48 ERR-111—ERR-112封包格式与完整Git证据集合',
    );
    expect(handoff).toContain('ERR115_STATUS=CLOSED');
    expect(handoff).toContain('ERR116_STATUS=CLOSED');
    expect(handoff).toContain('ERR117_STATUS=CLOSED');
    expect(handoff).toContain('V70_FAILURE_RECONCILIATION=PASS_TEST_DRIFT_EXACT_2');
    expect(handoff).toContain('WI0001_ACTION=NOT_PERFORMED');
    expect(p0).toContain('### 25.52 V68成功与ERR-115 Windows Unicode提示词传输边界');
    expect(p0).toContain('### 25.53 V69 CMD脚本调用假失败与ERR-116验证器闭包');
    expect(p0).toContain('### 25.54 V70固定文本消费者漂移与ERR-117稳定状态闭包');
    expect(p0).toContain('### 25.55 WI-0001新模块Candidate Manifest生产者与Gate消费者闭包');
    expect(p0).toContain('NEXT_ACTION=PRODUCT_FIX_AND_DEPLOY_BEFORE_SINGLE_GATE_RESUME');
    expect(p0).toContain('### 25.57 V72封包前ERR-122断言参数闭包');
    expect(p0).toContain('### 25.58 V72 Bun命令入口解析失败与ERR-123验证器闭包');
    expect(p0).toContain('### 25.59 V73 workspace声明未准备与ERR-124验证顺序闭包');
    expect(handoff).toContain('## V73工作区类型声明顺序失败、ERR-124与V74验证器闭包边界（2026-08-05）');
  });
});
