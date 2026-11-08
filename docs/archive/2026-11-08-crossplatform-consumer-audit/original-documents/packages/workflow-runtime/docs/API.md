# Workflow Runtime API

The public entry is `@specforge/workflow-runtime`. Its exports are defined by `src/index.ts`; private package deep imports are not supported.

WorkflowEngine loads workflow definitions, manages in-memory instances and orchestrates allowed progression and Gates. WorkflowLoader loads definitions. State/Tool capabilities are supplied by the composition owner through neutral contracts; this module does not own a physical runtime directory or independently persist workflow state.

`WorkflowEngineConfig` accepts an eventPublisher, in-memory stateManager, retryConfig and optional onTransition callback. It has no persistenceDir or eventBus option. A callback is an integration contract, not permission to bypass the real owner or its prerequisites.

Daemon StateManager/WAL owns durable state, checkpoints and recovery. Production consumers use the Daemon's controlled State/Tool route. WorkflowPersistence, StateRecoveryManager, storage factories and their physical path options are retired; there is no alternative storage implementation to configure here.

The unchanged older API document is preserved in [the baseline archive](../../../docs/archive/2026-11-07-verification-production/workflow-persistence-baseline/original/packages/workflow-runtime/docs/API.md). Product authority remains [SPS §8](../../../docs/product-specification/specforge-product-specification.md).
