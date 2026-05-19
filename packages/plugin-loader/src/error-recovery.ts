/**
 * Error Recovery Module (Task 5.2.3)
 *
 * 实现错误恢复机制：
 *   1. 错误分类（可恢复/不可恢复）
 *   2. 自动重试策略（指数退避）
 *   3. 降级处理
 *   4. 错误恢复测试
 */

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

export type ErrorSeverity = 'critical' | 'warning' | 'info';
export type ErrorRecoverable = 'recoverable' | 'non-recoverable';

export interface ErrorClassification {
  severity: ErrorSeverity;
  recoverable: ErrorRecoverable;
  category: string;
  reason: string;
  suggestion?: string;
}

export class ErrorClassifier {
  classify(error: Error, context: string): ErrorClassification {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Check permission errors first (they should take precedence)
    if (this.isPermissionError(message, name)) {
      return {
        severity: 'critical',
        recoverable: 'non-recoverable',
        category: 'permission',
        reason: '权限不足，需要授权',
        suggestion: '在授权配置中添加所需权限',
      };
    }

    if (this.isNetworkError(message, name)) {
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'network',
        reason: '网络连接问题，可能是临时性抖动',
        suggestion: '等待后重试，或检查网络连接状态',
      };
    }

    if (this.isResourceContentionError(message, name)) {
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'resource_contention',
        reason: '资源竞争或锁冲突，可能是临时性问题',
        suggestion: '等待后重试',
      };
    }

    if (this.isTimeoutError(message, name)) {
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'timeout',
        reason: '操作超时，可能是系统负载高或网络延迟',
        suggestion: '增加超时阈值或等待后重试',
      };
    }

    if (this.isConfigError(message, name)) {
      return {
        severity: 'critical',
        recoverable: 'non-recoverable',
        category: 'config',
        reason: '配置错误，需要修改配置文件',
        suggestion: '检查配置文件格式和内容',
      };
    }

    if (this.isFileError(message, name)) {
      if (this.isFileNotFoundError(message, name)) {
        return {
          severity: 'critical',
          recoverable: 'non-recoverable',
          category: 'file_not_found',
          reason: '文件不存在，可能是路径错误或插件未正确安装',
          suggestion: '检查插件目录和文件路径',
        };
      }
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'file_io',
        reason: '文件系统操作失败，可能是临时性问题',
        suggestion: '等待后重试',
      };
    }

    if (this.isInternalError(message, name)) {
      return {
        severity: 'critical',
        recoverable: 'non-recoverable',
        category: 'internal',
        reason: '内部错误，可能是代码bug',
        suggestion: '检查日志并报告给开发者',
      };
    }

    return {
      severity: 'info',
      recoverable: 'non-recoverable',
      category: 'unknown',
      reason: '未知错误类型',
      suggestion: '查看错误详情并手动处理',
    };
  }

  private isNetworkError(message: string, name: string): boolean {
    const patterns = ['network', 'connection', 'socket', 'http', 'https', 'fetch', 'econnrefused'];
    return patterns.some(p => message.includes(p) || name.includes(p));
  }

  private isResourceContentionError(message: string, name: string): boolean {
    const patterns = ['lock', 'mutex', 'busy', 'conflict', 'resource'];
    return patterns.some(p => message.includes(p) || name.includes(p));
  }

  private isTimeoutError(message: string, name: string): boolean {
    return message.includes('timeout') || name.includes('timeout');
  }

  private isConfigError(message: string, name: string): boolean {
    const patterns = ['config', 'invalid json', 'parse error', 'validation', 'schema'];
    return patterns.some(p => message.includes(p) || name.includes(p));
  }

  private isPermissionError(message: string, name: string): boolean {
    const patterns = ['permission denied', 'access denied', 'unauthorized', 'forbidden', 'auth'];
    return patterns.some(p => message.includes(p) || name.includes(p));
  }

  private isFileError(message: string, name: string): boolean {
    const fileSystemPatterns = ['file', 'filesystem'];
    const ioErrorPatterns = ['eio', 'eio:'];
    const permissionErrorPatterns = ['eacces', 'eperm'];
    
    // Check for permission-related errors first (these should go to permission error handler)
    if (permissionErrorPatterns.some(p => message.includes(p))) {
      return false; // Let permission error handler deal with it
    }
    // Check for I/O errors
    if (ioErrorPatterns.some(p => message.includes(p))) {
      return true;
    }
    return fileSystemPatterns.some(p => message.includes(p) || name.includes(p));
  }

  private isFileNotFoundError(message: string, name: string): boolean {
    return message.includes('not found') || message.includes('ENOENT');
  }

  private isInternalError(message: string, name: string): boolean {
    const patterns = ['internal', 'bug', 'assertion', 'assert', 'unexpected'];
    return patterns.some(p => message.includes(p) || name.includes(p));
  }
}

