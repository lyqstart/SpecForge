# Workflow Runtime integration examples

Use the public WorkflowEngine/WorkflowLoader entry for orchestration. An engine is configured with an optional eventPublisher and neutral onTransition capability; it does not accept persistenceDir or directly own a Daemon EventBus. Production progression and durable recovery remain controlled by Daemon State/Tool owners.

Current executable examples of the boundary are the [finite orchestration/Daemon integration tests](../../../tests/e2e/feature-spec-e2e.test.ts) and [module boundary regression](../tests/unit/persistence-owner-boundary.test.ts). Their finite coverage is not a claim of full business Gate/Close acceptance.

Old independent storage examples and the previous document are retained in [the raw baseline](../../../docs/archive/2026-11-07-verification-production/workflow-persistence-baseline/manifest.json); they are not current recipes.
