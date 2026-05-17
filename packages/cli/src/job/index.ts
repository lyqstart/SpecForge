/**
 * Job tracking module exports
 */

export {
  JobTracker,
  JobTrackerError,
  JobNotFoundError,
  JobWaitTimeoutError,
  createJobTracker,
} from './JobTracker';

export type {
  JobStatusType,
  JobInfo,
  JobStatus,
  WaitOptions,
  JobTrackerConfig,
} from './JobTracker';

export {
  TERMINAL_STATES,
  isTerminalStatus,
} from './JobTracker';

// 事件驱动的 --wait 等待器（Task 5.2）
export {
  JobWaiter,
  JobTimeoutError,
  JobWaitAbortedError,
  createJobWaiter,
  DEFAULT_TERMINAL_STATES,
} from './JobWaiter';

export type {
  JobEventSource,
  JobStateEvent,
  JobResult,
  WaitForTerminalOptions,
} from './JobWaiter';

// 优化的异步 job 轮询机制（Task 9.2）
export {
  JobPoller,
  PollingTimeoutError,
  PollingAbortedError,
  createJobPoller,
} from '../JobPoller';

export type {
  PollResult,
  JobPollerConfig,
  PollOptions,
} from '../JobPoller';