/**
 * Error Recovery Module (Task 5.2.3)
 *
 * 实现错误恢复机制：
 *   1. 错误分类（可恢复/不可恢复）
 *   2. 自动重试策略（指数退避）
 *   3. 降级处理
 *   4. 错误恢复测试
 *
 * 设计原则：
 *   - 可恢复错误：临时性问题（网络抖动、资源竞争），可通过重试解决
 *   - 不可恢复错误：永久性问题（配置错误、权限不足），重试无效
 *   - 重试策略：指数退避 + 随机抖动，避免雪崩
 *   - 降级处理：关键功能失败时提供降级方案，保证系统可用性
 */

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

/**
 * 错误严重等级
 */
export type ErrorSeverity = 'critical' | 'warning' | 'info';

/**
 * 错误可恢复性
 */
export type ErrorRecoverable = 'recoverable' | 'non-recoverable';

/**
 * 错误分类结果
 */
export interface ErrorClassification {
  severity: ErrorSeverity;
  recoverable: ErrorRecoverable;
  category: string;
  reason: string;
  suggestion?: string;
}

/**
 * 错误分类器
 *
 * 职责：根据错误类型和上下文，判断错误是否可恢复
 */
export class ErrorClassifier {
  /**
   * 分类错误
   *
   * @param error 错误对象
   * @param context 错误上下文（如 'manifest_parse' / 'static_check' / 'auth_check' / 'load'）
   * @returns 错误分类结果
   */
  classify(error: Error, context: string): ErrorClassification {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // 1. 网络相关错误（可恢复）
    if (this.isNetworkError(message, name)) {
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'network',
        reason: '网络连接问题，可能是临时性抖动',
        suggestion: '等待后重试，或检查网络连接状态',
      };
    }

    // 2. 资源竞争错误（可恢复）
    if (this.isResourceContentionError(message, name)) {
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'resource_contention',
        reason: '资源竞争或锁冲突，可能是临时性问题',
        suggestion: '等待后重试',
      };
    }

    // 3. 超时错误（可恢复）
    if (this.isTimeoutError(message, name)) {
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'timeout',
        reason: '操作超时，可能是系统负载高或网络延迟',
        suggestion: '增加超时阈值或等待后重试',
      };
    }

    // 4. 配置错误（不可恢复）
    if (this.isConfigError(message, name, context)) {
      return {
        severity: 'critical',
        recoverable: 'non-recoverable',
        category: 'config',
        reason: '配置错误，需要修改配置文件',
        suggestion: '检查配置文件格式和内容',
      };
    }

    // 5. 权限错误（不可恢复）
    if (this.isPermissionError(message, name, context)) {
      return {
        severity: 'critical',
        recoverable: 'non-recoverable',
        category: 'permission',
        reason: '权限不足，需要授权',
        suggestion: '在授权配置中添加所需权限',
      };
    }

    // 6. 文件系统错误（部分可恢复）
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
      // 其他文件错误（如权限、IO错误）可能是可恢复的
      return {
        severity: 'warning',
        recoverable: 'recoverable',
        category: 'file_io',
        reason: '文件系统操作失败，可能是临时性问题',
        suggestion: '等待后重试',
      };
    }

    // 7. 内部错误（不可恢复）
    if (this.isInternalError(message, name)) {
      return {
        severity: 'critical',
        recoverable: 'non-recoverable',
        category: 'internal',
        reason: '内部错误，可能是代码bug',
        suggestion: '检查日志并报告给开发者',
      };
    }

    // 默认：未知错误，根据上下文判断
    return {
      severity: 'info',
      recoverable: 'non-recoverable',
      category: 'unknown',
      reason: '未知错误类型',
      suggestion: '查看错误详情并手动处理',
    };
  }

  // -------------------------------------------------------------------------
  // 私有辅助方法
  // -------------------------------------------------------------------------

  private isNetworkError(message: string, name: string): boolean {
    const networkPatterns = [
      'network',
      'connection',
      'socket',
      'http',
      'https',
      'fetch',
      'request',
    ];
    return networkPatterns.some(
      (pattern) => message.includes(pattern) || name.toLowerCase().includes(pattern),
    );
  }

  private isResourceContentionError(message: string, name: string): boolean {
    const contentionPatterns = [
      'lock',
      'mutex',
      'semaphore',
      'resource',
      'busy',
      'conflict',
    ];
    return contentionPatterns.some(
      (pattern) => message.includes(pattern) || name.toLowerCase().includes(pattern),
    );
  }

  private isTimeoutError(message: string, name: string): boolean {
    return (
      message.includes('timeout') ||
      name.toLowerCase().includes('timeout') ||
      message.includes('timed out')
    );
  }

  private isConfigError(message: string, name: string, context: string): boolean {
    const configPatterns = [
      'invalid config',
      'invalid json',
      'invalid yaml',
      'parse error',
      'format error',
      'schema',
      'validation',
    ];
    return configPatterns.some(
      (pattern) => message.includes(pattern) || name.toLowerCase().includes(pattern),
    );
  }

  private isPermissionError(message: string, name: string, context: string): boolean {
    const permissionPatterns = [
      'permission',
      'access denied',
      'unauthorized',
      'forbidden',
      'auth',
    ];
    return permissionPatterns.some(
      (pattern) => message.includes(pattern) || name.toLowerCase().includes(pattern),
    );
  }

  private isFileError(message: string, name: string): boolean {
    const filePatterns = [
      'file',
      'fs',
      'filesystem',
      'ENOENT',
      'EACCES',
      'EPERM',
      'EIO',
    ];
    return filePatterns.some(
      (pattern) => message.includes(pattern) || name.toLowerCase().includes(pattern),
    );
  }

  private isFileNotFoundError(message: string, name: string): boolean {
    return (
      message.includes('not found') ||
      message.includes('ENOENT') ||
      name.toLowerCase().includes('notfound')
    );
  }

  private isInternalError(message: string, name: string): boolean {
    const internalPatterns = [
      'internal',
      'bug',
      'assertion',
      'assert',
      'unexpected',
    ];
    return internalPatterns.some(
      (pattern) => message.includes(pattern) || name.toLowerCase().includes(pattern),
    );
  }
}

