# @specforge/observability

Current supporting module for neutral diagnostic/event contracts and observability policy. Authority: [SPS §14](../../docs/product-specification/specforge-product-specification.md).

The runtime package entry exports shared types/utilities and the configuration parser/serializer/descriptor. TypeScript interfaces such as EventBus, EventLogger, CAS and QueryAPI do not establish constructible public implementations or an independent workflow WAL. StateManager and Daemon own authoritative workflow events; diagnostics cannot advance state.

```typescript
import { parseObservabilityConfigDocument, serializeObservabilityConfigDocument } from '@specforge/observability';

const policy = parseObservabilityConfigDocument({ schema_version: '1.0', mode: 'standard' });
const document = serializeObservabilityConfigDocument(policy.mode);
```

This example validates/serializes an object; it does not write project policy. Controlled Project Init creates the current policy file. Project registration validates its independent schema.

- [Current API](docs/api.md)
- [Operating guide](docs/user-guide.md)
- [Investigation method](docs/north-star-scenarios.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Current exports](src/index.ts)
- [Daemon recorder](../daemon-core/src/observability/observability-recorder.ts)

Deploy through the [official installer](../../docs/user/install.md). Historical standalone query/analyst examples are retained as development history; they are not current installed API or authority. Do not run them as deployment, recovery or evidence-repair instructions.
