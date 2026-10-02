/**
 * SpecForge Thin Plugin entrypoint.
 *
 * OpenCode invokes every distinct exported function in a plugin module. Keep
 * this discovery module limited to one default function; reusable helpers live
 * under sf-user/lib where OpenCode does not auto-load them as plugins.
 * Business state, WriteGuard decisions and filesystem tools remain Daemon-owned.
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface PluginInputLike {
  directory?: string;
}

function resolveOpenCodeConfigRoot(): string {
  const explicit = process.env.OPENCODE_CONFIG_DIR?.trim();
  if (explicit) return resolve(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return resolve(xdg, 'opencode');
  return resolve(homedir(), '.config', 'opencode');
}

function resolveSpecForgePrivateRoot(): string {
  return resolve(resolveOpenCodeConfigRoot(), 'sf-user');
}

async function sfSpecForge(input: PluginInputLike) {
  const privateRoot = resolveSpecForgePrivateRoot();
  const clientModuleUrl = pathToFileURL(resolve(privateRoot, 'lib', 'sf_plugin_client.ts')).href;
  const implementationModuleUrl = pathToFileURL(resolve(privateRoot, 'lib', 'sf_thin_plugin.ts')).href;
  const { createSpecForgeThinPlugin } = await import(implementationModuleUrl);
  const { createReconnectingDaemonClient } = await import(clientModuleUrl);
  return createSpecForgeThinPlugin(input, {
    client: createReconnectingDaemonClient({
      initialDelayMs: 250,
      maxCumulativeBackoffMs: 5000,
      backoffFactor: 2,
    }),
    notify: (message: string) => console.log(`[sf:specforge] ${message}`),
  });
}

export default sfSpecForge;
