/**
 * Event-driven Job Waiter for the `--wait` flag (Task 5.2 / Property 18).
 *
 * Design intent (compliance):
 * - A1 "败者清理"：用 `Promise` + `try/finally` 确保超时/订阅资源在所有路径上释放
 * - A2 "终止可达"：等待逻辑不依赖 `while` 轮询，由事件源主动通知
 * - A3 "推优于拉"：通过 `JobEventSource.subscribe` 接收状态推送
 * - C3 "超时根因"：`JobTimeoutError` 携带 operation/timeoutMs/jobId/suggestion
 * - C4 "可清理 API"：`waitForTerminal` 在 finally 里调用 `unsubscribe`
 *
 * 终止态集合默认为 `['succeeded', 'failed', 'aborted']`（与 spec design.md 中
 * `{completed, failed, blocked, cancelled}` 不同——本任务先用前一组，等 Task 5.3
 * 在 spec 内最终确定后再统一）。调用方可通过 `terminalStates` 选项覆盖。
 *
 * @packageDocumentation
 */

/**
 * 默认终止态集合（与 spec requirements.md Requirement 3.5 一致）。
 * Property 18: 终态集合为 {completed, failed, blocked, cancelled}
 */
export const DEFAULT_TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'blocked',
  'cancelled',
]);

/**
 * 一次状态变化事件。
 */
export interface JobStateEvent {
  /** Job 标识符 */
  jobId: string;
  /** 当前状态字符串（不限于终止态） */
  status: string;
  /** 终止态时附带的结果 payload */
  result?: unknown;
  /** 失败/中止态时的错误信息 */
  error?: string;
  /** 状态产生时间（Unix ms） */
  updatedAt: number;
}

/**
 * Job 事件源抽象。CLI 将由 SSE / WebSocket 适配器实现该接口。
 *
 * 实现要求：
 * - `subscribe` 必须返回 unsubscribe 函数；调用后不能再触发 listener
 * - 同一 jobId 可被多次 subscribe（每次返回独立 unsubscribe）
 * - `getCurrentState` 是可选的快照接口，用于覆盖"订阅前 job 已终止"的竞态
 */
export interface JobEventSource {
  /**
   * 订阅指定 jobId 的状态变化。
   * @returns 一个幂等的 unsubscribe 函数
   */
  subscribe(
    jobId: string,
    listener: (event: JobStateEvent) => void,
  ): () => void;

  /**
   * 可选：拉取一次当前状态（用于补齐"订阅前已终止"的竞态窗口）。
   * 没有该能力的实现可省略此方法。
   */
  getCurrentState?(jobId: string): Promise<JobStateEvent | null>;
}

/**
 * `waitForTerminal` 的最终结果。
 */
export interface JobResult {
  /** Job 标识符 */
  jobId: string;
  /** 终止态字符串（属于 `terminalStates` 集合中的某个值） */
  status: string;
  /** 终止态附带的结果 payload */
  result?: unknown;
  /** 失败/中止态附带的错误信息 */
  error?: string;
  /** 状态产生时间（Unix ms） */
  updatedAt: number;
}

/**
 * `waitForTerminal` 的可选项。
 */
export interface WaitForTerminalOptions {
  /** 等待超时（毫秒）。默认 60_000（60 秒） */
  timeoutMs?: number;
  /** 外部 abort 信号；触发后立刻 reject 并清理订阅/timer */
  signal?: AbortSignal;
  /** 自定义终止态集合（默认 DEFAULT_TERMINAL_STATES） */
  terminalStates?: ReadonlySet<string>;
}

/**
 * 等待超时错误（C3：根因 + 行动建议）。
 */
export class JobTimeoutError extends Error {
  readonly code = 'WAIT_TIMEOUT';
  readonly operation: string;
  readonly timeoutMs: number;
  readonly jobId: string;
  readonly suggestion: string;
  readonly isRetryable = true;

  constructor(params: {
    operation: string;
    timeoutMs: number;
    jobId: string;
    suggestion: string;
  }) {
    super(
      `Job 等待超时（${params.timeoutMs}ms）：${params.jobId}（操作：${params.operation}）`,
    );
    this.name = 'JobTimeoutError';
    this.operation = params.operation;
    this.timeoutMs = params.timeoutMs;
    this.jobId = params.jobId;
    this.suggestion = params.suggestion;
  }
}

/**
 * 等待被外部 abort 取消时抛出的错误。
 */
export class JobWaitAbortedError extends Error {
  readonly code = 'WAIT_ABORTED';
  readonly jobId: string;
  readonly reason: string;

  constructor(jobId: string, reason: string) {
    super(`Job 等待被取消：${jobId}（${reason}）`);
    this.name = 'JobWaitAbortedError';
    this.jobId = jobId;
    this.reason = reason;
  }
}

