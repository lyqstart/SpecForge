import { describe, expect, it } from 'vitest';
import { renderVerificationReport as production } from '../src/tools/lib/sf_artifact_write_core';
import { renderVerificationReport as template } from '../../../setup/userlevel-opencode/tools/lib/sf_artifact_write_core';

const matrix = Object.fromEntries(
  [
    'L1_unit',
    'L2_integration',
    'L3_pbt',
    'L4_e2e',
    'L5_smoke',
    'L6_regression',
    'L7_performance',
    'L8_security',
    'L9_compatibility',
    'L10_uat',
  ].map(key => [key, 'skip'])
);

function report() {
  return {
    conclusion: 'blocked',
    test_matrix: matrix,
    verification_commands: [
      {
        command: 'synthetic verified command',
        status: 'pass',
        output_summary: 'synthetic receipt',
      },
      ...Array.from({ length: 3 }, (_, i) => ({
        command: `unexecuted ${i}`,
        status: 'skipped',
        output_summary: 'not executed',
      })),
    ],
    acceptance_criteria: Array.from({ length: 8 }, (_, i) => ({
      req_id: `REQ-${i}`,
      name: `criterion ${i}`,
      status: 'pass',
      evidence: `EV-${i}`,
    })),
    e2e_tests: Array.from({ length: 5 }, (_, i) => ({
      name: `browser ${i}`,
      status: 'fail',
      evidence: `EV-B${i}`,
    })),
    side_effects: 'none',
    summary: 'Required browser evidence remains missing.',
    semantic_closure: {},
  };
}

function counts(markdown: string) {
  const summary = markdown.split('## 结果汇总')[1].split('## 验证命令')[0];
  return Object.fromEntries(
    [...summary.matchAll(/^\| ([^|]+) \| (\d+) \|$/gm)].map(([, label, value]) => [
      label,
      Number(value),
    ])
  );
}

describe.each([
  ['production', production],
  ['deployment template', template],
] as const)('%s report accounting', (_name, render) => {
  it('separates skipped checks from passes without changing the structured evidence or conclusion', () => {
    const input = report();
    const output = render(JSON.stringify(input));
    expect(output).not.toBeNull();
    expect(counts(output!)).toEqual({ 总检查数: 17, 通过: 9, 失败: 5, 跳过: 3, 不适用: 0 });
    expect(output).toContain('| 结论 | blocked |');
    expect(JSON.parse(output!.match(/```json\n([\s\S]*?)\n```/)![1])).toEqual(input);
  });

  it('does not report a pass for skipped, inapplicable or failed checks', () => {
    const input = report();
    input.verification_commands = input.verification_commands.slice(1);
    input.acceptance_criteria = [
      { req_id: 'REQ-1', name: 'missing evidence', status: 'fail', evidence: 'EV-1' },
    ];
    input.e2e_tests = [{ name: 'inapplicable check', status: 'not_applicable', evidence: 'EV-NA' }];
    const output = render(JSON.stringify(input));
    expect(output).not.toBeNull();
    expect(counts(output!)).toEqual({ 总检查数: 5, 通过: 0, 失败: 1, 跳过: 3, 不适用: 1 });
    expect(output).toContain('| 结论 | blocked |');
  });
});

it('keeps the legacy template skip spelling out of passes', () => {
  const input = report();
  input.verification_commands[1].status = 'skip';
  expect(counts(template(JSON.stringify(input))!)).toEqual({
    总检查数: 17,
    通过: 9,
    失败: 5,
    跳过: 3,
    不适用: 0,
  });
});
