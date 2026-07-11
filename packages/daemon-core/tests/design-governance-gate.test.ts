import { describe, expect, it } from 'vitest';
import {
  checkDesignGateDesignFirst,
  checkSystemGovernanceContent,
  SYSTEM_GOVERNANCE_SECTIONS,
} from '../src/tools/lib/sf_design_gate_core';

function systemGovernanceDocument(
  verdict:
    | 'reuse_existing'
    | 'extend_existing'
    | 'new_capability_required'
    | 'blocked' = 'extend_existing',
  overrides: Partial<Record<(typeof SYSTEM_GOVERNANCE_SECTIONS)[number], string>> = {},
  extraMetadata = ''
): string {
  const defaultBodies: Record<(typeof SYSTEM_GOVERNANCE_SECTIONS)[number], string> = {
    'Problem Understanding': '当前症状来自设计治理责任未沿既有治理链完整传递，需要区分表象与根因。',
    'Existing Architecture Analysis':
      '现有架构由 Standard、Contract、Workflow Skill、Agent、Tool、Runtime 与 Audit 组成，模块和接口边界已经核对。',
    'Governance Classification':
      '问题主要位于 Contract、Workflow Skill 与 Audit 的衔接处，不属于缺少执行 Tool。',
    'Existing Capability Assessment':
      'Standard 可定义规则，Contract 可统一方法，Skill 可负责触发，Agent 可执行分析，Tool 可受控执行，Runtime 可维护状态，因此现有体系可通过最小扩展承载。',
    'Solution Strategy':
      '复用现有 Design Agent 与 Design Gate，只扩展既有契约、触发规则和校验逻辑，不新增治理层。',
    'Impact Analysis':
      '影响现行标准、设计 Agent、相关 Workflow Skill、Design Gate 及回归测试，不改变状态机和产物注册。',
    'Verification Plan':
      '执行静态契约测试、Gate 单元测试、daemon-core 构建、完整回归测试和两个真实 Work Item 验收。',
  };

  const sections = SYSTEM_GOVERNANCE_SECTIONS.map((name, index) => {
    const body = overrides[name] ?? defaultBodies[name];
    return `## ${index + 1}. ${name}\n\n${body}`;
  }).join('\n\n');

  return `analysis_scope: system_governance\ncapability_verdict: ${verdict}\n${extraMetadata}\n\n${sections}`;
}

describe('Design Governance gate', () => {
  it('does not change ordinary solution_design behavior when governance is optional', () => {
    const result = checkSystemGovernanceContent(
      'analysis_scope: solution_design\n\n## 普通设计\n局部方案。'
    );
    expect(result.status).toBe('pass');
  });

  it('requires an explicit system_governance declaration when the workflow requires it', () => {
    const result = checkSystemGovernanceContent('## 设计\n普通内容。', true);
    expect(result.status).toBe('fail');
    expect(result.blocking_issues.some(issue => issue.includes('analysis_scope'))).toBe(true);
  });

  it('passes a complete system governance analysis', () => {
    const result = checkSystemGovernanceContent(systemGovernanceDocument());
    expect(result.status).toBe('pass');
    expect(result.details?.analysis_scope).toBe('system_governance');
    expect(result.details?.capability_verdict).toBe('extend_existing');
  });

  it('fails when any required governance section is missing or empty', () => {
    const result = checkSystemGovernanceContent(
      systemGovernanceDocument('extend_existing', { 'Impact Analysis': '' })
    );
    expect(result.status).toBe('fail');
    expect(result.blocking_issues.some(issue => issue.includes('Impact Analysis'))).toBe(true);
  });

  it('returns blocked when Design Agent declares insufficient evidence', () => {
    const result = checkSystemGovernanceContent(systemGovernanceDocument('blocked'));
    expect(result.status).toBe('blocked');
    expect(result.next_action).toBe('ask_user');
  });

  it('rejects new capability claims without proof across existing governance layers', () => {
    const result = checkSystemGovernanceContent(
      systemGovernanceDocument(
        'new_capability_required',
        {
          'Existing Capability Assessment': '现有机制无法满足，因此需要新增能力。',
        },
        'new_capability_justification: 现有能力不够。'
      )
    );
    expect(result.status).toBe('fail');
    expect(
      result.blocking_issues.some(issue => issue.includes('new_capability_justification'))
    ).toBe(true);
    expect(
      result.blocking_issues.some(issue => issue.includes('Standard') && issue.includes('Runtime'))
    ).toBe(true);
  });

  it('accepts new capability only with sufficient justification and layer-by-layer assessment', () => {
    const result = checkSystemGovernanceContent(
      systemGovernanceDocument(
        'new_capability_required',
        {
          'Existing Capability Assessment':
            'Standard 无法表达该外部信任域，Contract 无法授权，Skill 无可用流程，Agent 无对应角色能力，Tool 无受控原语，Runtime 无隔离模型，因此逐层扩展仍不能承载。',
        },
        'new_capability_justification: 该需求引入全新的外部信任域和隔离模型，现有各层即使最小扩展也无法保持既有安全不变量，因此必须经审批新增受控能力。'
      )
    );
    expect(result.status).toBe('pass');
    expect(result.details?.capability_verdict).toBe('new_capability_required');
  });

  it('forces system governance for design-first before architecture completeness checks', () => {
    const ordinaryDesign = `
# 架构概述
现有模块和组件边界清楚。

## 数据模型与接口
定义接口和数据模型。
`;
    const result = checkDesignGateDesignFirst(ordinaryDesign);
    expect(result.status).toBe('fail');
    expect(result.blocking_issues.some(issue => issue.includes('analysis_scope'))).toBe(true);
  });

  it('passes design-first when governance and architecture checks are both complete', () => {
    const complete = `${systemGovernanceDocument()}\n\n## 架构概述\n模块与组件边界、数据模型和接口均已定义。`;
    const result = checkDesignGateDesignFirst(complete);
    expect(result.status).toBe('pass');
  });
});
