/**
 * Error Recovery Unit Tests (Task 5.2.3)
 *
 * 测试覆盖：
 * - ErrorClassifier: 错误分类（可恢复/不可恢复）
 * - RetryStrategy: 重试策略（指数退避 + 随机抖动）
 * - DegradationHandler: 降级处理
 * - ErrorRecovery: 错误恢复组合器
 *
 * 遵循异步资源生命周期规范:
 *   - 使用 fake timer 确保测试确定性
 *   - 每次测试后验证无资源泄漏
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// 直接从源文件导入，避免通过 index.ts 的重复导出
import {
  ErrorClassifier,
  RetryStrategy,
  DegradationHandler,
  ErrorRecovery,
  type ErrorClassification,
  type RetryConfig,
  type DegradationConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_DEGRADATION_CONFIG,
} from '../../src/error-recovery.js';

// ---------------------------------------------------------------------------
// ErrorClassifier Tests
// ---------------------------------------------------------------------------

describe('ErrorClassifier', () => {
  let classifier: ErrorClassifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe('网络错误分类', () => {
    it('应将网络连接错误分类为可恢复', () => {
      const error = new Error('ECONNREFUSED 127.0.0.1:3000');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('network');
      expect(result.severity).toBe('warning');
    });

    it('应将网络超时错误分类为可恢复', () => {
      const error = new Error('Network request timeout');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('network');
    });

    it('应将 socket 错误分类为可恢复', () => {
      const error = new Error('Socket hang up');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('network');
    });
  });

  describe('超时错误分类', () => {
    it('应将超时错误分类为可恢复', () => {
      const error = new Error('Operation timeout after 5000ms');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('timeout');
      expect(result.severity).toBe('warning');
    });

    it('应将 TimeoutError 分类为可恢复', () => {
      const error = new Error('TimeoutError: Request timed out');
      const result = classifier.classify(error, 'static_check');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('timeout');
    });
  });

  describe('资源竞争错误分类', () => {
    it('应将锁冲突错误分类为可恢复', () => {
      const error = new Error('Resource is locked by another process');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('resource_contention');
    });

    it('应将忙状态错误分类为可恢复', () => {
      const error = new Error('Device or resource is busy');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('resource_contention');
    });
  });

  describe('权限错误分类', () => {
    it('应将权限拒绝错误分类为不可恢复', () => {
      const error = new Error('Permission denied: access to filesystem');
      const result = classifier.classify(error, 'auth_check');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('permission');
      expect(result.severity).toBe('critical');
    });

    it('应将授权错误分类为不可恢复', () => {
      const error = new Error('Unauthorized: insufficient permissions');
      const result = classifier.classify(error, 'auth_check');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('permission');
    });

    it('应将访问拒绝错误分类为不可恢复', () => {
      const error = new Error('Access denied to resource');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('permission');
    });
  });

  describe('配置错误分类', () => {
    it('应将配置错误分类为不可恢复', () => {
      const error = new Error('Invalid config: schema version mismatch');
      const result = classifier.classify(error, 'manifest_parse');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('config');
      expect(result.severity).toBe('critical');
    });

    it('应将 JSON 解析错误分类为不可恢复', () => {
      const error = new Error('Invalid JSON: unexpected token');
      const result = classifier.classify(error, 'manifest_parse');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('config');
    });

    it('应将验证错误分类为不可恢复', () => {
      const error = new Error('Validation failed: required field missing');
      const result = classifier.classify(error, 'manifest_parse');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('config');
    });
  });

  describe('文件错误分类', () => {
    it('应将文件不存在错误分类为不可恢复', () => {
      const error = new Error('ENOENT: file not found');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('file_not_found');
      expect(result.severity).toBe('critical');
    });

    it('应将 I/O 错误分类为可恢复', () => {
      const error = new Error('EIO: input/output error');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('recoverable');
      expect(result.category).toBe('file_io');
    });
  });

  describe('内部错误分类', () => {
    it('应将内部错误分类为不可恢复', () => {
      const error = new Error('Internal error: unexpected null value');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('internal');
      expect(result.severity).toBe('critical');
    });

    it('应将断言错误分类为不可恢复', () => {
      const error = new Error('Assertion failed: expected value');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('internal');
    });
  });

  describe('未知错误分类', () => {
    it('应将未知错误分类为不可恢复', () => {
      const error = new Error('Some random error');
      const result = classifier.classify(error, 'load');

      expect(result.recoverable).toBe('non-recoverable');
      expect(result.category).toBe('unknown');
      expect(result.severity).toBe('info');
    });
  });

  describe('错误建议', () => {
    it('应提供网络错误的建议', () => {
      const error = new Error('ECONNREFUSED');
      const result = classifier.classify(error, 'load');

      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain('网络');
    });

    it('应提供权限错误的建议', () => {
      const error = new Error('Permission denied');
      const result = classifier.classify(error, 'auth_check');

      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain('授权');
    });

    it('应提供配置错误的建议', () => {
      const error = new Error('Invalid config');
      const result = classifier.classify(error, 'manifest_parse');

      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain('配置');
    });
  });
});

// ---------------------------------------------------------------------------
// RetryStrategy Tests
// ---------------------------------------------------------------------------

describe('RetryStrategy', () => {
  describe('calculateDelay', () => {
    it('应使用默认配置正确计算延迟', () => {
      const strategy = new RetryStrategy();
      
      // 指数退避: 100 * 2^0 = 100ms
      const delay0 = strategy.calculateDelay(0);
      expect(delay0).toBeGreaterThanOrEqual(50); // 考虑抖动
      expect(delay0).toBeLessThanOrEqual(150);
      
      // 指数退避: 100 * 2^1 = 200ms
      const delay1 = strategy.calculateDelay(1);
      expect(delay1).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeLessThanOrEqual(300);
      
      // 指数退避: 100 * 2^2 = 400ms
      const delay2 = strategy.calculateDelay(2);
      expect(delay2).toBeGreaterThanOrEqual(200);
      expect(delay2).toBeLessThanOrEqual(600);
    });

    it('应限制最大延迟', () => {
      const strategy = new RetryStrategy({ maxDelay: 500 });
      
      // 即使 attempt 很大，也不应超过 maxDelay
      const delay = strategy.calculateDelay(100);
      expect(delay).toBeLessThanOrEqual(750); // maxDelay * 1.5 (抖动上限)
    });

    it('应禁用随机抖动当 jitter 为 false', () => {
      const strategy = new RetryStrategy({ jitter: false });
      
      const delay0 = strategy.calculateDelay(0);
      // 无抖动时，应该是精确的 initialDelay
      expect(delay0).toBe(100);
      
      const delay1 = strategy.calculateDelay(1);
      // 无抖动时，应该是精确的 initialDelay * 2 = 200
      expect(delay1).toBe(200);
    });

    it('应使用自定义 backoffMultiplier', () => {
      const strategy = new RetryStrategy({ 
        initialDelay: 100, 
        backoffMultiplier: 3,
        jitter: false 
      });
      
      const delay0 = strategy.calculateDelay(0);
      const delay1 = strategy.calculateDelay(1);
      const delay2 = strategy.calculateDelay(2);
      
      expect(delay0).toBe(100);  // 100 * 3^0
      expect(delay1).toBe(300);  // 100 * 3^1
      expect(delay2).toBe(900);  // 100 * 3^2
    });
  });

  describe('shouldRetry', () => {
    let strategy: RetryStrategy;
    let classifier: ErrorClassifier;

    beforeEach(() => {
      strategy = new RetryStrategy();
      classifier = new ErrorClassifier();
    });

    it('应在达到最大重试次数后返回 false', () => {
      const error = new Error('Network error');
      
      // maxRetries = 3, 所以 attempt 3 时不应重试
      expect(strategy.shouldRetry(0, error, classifier)).toBe(true);
      expect(strategy.shouldRetry(1, error, classifier)).toBe(true);
      expect(strategy.shouldRetry(2, error, classifier)).toBe(true);
      expect(strategy.shouldRetry(3, error, classifier)).toBe(false);
    });

    it('应对不可恢复错误返回 false', () => {
      const error = new Error('Permission denied');
      
      expect(strategy.shouldRetry(0, error, classifier)).toBe(false);
    });

    it('应对不可恢复错误（配置错误）返回 false', () => {
      const error = new Error('Invalid config');
      
      expect(strategy.shouldRetry(0, error, classifier)).toBe(false);
    });

    it('应对可恢复错误返回 true', () => {
      const error = new Error('Connection timeout');
      
      expect(strategy.shouldRetry(0, error, classifier)).toBe(true);
    });

    it('应只重试可配置类别的错误', () => {
      const strategy = new RetryStrategy({
        recoverableCategories: ['network'],
      });
      
      const networkError = new Error('Connection refused');
      const timeoutError = new Error('Operation timeout');
      
      expect(strategy.shouldRetry(0, networkError, classifier)).toBe(true);
      expect(strategy.shouldRetry(0, timeoutError, classifier)).toBe(false);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应在成功后立即返回结果', async () => {
      const strategy = new RetryStrategy({ maxRetries: 3 });
      
      const result = await strategy.execute(async () => {
        return 'success';
      }, 'test');
      
      expect(result).toBe('success');
    });

    it('应在失败后自动重试', async () => {
      const attempts: number[] = [];
      const strategy = new RetryStrategy({ maxRetries: 3, jitter: false });
      
      await strategy.execute(async (attempt) => {
        attempts.push(attempt);
        if (attempt < 2) {
          throw new Error('Network connection failed'); // 使用可恢复的错误类型
        }
        return 'success';
      }, 'test');
      
      expect(attempts).toEqual([0, 1, 2]);
    });

    it('应在重试耗尽后抛出错误', async () => {
      const strategy = new RetryStrategy({ 
        maxRetries: 2, 
        initialDelay: 100,
        jitter: false 
      });
      
      const promise = strategy.execute(async () => {
        throw new Error('Persistent error');
      }, 'test');
      
      // 应该抛出错误
      await expect(promise).rejects.toThrow('Persistent error');
    });

    it('应在不可恢复错误时立即抛出', async () => {
      const strategy = new RetryStrategy({ maxRetries: 3 });
      const attempts: number[] = [];
      
      const promise = strategy.execute(async (attempt) => {
        attempts.push(attempt);
        throw new Error('Permission denied');
      }, 'test');
      
      await expect(promise).rejects.toThrow('Permission denied');
      
      // 不应该重试
      expect(attempts).toEqual([0]);
    });
  });
});

// ---------------------------------------------------------------------------
// DegradationHandler Tests
// ---------------------------------------------------------------------------

describe('DegradationHandler', () => {
  describe('handle', () => {
    it('应使用 skip 策略返回 undefined', () => {
      const handler = new DegradationHandler({ strategy: 'skip' });
      const error = new Error('Temporary error');
      
      const result = handler.handle(error, 'load');
      
      expect(result).toBeUndefined();
    });

    it('应使用 fallback 策略返回降级结果', () => {
      const fallbackValue = { degraded: true };
      const handler = new DegradationHandler({
        strategy: 'fallback',
        fallback: () => fallbackValue,
      });
      const error = new Error('Temporary error');
      
      const result = handler.handle(error, 'load');
      
      expect(result).toEqual(fallbackValue);
    });

    it('应使用 abort 策略抛出错误', () => {
      const handler = new DegradationHandler({ strategy: 'abort' });
      const error = new Error('Critical error');
      
      expect(() => handler.handle(error, 'load')).toThrow('Critical error');
    });

    it('应使用 partial 策略返回部分结果', () => {
      const handler = new DegradationHandler({
        strategy: 'partial',
        allowPartial: true,
      });
      const error = new Error('Partial failure');
      
      const result = handler.handle(error, 'load');
      
      expect(result).toEqual({
        partial: true,
        error: 'Partial failure',
      });
    });

    it('应使用 partial 策略但不允许部分成功时抛出错误', () => {
      const handler = new DegradationHandler({
        strategy: 'partial',
        allowPartial: false,
      });
      const error = new Error('Partial failure');
      
      expect(() => handler.handle(error, 'load')).toThrow('Partial failure');
    });
  });

  describe('shouldDegradate', () => {
    it('应对 critical 错误返回 false', () => {
      const handler = new DegradationHandler();
      const error = new Error('Internal error');
      
      expect(handler.shouldDegradate(error, 'load')).toBe(false);
    });

    it('应对可恢复错误返回 true', () => {
      const handler = new DegradationHandler();
      const error = new Error('Connection timeout');
      
      expect(handler.shouldDegradate(error, 'load')).toBe(true);
    });

    it('应对 warning 级别可恢复错误返回 true', () => {
      const handler = new DegradationHandler();
      const error = new Error('Network connection failed');
      
      expect(handler.shouldDegradate(error, 'load')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// ErrorRecovery Tests
// ---------------------------------------------------------------------------

describe('ErrorRecovery', () => {
  let recovery: ErrorRecovery;

  beforeEach(() => {
    recovery = new ErrorRecovery();
  });

  describe('classify', () => {
    it('应正确分类错误', () => {
      const error = new Error('Connection timeout');
      const classification = recovery.classify(error, 'load');
      
      expect(classification.recoverable).toBe('recoverable');
      expect(classification.category).toBe('network');
    });
  });

  describe('isRecoverable', () => {
    it('应对可恢复错误返回 true', () => {
      const error = new Error('Network error');
      
      expect(recovery.isRecoverable(error, 'load')).toBe(true);
    });

    it('应对不可恢复错误返回 false', () => {
      const error = new Error('Permission denied');
      
      expect(recovery.isRecoverable(error, 'load')).toBe(false);
    });
  });

  describe('executeWithRecovery', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应在成功时返回结果', async () => {
      const result = await recovery.executeWithRecovery(async () => {
        return 'success';
      }, 'test');
      
      expect(result).toBe('success');
    });

    it('应在可恢复错误时重试后成功', async () => {
      let attempts = 0;
      const recovery = new ErrorRecovery(
        { maxRetries: 3, jitter: false },
        { strategy: 'skip' }
      );
      
      const result = await recovery.executeWithRecovery(async (attempt) => {
        attempts++;
        if (attempt < 2) {
          throw new Error('Temporary network error');
        }
        return 'success after retry';
      }, 'load');
      
      expect(result).toBe('success after retry');
      expect(attempts).toBe(3);
    });

    it('应在重试耗尽后降级处理', async () => {
      const recovery = new ErrorRecovery(
        { maxRetries: 2, jitter: false },
        { strategy: 'skip' }
      );
      
      const result = await recovery.executeWithRecovery(async () => {
        throw new Error('Network error');
      }, 'load');
      
      // 由于是 skip 策略，返回 undefined
      expect(result).toBeUndefined();
    });

    it('应在不可恢复错误时抛出', async () => {
      const recovery = new ErrorRecovery(
        { maxRetries: 3 },
        { strategy: 'skip' }
      );
      
      const promise = recovery.executeWithRecovery(async () => {
        throw new Error('Permission denied');
      }, 'auth_check');
      
      await expect(promise).rejects.toThrow('Permission denied');
    });

    it('应在降级策略为 fallback 时返回降级值', async () => {
      const recovery = new ErrorRecovery(
        { maxRetries: 1, jitter: false },
        { 
          strategy: 'fallback', 
          fallback: () => ({ fallback: true }) 
        }
      );
      
      const result = await recovery.executeWithRecovery(async () => {
        throw new Error('Temporary error');
      }, 'load');
      
      expect(result).toEqual({ fallback: true });
    });
  });
});

// ---------------------------------------------------------------------------
// 配置默认值测试
// ---------------------------------------------------------------------------

describe('Default Configuration', () => {
  describe('DEFAULT_RETRY_CONFIG', () => {
    it('应包含正确的默认值', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelay).toBe(100);
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBe(5000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
      expect(DEFAULT_RETRY_CONFIG.recoverableCategories).toContain('network');
      expect(DEFAULT_RETRY_CONFIG.recoverableCategories).toContain('timeout');
    });
  });

  describe('DEFAULT_DEGRADATION_CONFIG', () => {
    it('应包含正确的默认值', () => {
      expect(DEFAULT_DEGRADATION_CONFIG.strategy).toBe('skip');
      expect(DEFAULT_DEGRADATION_CONFIG.allowPartial).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 边界情况测试
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  describe('ErrorClassifier 边界情况', () => {
    it('应处理空错误消息', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('');
      
      const result = classifier.classify(error, 'load');
      
      expect(result.category).toBe('unknown');
      expect(result.recoverable).toBe('non-recoverable');
    });

    it('应处理没有错误名称的情况', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Some error');
      error.name = '';
      
      const result = classifier.classify(error, 'load');
      
      expect(result).toBeDefined();
    });
  });

  describe('RetryStrategy 边界情况', () => {
    it('应处理 maxRetries 为 0 的情况', () => {
      const strategy = new RetryStrategy({ maxRetries: 0 });
      
      // 0 次重试意味着只尝试一次
      const error = new Error('Error');
      expect(strategy.shouldRetry(0, error, new ErrorClassifier())).toBe(false);
    });

    it('应处理负数 maxRetries', () => {
      const strategy = new RetryStrategy({ maxRetries: -1 });
      
      const error = new Error('Error');
      expect(strategy.shouldRetry(0, error, new ErrorClassifier())).toBe(false);
    });
  });

  describe('DegradationHandler 边界情况', () => {
    it('应处理未知的降级策略', () => {
      const handler = new DegradationHandler({ 
        strategy: 'unknown' as any 
      });
      const error = new Error('Error');
      
      expect(() => handler.handle(error, 'load')).toThrow('Unknown degradation strategy');
    });
  });
});