// ---------------------------------------------------------------------------
// 重试策略
// ---------------------------------------------------------------------------

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 初始重试间隔（毫秒，默认 100） */
  initialDelay?: number;
  /** 最大重试间隔（毫秒，默认 5000） */
  maxDelay?: number;
  /** 重试间隔倍数（默认 2，即指数退避） */
  backoffMultiplier?: number;
  /** 是否启用随机抖动（默认 true） */
  jitter?: boolean;
  /** 可重试的错误分类列表 */
  recoverableCategories?: string[];
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
  jitter: true,
  recoverableCategories: ['network', 'resource_contention', 'timeout', 'file_io'],
};

/**
 * 重试策略
 */
export class RetryStrategy {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * 计算下一次重试延迟
   *
   * @param attempt 当前是第几次重试（从 0 开始）
   * @returns 延迟时间（毫秒）
   */
  calculateDelay(attempt: number): number {
    // 指数退避：initialDelay * (backoffMultiplier ^ attempt)
    let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);

    // 限制最大延迟
    delay = Math.min(delay, this.config.maxDelay);

    // 随机抖动（避免雪崩）
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random()); // 0.5x ~ 1.5x
    }

    return Math.floor(delay);
  }

  /**
   * 判断是否应该重试
   *
   * @param attempt 当前是第几次重试（从 0 开始）
   * @param error 错误对象
   * @param classifier 错误分类器
   * @returns 是否应该重试
   */
  shouldRetry(attempt: number, error: Error, classifier: ErrorClassifier): boolean {
    // 超过最大重试次数
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    // 分类错误
    const classification = classifier.classify(error, 'unknown');

    // 不可恢复错误
    if (classification.recoverable === 'non-recoverable') {
      return false;
    }

    // 检查错误分类是否在可重试列表中
    if (this.config.recoverableCategories) {
      if (!this.config.recoverableCategories.includes(classification.category)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 执行带重试的操作
   *
   * @param operation 操作函数（返回 Promise）
   * @param context 操作上下文（用于错误分类）
   * @returns 操作结果
   * @throws 操作最终失败时抛出错误
   */
  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    context: string = 'unknown',
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 判断是否应该重试
        if (!this.shouldRetry(attempt, lastError, new ErrorClassifier())) {
          throw lastError;
        }

        // 计算延迟并等待
        const delay = this.calculateDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 理论上不会到达这里（最后一次重试失败后会 throw）
    throw lastError || new Error('Unknown error');
  }
}

// ---------------------------------------------------------------------------
// 降级处理
// ---------------------------------------------------------------------------

/**
 * 降级策略
 */
export type DegradationStrategy = 'skip' | 'fallback' | 'partial' | 'abort';

/**
 * 降级配置
 */
export interface DegradationConfig {
  /** 降级策略（默认 'skip'） */
  strategy?: DegradationStrategy;
  /** 降级处理函数（strategy='fallback' 时使用） */
  fallback?: () => unknown;
  /** 允许部分成功的场景 */
  allowPartial?: boolean;
}

/**
 * 默认降级配置
 */
export const DEFAULT_DEGRADATION_CONFIG: Required<DegradationConfig> = {
  strategy: 'skip',
  fallback: () => undefined,
  allowPartial: false,
};

/**
 * 降级处理器
 */
export class DegradationHandler {
  private config: Required<DegradationConfig>;

  constructor(config: DegradationConfig = {}) {
    this.config = { ...DEFAULT_DEGRADATION_CONFIG, ...config };
  }

  /**
   * 处理降级
   *
   * @param error 错误对象
   * @param context 降级上下文（如 'manifest_parse' / 'static_check' / 'auth_check'）
   * @returns 降级结果
   */
  handle(error: Error, context: string): unknown {
    switch (this.config.strategy) {
      case 'skip':
        // 跳过当前操作，继续处理其他插件
        return undefined;

      case 'fallback':
        // 使用降级处理函数
        return this.config.fallback?.();

      case 'partial':
        // 允许部分成功（返回部分结果）
        if (this.config.allowPartial) {
          return { partial: true, error: error.message };
        }
        throw error;

      case 'abort':
        // 中止操作
        throw error;

      default:
        throw new Error(`Unknown degradation strategy: ${this.config.strategy}`);
    }
  }

  /**
   * 判断是否应该降级
   *
   * @param error 错误对象
   * @param context 降级上下文
   * @returns 是否应该降级
   */
  shouldDegradate(error: Error, context: string): boolean {
    const classifier = new ErrorClassifier();
    const classification = classifier.classify(error, context);

    // 关键错误（critical）不降级
    if (classification.severity === 'critical') {
      return false;
    }

    // 可恢复错误可以降级
    return classification.recoverable === 'recoverable';
  }
}

// ---------------------------------------------------------------------------
// 错误恢复器（组合器）
// ---------------------------------------------------------------------------

/**
 * 错误恢复器
 *
 * 组合错误分类、重试策略和降级处理
 */
export class ErrorRecovery {
  private classifier: ErrorClassifier;
  private retryStrategy: RetryStrategy;
  private degradationHandler: DegradationHandler;

  constructor(
    retryConfig: RetryConfig = {},
    degradationConfig: DegradationConfig = {},
  ) {
    this.classifier = new ErrorClassifier();
    this.retryStrategy = new RetryStrategy(retryConfig);
    this.degradationHandler = new DegradationHandler(degradationConfig);
  }

  /**
   * 执行带错误恢复的操作
   *
   * @param operation 操作函数（返回 Promise）
   * @param context 操作上下文
   * @returns 操作结果（可能为降级结果）
   */
  async executeWithRecovery<T>(
    operation: (attempt: number) => Promise<T>,
    context: string = 'unknown',
  ): Promise<T | undefined> {
    try {
      return await this.retryStrategy.execute(operation, context);
    } catch (error) {
      // 判断是否应该降级
      if (this.degradationHandler.shouldDegradate(error as Error, context)) {
        return this.degradationHandler.handle(error as Error, context);
      }

      // 不能降级，抛出错误
      throw error;
    }
  }

  /**
   * 分类错误
   */
  classify(error: Error, context: string): ErrorClassification {
    return this.classifier.classify(error, context);
  }

  /**
   * 判断错误是否可恢复
   */
  isRecoverable(error: Error, context: string): boolean {
    const classification = this.classify(error, context);
    return classification.recoverable === 'recoverable';
  }
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export {
  ErrorClassification,
  ErrorClassifier,
  RetryConfig,
  RetryStrategy,
  DegradationConfig,
  DegradationHandler,
  ErrorRecovery,
};