// ---------------------------------------------------------------------------
// 重试策略
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  recoverableCategories?: string[];
}

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
  jitter: true,
  recoverableCategories: ['network', 'resource_contention', 'timeout', 'file_io'],
};

export class RetryStrategy {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  calculateDelay(attempt: number): number {
    let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);
    delay = Math.min(delay, this.config.maxDelay);
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random());
    }
    return Math.floor(delay);
  }

  shouldRetry(attempt: number, error: Error, classifier: ErrorClassifier): boolean {
    if (attempt >= this.config.maxRetries) return false;
    const classification = classifier.classify(error, 'unknown');
    if (classification.recoverable === 'non-recoverable') return false;
    if (this.config.recoverableCategories && 
        !this.config.recoverableCategories.includes(classification.category)) {
      return false;
    }
    return true;
  }

  async execute<T>(operation: (attempt: number) => Promise<T>, context: string = 'unknown'): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.shouldRetry(attempt, lastError, new ErrorClassifier())) {
          throw lastError;
        }
        const delay = this.calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError || new Error('Unknown error');
  }
}

// ---------------------------------------------------------------------------
// 降级处理
// ---------------------------------------------------------------------------

export type DegradationStrategy = 'skip' | 'fallback' | 'partial' | 'abort';

export interface DegradationConfig {
  strategy?: DegradationStrategy;
  fallback?: () => unknown;
  allowPartial?: boolean;
}

export const DEFAULT_DEGRADATION_CONFIG: Required<DegradationConfig> = {
  strategy: 'skip',
  fallback: () => undefined,
  allowPartial: false,
};

export class DegradationHandler {
  private config: Required<DegradationConfig>;

  constructor(config: DegradationConfig = {}) {
    this.config = { ...DEFAULT_DEGRADATION_CONFIG, ...config };
  }

  handle(error: Error, context: string): unknown {
    switch (this.config.strategy) {
      case 'skip':
        return undefined;
      case 'fallback':
        return this.config.fallback?.();
      case 'partial':
        if (this.config.allowPartial) {
          return { partial: true, error: error.message };
        }
        throw error;
      case 'abort':
        throw error;
      default:
        throw new Error(`Unknown degradation strategy: ${this.config.strategy}`);
    }
  }

  shouldDegradate(error: Error, context: string): boolean {
    const classifier = new ErrorClassifier();
    const classification = classifier.classify(error, context);
    if (classification.severity === 'critical') return false;
    return classification.recoverable === 'recoverable';
  }
}

// ---------------------------------------------------------------------------
// 错误恢复器
// ---------------------------------------------------------------------------

export class ErrorRecovery {
  private classifier: ErrorClassifier;
  private retryStrategy: RetryStrategy;
  private degradationHandler: DegradationHandler;

  constructor(retryConfig: RetryConfig = {}, degradationConfig: DegradationConfig = {}) {
    this.classifier = new ErrorClassifier();
    this.retryStrategy = new RetryStrategy(retryConfig);
    this.degradationHandler = new DegradationHandler(degradationConfig);
  }

  async executeWithRecovery<T>(
    operation: (attempt: number) => Promise<T>,
    context: string = 'unknown'
  ): Promise<T | undefined> {
    try {
      return await this.retryStrategy.execute(operation, context);
    } catch (error) {
      if (this.degradationHandler.shouldDegradate(error as Error, context)) {
        return this.degradationHandler.handle(error as Error, context);
      }
      throw error;
    }
  }

  classify(error: Error, context: string): ErrorClassification {
    return this.classifier.classify(error, context);
  }

  isRecoverable(error: Error, context: string): boolean {
    const classification = this.classify(error, context);
    return classification.recoverable === 'recoverable';
  }
}