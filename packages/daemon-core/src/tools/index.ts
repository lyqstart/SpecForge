export { ToolDispatcher, registerHandler, getHandler } from './ToolDispatcher';
export type { ToolInvokeRequest, ToolDeps } from './ToolDispatcher';

// Register all handlers
import './handlers/sf-state-read';
import './handlers/sf-state-transition';
import './handlers/sf-artifact-write';
import './handlers/sf-doc-lint';
import './handlers/sf-requirements-gate';
import './handlers/sf-design-gate';
import './handlers/sf-tasks-gate';
import './handlers/sf-verification-gate';
import './handlers/sf-safe-bash';
import './handlers/sf-batch-verify';
import './handlers/sf-context-build';
import './handlers/sf-continuity';
import './handlers/sf-cost-report';
import './handlers/sf-doctor';
import './handlers/sf-knowledge-base';
import './handlers/sf-knowledge-graph';
import './handlers/sf-knowledge-query';
import './handlers/sf-trace-matrix';