/**
 * 事件驱动的 Job 等待器。
 *
 * @example
 * ```typescript
 * const waiter = new JobWaiter(eventSource);
 * const result = await waiter.waitForTerminal('job-123', { timeoutMs: 60_000 });
 * if (result.status === 'succeeded') {
 *   console.log('Done:', result.result);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 * ```
 */
export class JobWaiter {
  private readonly source: JobEventSource;
  private readonly defaultTerminalStates: ReadonlySet<string>;

  constructor(
    source: JobEventSource,
    defaultTerminalStates: ReadonlySet<string> = DEFAULT_TERMINAL_STATES,
  ) {
    this.source = source;
    this.defaultTerminalStates = defaultTerminalStates;
  }

  /**
   * 等待 Job 进入终止态（事件驱动，无轮询）。
   *
   * 行为契约：
   * - 命中终止态 → resolve `JobResult`
   * - 超时 → reject `JobTimeoutError`
   * - 外部 abort → reject `JobWaitAbortedError`
   * - 任何路径上 timer / 订阅 / abort 监听都会在 finally 释放（A1/C4）
   *
   * @param jobId 要等待的 Job 标识符
   * @param optionsOrTimeoutMs 可传 number（仅指定超时）或完整选项对象
   */
  async waitForTerminal(
    jobId: string,
    optionsOrTimeoutMs: number | WaitForTerminalOptions = 60_000,
  ): Promise<JobResult> {
    const opts: WaitForTerminalOptions =
      typeof optionsOrTimeoutMs === 'number'
        ? { timeoutMs: optionsOrTimeoutMs }
        : optionsOrTimeoutMs;
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const terminalStates = opts.terminalStates ?? this.defaultTerminalStates;
    const signal = opts.signal;

    // 提前 abort：直接拒绝，不创建任何资源
    if (signal?.aborted) {
      throw new JobWaitAbortedError(
        jobId,
        signal.reason ? String(signal.reason) : 'aborted before wait started',
      );
    }

    let unsubscribe: (() => void) | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;
    let settled = false;

    try {
      return await new Promise<JobResult>((resolve, reject) => {
        const settleResolve = (value: JobResult) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const settleReject = (err: Error) => {
          if (settled) return;
          settled = true;
          reject(err);
        };

        const listener = (event: JobStateEvent) => {
          if (event.jobId !== jobId) return;
          if (terminalStates.has(event.status)) {
            settleResolve({
              jobId: event.jobId,
              status: event.status,
              result: event.result,
              error: event.error,
              updatedAt: event.updatedAt,
            });
          }
        };

        // 1. 先订阅，避免快路径下漏掉事件
        unsubscribe = this.source.subscribe(jobId, listener);

        // 2. 配置超时（A1：finally 中清理）
        timeoutHandle = setTimeout(() => {
          settleReject(
            new JobTimeoutError({
              operation: 'JobWaiter.waitForTerminal',
              timeoutMs,
              jobId,
              suggestion:
                'Job 未在指定超时内进入终止态。可用 `specforge job <id>` 检查当前状态，或加大 --timeout。',
            }),
          );
        }, timeoutMs);

        // 3. abort 监听（finally 中移除）
        if (signal) {
          abortHandler = () => {
            settleReject(
              new JobWaitAbortedError(
                jobId,
                signal.reason ? String(signal.reason) : 'aborted',
              ),
            );
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        }

        // 4. 拉一次当前状态：覆盖"订阅前 job 已终止"的竞态。
        //    必须放在订阅之后，避免反向竞态（拉取期间收到事件但订阅未挂）。
        if (this.source.getCurrentState) {
          this.source
            .getCurrentState(jobId)
            .then((snapshot) => {
              if (snapshot && terminalStates.has(snapshot.status)) {
                settleResolve({
                  jobId: snapshot.jobId,
                  status: snapshot.status,
                  result: snapshot.result,
                  error: snapshot.error,
                  updatedAt: snapshot.updatedAt,
                });
              }
            })
            .catch((err) => {
              // 快照失败不致命——只要事件流仍能推送终止态即可
              // 但需把 error 透出给调用者，方便排障
              settleReject(
                err instanceof Error
                  ? err
                  : new Error(String(err ?? 'getCurrentState failed')),
              );
            });
        }
      });
    } finally {
      // A1：所有资源在所有路径上释放
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (unsubscribe) {
        try {
          (unsubscribe as () => void)();
        } catch {
          // 不让 unsubscribe 异常掩盖原始错误
        }
      }
      if (abortHandler && signal) {
        try {
          signal.removeEventListener('abort', abortHandler);
        } catch {
          // 同上
        }
      }
    }
  }
}

/**
 * 工厂函数：从事件源构造 JobWaiter。
 */
export function createJobWaiter(
  source: JobEventSource,
  defaultTerminalStates?: ReadonlySet<string>,
): JobWaiter {
  return new JobWaiter(source, defaultTerminalStates);
}
