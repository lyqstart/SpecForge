# @specforge/permission-engine

Permission Engine module for SpecForge V6 architecture.

## Overview

The Permission Engine provides fine-grained access control and authorization capabilities for the SpecForge V6 architecture. It handles user permissions, role-based access control (RBAC), and resource-level authorization.

## Features

- Role-based access control (RBAC)
- Permission inheritance and composition
- Resource-level authorization
- Permission validation and checking
- Integration with daemon-core events

## Installation

```bash
# From workspace root
bun install
```

## Development

```bash
# Build the module
bun run build

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage

# Run property-based tests
bun run test:property

# Development mode (watch mode)
bun run dev

# Lint code
bun run lint

# Format code
bun run format
```

## Project Structure

```
permission-engine/
├── src/                    # Source code
�?  ├── types/             # TypeScript type definitions
�?  ├── models/            # Data models and schemas
�?  ├── services/          # Business logic services
�?  ├── utils/             # Utility functions
�?  └── index.ts           # Main entry point
├── tests/                 # Test files
�?  ├── unit/              # Unit tests
�?  ├── integration/       # Integration tests
�?  ├── property/          # Property-based tests
�?  └── helpers/           # Test helpers
├── package.json           # Module dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Test configuration
├── .eslintrc.json         # ESLint configuration
├── .prettierrc.json       # Prettier configuration
└── README.md              # This file
```

## Dependencies

- `@specforge/types`: Shared TypeScript types
- `@specforge/daemon-core`: Core daemon functionality
- `zod`: Schema validation

## License

MIT