# Plugin With Permissions Demo

This example demonstrates how to declare and use permissions in a plugin manifest.

## Permission Declaration

Permissions are declared in the `plugin.json` file under the `permissions` array:

```json
{
  "permissions": [
    "filesystem.read",
    "filesystem.write",
    "network",
    "child_process"
  ]
}
```

## Available Permissions

| Permission | Description | Blocked APIs |
|------------|-------------|--------------|
| `filesystem.read` | Read files from allowed directories | `fs.readFile`, `fs.readFileSync`, `fs.readdir`, etc. |
| `filesystem.write` | Write files to allowed directories | `fs.writeFile`, `fs.writeFileSync`, `fs.mkdir`, etc. |
| `network` | Make network requests | `fetch`, `http.request`, `https.request`, `net.connect`, etc. |
| `child_process` | Execute external commands | `spawn`, `exec`, `execSync`, `fork`, etc. |

## How It Works

1. **Manifest Declaration**: The plugin declares required permissions in `plugin.json`
2. **Static Analysis**: When the plugin is loaded, the static analyzer scans the code
3. **Permission Check**: If the code uses any sensitive APIs, the analyzer checks if the required permission is declared
4. **Violation Report**: If a permission is missing, a violation is reported and the plugin may be blocked

## Example Usage

```javascript
import { readConfig, writeCache, fetchData, runCommand } from './index.js';

// Read a config file (requires filesystem.read)
const config = await readConfig('./config.json');

// Write to cache (requires filesystem.write)
await writeCache('./cache/data.json', JSON.stringify(data));

// Fetch data from API (requires network)
const result = await fetchData('https://api.example.com/data');

// Run a command (requires child_process)
const output = await runCommand('ls -la');
```

## Without Permissions

If you remove any permission from the manifest, the static analyzer will report a violation when the plugin tries to use the corresponding API.

For example, without `child_process` permission:
```
Violation: 使用禁止的 API 'exec'
  File: index.js
  Line: 87
  需要权限: child_process
```

## See Also

- [Simple Example Plugin](../simple-example/) - A basic plugin without permissions
- [Plugin Developer Guide](../../../docs/plugin-development.md)
- [Permission Configuration Guide](../../../docs/permission-config.md)