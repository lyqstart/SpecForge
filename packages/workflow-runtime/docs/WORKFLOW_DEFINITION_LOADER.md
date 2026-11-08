# Current workflow definition loading

The public [WorkflowDefinitionLoader](../src/loaders/WorkflowDefinitionLoader.ts) validates definitions. [WorkflowLoader](../src/engine/WorkflowLoader.ts) maintains an in-memory accepted-definition catalog. Neither owns workflow-state persistence, recovery or data conversion.

The shared [definition contract](../src/types.ts) explicitly supports schema strings 1.0 and 2.0. The current installed builtin is feature_spec with schema 2.0. Definition schema, GateResult schema and product release version are independent.

Methods: loadFromFile, loadFromJSON, loadFromYAML, loadFromObject and validate. File loading supports .json/.yaml/.yml; the YAML reader is deliberately limited. It is not a general YAML implementation. Use the official current builtin and its release producer rather than introducing another workflow.

Missing/unknown schema fails closed; loading never supplies a missing schema_version or converts an older format. Preserve source bytes and exact validation errors. Directory loading validates the complete set before publishing new catalog entries. A missing required builtin is an error, not a successful empty set. Register and reload use the same acceptance boundary.

```typescript
import { WorkflowDefinitionLoader } from '@specforge/workflow-runtime';
const loader = new WorkflowDefinitionLoader();
// Parse only an explicitly versioned definition supplied by its owner:
const loadDefinition = (json: string) => loader.loadFromJSON(json);
```

A loaded definition is not evidence of execution, valid permissions or state progression. Runtime/StateManager and controlled Gate/Tool owners retain that responsibility. There is no current registerMigration/migrate loader responsibility.

See [API boundary](API.md), [deployment](DEPLOYMENT.md), [Gate results](GateResult.md) and [SPS §8/§15](../../../docs/product-specification/specforge-product-specification.md). Pre-audit examples are retained in the audit archive as historical evidence.
