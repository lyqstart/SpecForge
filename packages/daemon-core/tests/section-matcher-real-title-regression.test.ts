import { describe, expect, it } from 'vitest';
import { buildTolerantHeaderRegex } from '../src/tools/lib/sf_section_matcher';

function solutionStrategyPattern(): RegExp {
  return buildTolerantHeaderRegex('Solution Strategy', {
    minLevel: 1,
    maxLevel: 6,
    requireHashSpace: true,
    allowNumberPrefix: true,
  });
}

describe('shared tolerant section matcher — real governance titles', () => {
  it('accepts the exact WorkDesk Architecture Candidate title', () => {
    expect(
      solutionStrategyPattern().test(
        '## 5. Solution Strategy — 架构决策（逐字继承现有设计事实）'
      )
    ).toBe(true);
  });

  it('retains canonical and direct-parenthetical compatibility', () => {
    expect(solutionStrategyPattern().test('## 5. Solution Strategy')).toBe(true);
    expect(solutionStrategyPattern().test('## 5. Solution Strategy（本次范围）')).toBe(true);
    expect(solutionStrategyPattern().test('## 5. Solution Strategy (current scope)')).toBe(true);
  });

  it('accepts controlled same-line dash and colon explanations', () => {
    expect(
      solutionStrategyPattern().test('## 5. Solution Strategy - Architecture decisions')
    ).toBe(true);
    expect(
      solutionStrategyPattern().test('## 5. Solution Strategy – Architecture decisions')
    ).toBe(true);
    expect(
      solutionStrategyPattern().test('## 5. Solution Strategy: Architecture decisions')
    ).toBe(true);
    expect(solutionStrategyPattern().test('## 5. Solution Strategy：架构决策')).toBe(true);
  });

  it('rejects embedded names, uncontrolled suffixes, and empty explanations', () => {
    expect(solutionStrategyPattern().test('## 5. 关于 Solution Strategy 的说明')).toBe(false);
    expect(solutionStrategyPattern().test('## 5. Solution Strategy arbitrary suffix')).toBe(false);
    expect(solutionStrategyPattern().test('## 5. Pre Solution Strategy — note')).toBe(false);
    expect(solutionStrategyPattern().test('## 5. Solution Strategy —   ')).toBe(false);
  });

  it('never consumes the first evidence bullet below a canonical heading', () => {
    const pattern = buildTolerantHeaderRegex('原始证据来源', {
      minLevel: 2,
      maxLevel: 3,
      requireHashSpace: false,
    });
    const content = [
      '## 原始证据来源',
      '- 一级原始证据 EV-1：源码。',
      '- 一级原始证据 EV-2：运行日志。',
    ].join('\n');
    const match = pattern.exec(content);
    expect(match?.[0]).toBe('## 原始证据来源');
  });

  it('never treats a next-line separator as a same-line title annotation', () => {
    const content = ['## 5. Solution Strategy', '- first body bullet'].join('\n');
    const match = solutionStrategyPattern().exec(content);
    expect(match?.[0]).toBe('## 5. Solution Strategy');
  });
});
