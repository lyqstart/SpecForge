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

// v1.1 Handlers
import './handlers/sf-v11-work-item-create';
import './handlers/sf-v11-gate-run';
import './handlers/sf-v11-merge';
import './handlers/sf-v11-decision';
import './handlers/sf-v11-code-permission';
import './handlers/sf-v11-spec-migration';
import './handlers/sf-v11-rollback';
import './handlers/sf-v11-handoff';
import './handlers/sf-v11-extension';
import './handlers/sf-v11-verification';
import './handlers/sf-v11-close-gate';
