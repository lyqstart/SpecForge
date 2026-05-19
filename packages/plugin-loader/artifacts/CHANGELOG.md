# CHANGELOG - Plugin Loader

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial plugin loader subsystem for SpecForge V6
- Plugin manifest parsing and validation
- Static security analysis (AST-based forbidden API detection)
- File system path checking (escape detection, whitelist support)
- Authorization management with multi-level configuration
- Plugin registry with dependency resolution
- Hot reload support with file system watching
- Event bus integration
- Audit logging

### Features

- Plugin discovery mechanism
- Complete loading workflow
- Error handling with categorization
- Configuration hot reload
- Runtime state monitoring

### Property Tests

- PL-1: Permission declaration validation
- PL-2: Static check consistency
- PL-4: Event traceability
- PL-5: Hot reload consistency
- PL-6: Dependency resolution correctness

## [1.0.0] - 2026-05-17

### Added

- Initial release of @specforge/plugin-loader
- Core plugin loading functionality
- Security static analysis
- Authorization system
- Event integration
- Documentation and examples

---

## Version History

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| 1.0.0 | 2026-05-17 | Released | Initial V6.0 release |
| 0.0.0 | - | Development | Pre-release development |

---

## Migration Notes

For users upgrading from previous versions, please refer to the [Migration Guide](./migration-guide.md).

## Upgrade Path

- From 0.x to 1.0: See migration guide for breaking changes
- Future updates will follow semantic versioning

---

## Deprecation Timeline

No deprecations at this time.

---

## Known Issues

Please refer to the project's issue tracker for known issues and workarounds.

## Security Advisories

For security-related issues, please follow the project's security policy.