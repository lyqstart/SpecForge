# Permission Engine Project Structure

> **历史实施证据**：本文件记录形成时的实现、测试和计划，不是当前 API、安装、权限或项目状态说明。原始字节封存于 `docs/archive/2026-11-08-crossplatform-consumer-audit/original-documents/`。当前产品边界见 SPS 与 Authority Registry；当前使用说明见本包 README，实际执行仍需当前受控入口。

## Overview
This document describes the project structure and build configuration for the Permission Engine module.

## Directory Structure

```
permission-engine/
├── src/                    # Source code
�?  ├── types/             # TypeScript type definitions
�?  �?  └── index.ts       # Permission-related interfaces
�?  ├── models/            # Data models and schemas
�?  �?  └── index.ts       # Zod schemas for validation
�?  ├── services/          # Business logic services
�?  �?  └── index.ts       # Permission service implementation
�?  ├── utils/             # Utility functions
�?  �?  └── index.ts       # Helper utilities
�?  └── index.ts           # Main entry point
├── tests/                 # Test files
�?  ├── unit/              # Unit tests
�?  �?  └── permission-engine.test.ts
�?  ├── integration/       # Integration tests
�?  ├── property/          # Property-based tests
�?  └── helpers/           # Test helpers
├── dist/                  # Build output
�?  └── src/              # Compiled JavaScript and type definitions
├── scripts/               # Build and utility scripts
�?  └── verify-build.js   # Build verification script
├── package.json           # Module dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Test configuration
├── eslint.config.js       # ESLint configuration (ESLint v9)
├── .prettierrc.json       # Prettier configuration
├── .gitignore            # Git ignore rules
├── README.md             # Module documentation
└── PROJECT_STRUCTURE.md  # This file
```

## Build Configuration

### TypeScript Configuration (tsconfig.json)
- Target: ES2022
- Module: ESNext
- Module Resolution: bundler
- Strict mode enabled
- Declaration files generated
- Source maps enabled
- Path aliases: `@/*` �?`src/*`, `@tests/*` �?`tests/*`

### Package Scripts
- `bun run build` - Compile TypeScript
- `bun run build:watch` - Watch mode compilation
- `bun run test` - Run all tests
- `bun run test:watch` - Watch mode testing
- `bun run test:coverage` - Run tests with coverage
- `bun run test:property` - Run property-based tests
- `bun run test:unit` - Run unit tests only
- `bun run test:integration` - Run integration tests only
- `bun run lint` - Lint source code
- `bun run format` - Format code with Prettier
- `bun run dev` - Development mode (build + test watch)

### Dependencies
- Runtime: `zod` (schema validation)
- Development: TypeScript, ESLint, Prettier, Vitest, fast-check
- Workspace: `@specforge/daemon-core` (integration)

### Testing Configuration
- Test framework: Vitest
- Test environment: Node.js
- Coverage provider: v8
- Property-based testing: fast-check
- Test structure: Unit, Integration, Property-based tests

## Workspace Integration
The module is configured as part of the SpecForge monorepo:
- Added to `package-workspace.json` workspaces array
- Uses workspace dependencies (`workspace:*`)
- Builds independently but can be built from root

## Verification
Run `node scripts/verify-build.js` to verify the build configuration is complete and working.

## Next Steps
1. Implement Agent Constitution hard rules (Task 1.2)
2. Implement permission event logging (Task 1.3)
3. Implement three-layer permission model (Phase 2 tasks)
4. Implement property-based tests (Phase 5 tasks)