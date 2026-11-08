# Workflow Runtime deployment boundary

Workflow Runtime is a module composed into SpecForge's CLI/Daemon build. It does not start a service, discover clients, own a runtime directory, or persist workflow state independently. Install and lifecycle operations belong to the existing user-level Installer and Daemon owners; no standalone workflow service or persistenceDir is configured.

The public package entry is closed to private deep imports. Current package builds remove only the fixed retired persistence outputs before compiling, so old dist files cannot re-enter the package through a previous build. The release build and installer must still verify their exact registered artifacts.

See [SPS §8](../../../docs/product-specification/specforge-product-specification.md). The previous standalone configuration examples are retained only as [historical evidence](../../../docs/archive/2026-11-07-verification-production/workflow-persistence-baseline/original/packages/workflow-runtime/docs/DEPLOYMENT.md).
