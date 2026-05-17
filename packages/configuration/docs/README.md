# @specforge/configuration

Configuration subsystem documentation for SpecForge V6.

## Documentation Structure

- **[Configuration Format](configuration-format.md)** - JSON schema documentation and configuration structure
- **[Examples](examples.md)** - Comprehensive usage examples (CLI, programmatic API, hot-reload)
- **[Best Practices](best-practices.md)** - Best practices for configuration management

## Quick Links

- [JSON Schema Reference](./configuration-format.md)
- [Usage Examples](./examples.md)
- [Best Practices Guide](./best-practices.md)
- [API Reference](../src/index.ts)

---

## Topics Covered

### Configuration Format
- Four-layer configuration model (builtin, user, project, runtime)
- JSON schema with all configuration options
- Sensitive fields list and protection mechanism
- Hot-reload behavior and activation boundary

### Examples (Comprehensive)
- **CLI Configuration** - Environment variables, CLI flags, priority/precedence
- **Programmatic API** - Basic usage, layer access, source tracking, value interpolation
- **Hot-Reload Scenarios** - File watcher integration, reload events, per-workflow configuration
- Basic configuration templates
- Development and production environments
- API keys and credentials setup

### Best Practices
- Configuration organization guidelines
- Sensitive data management
- Environment-specific configuration
- Hot-reload optimization
- Security considerations
- Troubleshooting guide

---

**schema_version: 1.0**