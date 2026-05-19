/**
 * schema-version-manager 单元测试
 * 
 * 覆盖 SchemaVersionManager 三个核心方法的所有场景：
 * - parseTuple: 合法/非法格式
 * - assertMonotonic: null/相等/上升/下降四种情况
 * - compareForHealthCheck: 三态完整 + 反对称性
 * 
 * Requirements: 6.5, 6.6
 */

import { describe, it, expect } from 'vitest';
import { SchemaVersionManager } from '../../src/distribution/schema-version-manager';

describe('SchemaVersionManager', () => {
  describe('parseTuple', () => {
    it('should parse valid versions correctly', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.parseTuple('1.0')).toEqual([1, 0]);
      expect(svm.parseTuple('1.10')).toEqual([1, 10]);
      expect(svm.parseTuple('2.0')).toEqual([2, 0]);
      expect(svm.parseTuple('10.25')).toEqual([10, 25]);
      expect(svm.parseTuple('0.1')).toEqual([0, 1]);
    });

    it('should throw on invalid format: single number', () => {
      const svm = new SchemaVersionManager();
      
      expect(() => svm.parseTuple('1')).toThrow(/expected "MAJOR\.MINOR" with exactly one dot/i);
    });

    it('should throw on invalid format: non-numeric characters', () => {
      const svm = new SchemaVersionManager();
      
      expect(() => svm.parseTuple('a.b')).toThrow(/MAJOR and MINOR must be integers/i);
      expect(() => svm.parseTuple('1.b')).toThrow(/MAJOR and MINOR must be integers/i);
      expect(() => svm.parseTuple('a.0')).toThrow(/MAJOR and MINOR must be integers/i);
    });

    it('should throw on invalid format: empty string', () => {
      const svm = new SchemaVersionManager();
      
      expect(() => svm.parseTuple('')).toThrow(/empty string/i);
      expect(() => svm.parseTuple('   ')).toThrow(/empty string/i);
    });

    it('should throw on invalid format: trailing non-numeric characters', () => {
      const svm = new SchemaVersionManager();
      
      expect(() => svm.parseTuple('1.0a')).toThrow(/contains non-numeric characters/i);
      expect(() => svm.parseTuple('1a.0')).toThrow(/contains non-numeric characters/i);
      expect(() => svm.parseTuple('1.0.0')).toThrow(/expected "MAJOR\.MINOR" with exactly one dot/i);
    });

    it('should throw on invalid format: missing dot', () => {
      const svm = new SchemaVersionManager();
      
      expect(() => svm.parseTuple('10')).toThrow(/expected "MAJOR\.MINOR" with exactly one dot/i);
    });

    it('should throw on invalid format: multiple dots', () => {
      const svm = new SchemaVersionManager();
      
      expect(() => svm.parseTuple('1.0.0')).toThrow(/expected "MAJOR\.MINOR" with exactly one dot/i);
      expect(() => svm.parseTuple('1..0')).toThrow(/expected "MAJOR\.MINOR" with exactly one dot/i);
    });
  });

  describe('assertMonotonic', () => {
    it('should allow first publish (highestPublished === null)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('1.0', null);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should allow equal versions', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('1.0', '1.0');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow ascending versions (minor increment)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('1.1', '1.0');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow ascending versions (major increment)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('2.0', '1.10');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow ascending versions (large jump)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('5.0', '1.0');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject descending versions (minor decrement)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('1.0', '1.1');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PUBLISH_BASELINE_DOWNGRADE');
      expect(result.errors[0].field).toBe('schema_version');
      expect(result.errors[0].message).toContain('1.0');
      expect(result.errors[0].message).toContain('1.1');
      expect(result.errors[0].message).toContain('downgrade');
    });

    it('should reject descending versions (major decrement)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('1.0', '2.0');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PUBLISH_BASELINE_DOWNGRADE');
      expect(result.errors[0].message).toContain('1.0');
      expect(result.errors[0].message).toContain('2.0');
    });

    it('should reject descending versions (large gap)', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('1.5', '3.2');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PUBLISH_BASELINE_DOWNGRADE');
    });

    it('should handle parse errors in candidate baseline', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('invalid', '1.0');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PUBLISH_VALIDATION');
      expect(result.errors[0].field).toBe('schema_version');
      expect(result.errors[0].message).toContain('Failed to parse');
    });

    it('should handle parse errors in highest published', () => {
      const svm = new SchemaVersionManager();
      
      const result = svm.assertMonotonic('2.0', 'invalid');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PUBLISH_VALIDATION');
      expect(result.errors[0].message).toContain('Failed to parse');
    });
  });

  describe('compareForHealthCheck', () => {
    it('should return "equal" for identical versions', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.compareForHealthCheck('1.0', '1.0')).toBe('equal');
      expect(svm.compareForHealthCheck('2.5', '2.5')).toBe('equal');
      expect(svm.compareForHealthCheck('10.25', '10.25')).toBe('equal');
    });

    it('should return "code_higher" when baseline > disk (minor)', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.compareForHealthCheck('1.0', '1.1')).toBe('code_higher');
      expect(svm.compareForHealthCheck('2.5', '2.10')).toBe('code_higher');
    });

    it('should return "code_higher" when baseline > disk (major)', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.compareForHealthCheck('1.0', '2.0')).toBe('code_higher');
      expect(svm.compareForHealthCheck('1.10', '3.0')).toBe('code_higher');
    });

    it('should return "code_lower" when baseline < disk (minor)', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.compareForHealthCheck('1.1', '1.0')).toBe('code_lower');
      expect(svm.compareForHealthCheck('2.10', '2.5')).toBe('code_lower');
    });

    it('should return "code_lower" when baseline < disk (major)', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.compareForHealthCheck('2.0', '1.0')).toBe('code_lower');
      expect(svm.compareForHealthCheck('3.0', '1.10')).toBe('code_lower');
    });

    it('should demonstrate antisymmetry: compare(a, b) === "code_higher" ⇔ compare(b, a) === "code_lower"', () => {
      const svm = new SchemaVersionManager();
      
      // Test case 1: 1.0 vs 1.1
      expect(svm.compareForHealthCheck('1.0', '1.1')).toBe('code_higher');
      expect(svm.compareForHealthCheck('1.1', '1.0')).toBe('code_lower');
      
      // Test case 2: 1.5 vs 2.0
      expect(svm.compareForHealthCheck('1.5', '2.0')).toBe('code_higher');
      expect(svm.compareForHealthCheck('2.0', '1.5')).toBe('code_lower');
      
      // Test case 3: 3.10 vs 5.2
      expect(svm.compareForHealthCheck('3.10', '5.2')).toBe('code_higher');
      expect(svm.compareForHealthCheck('5.2', '3.10')).toBe('code_lower');
    });

    it('should handle parse errors gracefully (return code_higher)', () => {
      const svm = new SchemaVersionManager();
      
      // 当解析失败时，保守处理：视为不相等且代码更高（触发 migration 提示）
      expect(svm.compareForHealthCheck('invalid', '1.0')).toBe('code_higher');
      expect(svm.compareForHealthCheck('1.0', 'invalid')).toBe('code_higher');
      expect(svm.compareForHealthCheck('', '1.0')).toBe('code_higher');
    });

    it('should verify three-state completeness', () => {
      const svm = new SchemaVersionManager();
      
      // 对于任意两个合法版本，结果必定是三态之一
      const testCases: Array<[string, string]> = [
        ['1.0', '1.0'],   // equal
        ['1.0', '1.1'],   // code_higher
        ['1.1', '1.0'],   // code_lower
        ['2.0', '1.0'],   // code_lower
        ['1.0', '2.0'],   // code_higher
        ['5.10', '5.10'], // equal
      ];
      
      for (const [disk, baseline] of testCases) {
        const result = svm.compareForHealthCheck(disk, baseline);
        expect(['equal', 'code_higher', 'code_lower']).toContain(result);
      }
    });

    it('should verify code_higher is strictly greater than (tuple comparison)', () => {
      const svm = new SchemaVersionManager();
      
      // code_higher 当且仅当 tuple 比较严格大于
      const higherCases: Array<[string, string]> = [
        ['1.0', '1.1'],   // (1,0) < (1,1)
        ['1.0', '2.0'],   // (1,0) < (2,0)
        ['1.5', '1.10'],  // (1,5) < (1,10)
        ['2.0', '3.0'],   // (2,0) < (3,0)
      ];
      
      for (const [disk, baseline] of higherCases) {
        expect(svm.compareForHealthCheck(disk, baseline)).toBe('code_higher');
        
        // 验证 tuple 确实严格大于
        const diskTuple = svm.parseTuple(disk);
        const baselineTuple = svm.parseTuple(baseline);
        const isStrictlyGreater = 
          baselineTuple[0] > diskTuple[0] ||
          (baselineTuple[0] === diskTuple[0] && baselineTuple[1] > diskTuple[1]);
        expect(isStrictlyGreater).toBe(true);
      }
    });
  });

  describe('baseline property', () => {
    it('should use default baseline "1.0" when not provided', () => {
      const svm = new SchemaVersionManager();
      
      expect(svm.baseline).toBe('1.0');
    });

    it('should use provided baseline in constructor', () => {
      const svm = new SchemaVersionManager('2.5');
      
      expect(svm.baseline).toBe('2.5');
    });

    it('should expose baseline as a public property', () => {
      const svm = new SchemaVersionManager('1.0');
      
      // 验证 baseline 属性存在且可读
      expect(svm.baseline).toBe('1.0');
      expect(typeof svm.baseline).toBe('string');
      
      // TypeScript 的 readonly 修饰符在编译期强制，运行时不强制
      // 这是 TypeScript 的设计决策：readonly 是编译期类型检查，不是运行时保护
    });
  });
});
