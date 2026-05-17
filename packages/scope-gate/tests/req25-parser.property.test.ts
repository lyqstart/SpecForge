/**
 * Property-based tests for Req25Parser
 * 
 * Feature: scope-gate
 * Property Test: Parse round-trip consistency (Validates: Property SG-1)
 * 
 * Property SG-1: Parse → Serialize → Parse again should produce identical results
 * This ensures the parser produces consistent, idempotent outputs.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Req25Parser } from '../src/req25-parser.js';

describe('Req25Parser Property Tests', () => {
  const parser = new Req25Parser();

  /**
   * Property SG-1: Parse round-trip consistency
   * For all valid REQ-25 markdown inputs, parsing twice should produce identical results.
   * 
   * This validates that the parser is deterministic and idempotent.
   */
  describe('Property SG-1: Parse Round-trip Consistency', () => {
    /**
     * Validates: Property SG-1
     * 
     * Property: Parse round-trip consistency
     * - Parse REQ-25 → Serialize → Parse again → Results should be identical
     */
    it('should produce identical results when parsing the same input twice', () => {
      return fc.assert(
        fc.property(
          fcMarkdownWithReq25(),
          (markdown) => {
            // Act: Parse twice
            const result1 = parser.parseReq25(markdown);
            const result2 = parser.parseReq25(markdown);
            
            // Assert: Results should be identical
            expect(result1.p0.length).toBe(result2.p0.length);
            expect(result1.p1.length).toBe(result2.p1.length);
            expect(result1.p2.length).toBe(result2.p2.length);
            
            // Compare capability IDs (they should be in the same order)
            expect(result1.p0.map(c => c.id)).toEqual(result2.p0.map(c => c.id));
            expect(result1.p1.map(c => c.id)).toEqual(result2.p1.map(c => c.id));
            expect(result1.p2.map(c => c.id)).toEqual(result2.p2.map(c => c.id));
            
            // Compare scope tags
            result1.p0.forEach((cap, i) => {
              expect(cap.scopeTag).toBe(result2.p0[i].scopeTag);
            });
            result1.p1.forEach((cap, i) => {
              expect(cap.scopeTag).toBe(result2.p1[i].scopeTag);
            });
            result1.p2.forEach((cap, i) => {
              expect(cap.scopeTag).toBe(result2.p2[i].scopeTag);
            });
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Property SG-1
     * 
     * Property: All parsed capabilities have valid scope tags
     */
    it('should always assign valid scope tags to all capabilities', () => {
      return fc.assert(
        fc.property(
          fcMarkdownWithReq25(),
          (markdown) => {
            const result = parser.parseReq25(markdown);
            
            const validScopeTags = ['p0', 'p1', 'p2'];
            
            // Check P0 capabilities
            result.p0.forEach(cap => {
              expect(validScopeTags).toContain(cap.scopeTag);
              expect(cap.scopeTag).toBe('p0');
            });
            
            // Check P1 capabilities
            result.p1.forEach(cap => {
              expect(validScopeTags).toContain(cap.scopeTag);
              expect(cap.scopeTag).toBe('p1');
            });
            
            // Check P2 capabilities
            result.p2.forEach(cap => {
              expect(validScopeTags).toContain(cap.scopeTag);
              expect(cap.scopeTag).toBe('p2');
            });
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Property SG-1
     * 
     * Property: normalizeCapabilityId is idempotent
     * Running normalize twice should produce the same result
     */
    it('should produce idempotent capability IDs', () => {
      return fc.assert(
        fc.property(
          fcCapabilityName(),
          (name) => {
            const id1 = parser.normalizeCapabilityId(name);
            const id2 = parser.normalizeCapabilityId(id1);
            
            // Normalizing an already-normalized ID should produce the same result
            expect(id1).toBe(id2);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Property SG-1
     * 
     * Property: normalizeCapabilityId produces deterministic results
     * Same input always produces same output
     */
    it('should produce deterministic capability IDs', () => {
      return fc.assert(
        fc.property(
          fcCapabilityName(),
          (name) => {
            const results = new Set<string>();
            
            // Run normalization 10 times for the same input
            for (let i = 0; i < 10; i++) {
              results.add(parser.normalizeCapabilityId(name));
            }
            
            // All results should be identical
            expect(results.size).toBe(1);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Property SG-1
     * 
     * Property: Empty or whitespace inputs produce empty results
     */
    it('should handle empty and whitespace inputs gracefully', () => {
      return fc.assert(
        fc.property(
          fcWhitespace(),
          (whitespace) => {
            const result = parser.parseReq25(whitespace);
            
            // Should return empty arrays, not crash
            expect(result.p0).toEqual([]);
            expect(result.p1).toEqual([]);
            expect(result.p2).toEqual([]);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

/**
 * Arbitrary: Generate valid REQ-25 markdown with various capability formats
 */
function fcMarkdownWithReq25(): fc.Arbitrary<string> {
  return fc.oneof(
    fcSimpleP0P1P2(),
    fcChineseFormat(),
    fcEnglishFormat(),
    fcMixedFormat()
  );
}

/**
 * Simple P0/P1/P2 format
 */
function fcSimpleP0P1P2(): fc.Arbitrary<string> {
  return fc.record({
    p0: fc.array(fcCapabilityName(), { maxLength: 5 }),
    p1: fc.array(fcCapabilityName(), { maxLength: 5 }),
    p2: fc.array(fcCapabilityName(), { maxLength: 5 }),
  }).map(({ p0, p1, p2 }) => `
### Requirement 25: Scope Boundaries

#### Acceptance Criteria

1. P0 capabilities: ${p0.join('、')}

2. P1 capabilities: ${p1.join('、')}

3. P2 capabilities: ${p2.join('、')}
`);
}

/**
 * Chinese format similar to parent spec
 */
function fcChineseFormat(): fc.Arbitrary<string> {
  return fc.record({
    p0: fc.array(fcChineseCapabilityName(), { maxLength: 3 }),
    p1: fc.array(fcChineseCapabilityName(), { maxLength: 3 }),
    p2: fc.array(fcChineseCapabilityName(), { maxLength: 3 }),
  }).map(({ p0, p1, p2 }) => `
### Requirement 25: V6.0 开发范围边界

#### Acceptance Criteria

1. THE Requirements_Document SHALL 以列表形式列出 V6.0 P0 必做项，包含 ${p0.join('、')}

2. THE Requirements_Document SHALL 列出 V6.1 P1 项，包含 ${p1.join('、')}

3. THE Requirements_Document SHALL 列出 V6.x P2 项，包含 ${p2.join('、')}
`);
}

/**
 * English format
 */
function fcEnglishFormat(): fc.Arbitrary<string> {
  return fc.record({
    p0: fc.array(fcEnglishCapabilityName(), { maxLength: 3 }),
    p1: fc.array(fcEnglishCapabilityName(), { maxLength: 3 }),
    p2: fc.array(fcEnglishCapabilityName(), { maxLength: 3 }),
  }).map(({ p0, p1, p2 }) => `
### Requirement 25: Scope Boundaries

1. P0 capabilities (required for V6.0):
   - ${p0.join('\n   - ')}

2. P1 capabilities (V6.1):
   - ${p1.join('\n   - ')}

3. P2 capabilities (V6.x):
   - ${p2.join('\n   - ')}
`);
}

/**
 * Mixed Chinese-English format
 */
function fcMixedFormat(): fc.Arbitrary<string> {
  return fc.record({
    p0: fc.tuple(fcChineseCapabilityName(), fcEnglishCapabilityName()),
    p1: fc.tuple(fcChineseCapabilityName(), fcEnglishCapabilityName()),
    p2: fc.tuple(fcChineseCapabilityName(), fcEnglishCapabilityName()),
  }).map(({ p0, p1, p2 }) => `
### Requirement 25: V6.0 Scope

1. P0 (V6.0 required):
   - ${p0[0]}
   - ${p0[1]}

2. P1 (V6.1):
   - ${p1[0]}
   - ${p1[1]}

3. P2 (V6.x future):
   - ${p2[0]}
   - ${p2[1]}
`);
}

/**
 * Arbitrary: Generate capability names
 */
function fcCapabilityName(): fc.Arbitrary<string> {
  return fc.oneof(
    fcEnglishCapabilityName(),
    fcChineseCapabilityName(),
    fcMixedCapabilityName()
  );
}

/**
 * Arbitrary: English capability names
 */
function fcEnglishCapabilityName(): fc.Arbitrary<string> {
  const words = ['bugfix', 'workflow', 'knowledge', 'graph', 'daemon', 'session', 'config', 'plugin', 'tool', 'skill', 'api', 'auth', 'database', 'cache', 'queue', 'event', 'log', 'metric', 'alert', 'webhook'];
  const suffixes = ['workflow', 'engine', 'handler', 'manager', 'service', 'provider', 'builder', 'generator', 'validator', 'checker'];
  
  return fc.oneof(
    fc.constantFrom(...words),
    fc.tuple(fc.constantFrom(...words), fc.constantFrom(...words))
      .map(([w1, w2]) => `${w1}-${w2}`),
    fc.tuple(fc.constantFrom(...words), fc.constantFrom(...suffixes))
      .map(([w, s]) => `${w}-${s}`)
  );
}

/**
 * Arbitrary: Chinese capability names
 */
function fcChineseCapabilityName(): fc.Arbitrary<string> {
  const prefixes = ['全局', '用户', '系统', '数据', '消息', '任务', '会话', '权限', '配置', '日志'];
  const cores = ['知识库', '工作流', '调度器', '管理器', '处理器', '构建器', '验证器', '分析器'];
  const suffixes = ['服务', '模块', '组件', '引擎', '框架', '平台', '工具', '系统'];
  
  return fc.oneof(
    fc.constantFrom('知识图谱', '工作流引擎', '任务调度', '权限管理', '配置中心', '日志系统', '监控告警', '多机同步'),
    fc.tuple(fc.constantFrom(...prefixes), fc.constantFrom(...cores))
      .map(([p, c]) => `${p}${c}`),
    fc.tuple(fc.constantFrom(...cores), fc.constantFrom(...suffixes))
      .map(([c, s]) => `${c}${s}`)
  );
}

/**
 * Arbitrary: Mixed Chinese-English capability names
 */
function fcMixedCapabilityName(): fc.Arbitrary<string> {
  return fc.tuple(fcChineseCapabilityName(), fcEnglishCapabilityName())
    .map(([cn, en]) => `${cn} + ${en}`);
}

/**
 * Arbitrary: Whitespace-only strings
 */
function fcWhitespace(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\n\n\n'),
    fc.constant('\t\t\t'),
    fc.constant(' \n \t \n '),
    fc.stringOf(fc.constantFrom(' ', '\n', '\t', '\r'), { maxLength: 20 })
      .filter(s => s.trim().length === 0)
  );
}