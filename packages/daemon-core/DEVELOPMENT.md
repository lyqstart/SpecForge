# Daemon Core - Development Guide

## Quick Start

```bash
cd packages/daemon-core
bun install
bun run build
```

## Development Workflow

1. **Run tests** before making changes:
   ```bash
   bun run test
   ```

2. **Format code** before committing:
   ```bash
   bun run format
   ```

3. **Run lint** to catch issues:
   ```bash
   bun run lint
   ```

4. **Build** to verify compilation:
   ```bash
   bun run build
   ```

## Testing

### Unit Tests

```bash
bun run test
```

### Property-Based Tests

Property-based tests are in `tests/property/` and test architectural invariants:

```bash
# Run all tests including PBTs
bun run test

# Run only PBTs (requires fast-check)
bun run test:pbt
```

### Coverage

```bash
bun run test:coverage
```

## Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured with TypeScript support
- **Prettier**: Single quotes, semicolons, 100 char width

## Architecture

See the current Product Specification: `docs/product-specification/specforge-product-specification.md`.

## Requirements

See the authority roles in `docs/product-specification/authority-registry.md`. Historical daemon-core material is under `docs/archive/kiro/specs/daemon-core/`.

## Correctness Properties

This module implements the following Correctness Properties from v6-architecture-overview:

- Property 1: Single Source of Truth
- Property 2: Event Bus Traversal
- Property 5: Session Identity Stability
- Property 6: Idempotent Recovery
- Property 7: WAL Ordering
- Property 20: Recovery Consistency Repair
- Property 21: Session WAL Replay Scope
- Property 22: Project Isolation
- Property 30: Event Schema Multi-sync Readiness

Each property has corresponding tests in `tests/property/`.
