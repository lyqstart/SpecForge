/**
 * SpecForge Thin Plugin implementation.
 *
 * This module is installed under sf-user/lib and is not an OpenCode plugin
 * discovery entrypoint. Exported helpers are therefore safe for tests and
 * dependency injection.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

export interface PluginInputLike {
  directory?: string;
}

interface RegisterResponse {
  sessionId: string;
  projectId: string;
  mode: 'personal' | 'enterprise';
}

interface PostResult {
  ok: boolean;
  dropped: boolean;
  reason: 'success' | 'degraded' | 'disposed' | 'rejected';
}

export interface ThinPluginDaemonClient {
  register(projectPath: string): Promise<RegisterResponse>;
  postEvent(sessionId: string, type: string, data: unknown): Promise<PostResult>;
}

export interface ThinPluginDependencies {
  client: ThinPluginDaemonClient;
  notify: (message: string) => void;
}

export interface ThinPluginHooks {
  event(input: { event?: { type?: string; [key: string]: unknown } }): Promise<void>;
  'experimental.session.compacting'(input: { sessionID?: string }): Promise<void>;
}

type ConnectionState = 'disconnected' | 'connected' | 'degraded';
const COMPACTION_BRIDGE_TIMEOUT_MS = 6000;

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

function resolveCompactionBridgeLogPath(): string {
  return resolve(resolveSpecForgePrivateRoot(), 'runtime', 'compaction-bridge.jsonl');
}

function appendCompactionBridgeEvent(
  event: string,
  details: Record<string, unknown> = {},
): void {
  try {
    const logPath = resolveCompactionBridgeLogPath();
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify({
      schema_version: '1.0',
      ts: new Date().toISOString(),
      event,
      ...details,
    })}\n`, 'utf8');
  } catch {
    // Diagnostics must never break plugin loading or OpenCode compaction.
  }
}

async function awaitWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function createSpecForgeThinPlugin(
  input: PluginInputLike,
  dependencies: ThinPluginDependencies,
): Promise<ThinPluginHooks> {
  const projectDir = input.directory ?? process.cwd();
  const projectPath = projectDir;
  const daemonClient = dependencies.client;
  let daemonSessionId: string | undefined;
  let state: ConnectionState = 'disconnected';

  const register = async (): Promise<void> => {
    const registration = await dependencies.client.register(projectPath);
    daemonSessionId = registration.sessionId;
  };

  async function forwardCompactionCheckpoint(
    checkpointProjectDir: string,
    opencodeSessionId: string,
  ): Promise<void> {
    appendCompactionBridgeEvent('checkpoint.forward.start', {
      projectDir: checkpointProjectDir,
      opencodeSessionId,
    });
    const registration = await daemonClient.register(checkpointProjectDir);
    appendCompactionBridgeEvent('checkpoint.project.registered', {
      projectDir: checkpointProjectDir,
      opencodeSessionId,
      daemonSessionId: registration.sessionId,
      projectId: registration.projectId,
      mode: registration.mode,
    });
    const result = await daemonClient.postEvent(
      registration.sessionId,
      'session.compacting',
      {
        schema_version: '1.0',
        source: 'opencode.experimental.session.compacting',
        phase: 'pre-compaction',
        projectPath: checkpointProjectDir,
        opencodeSessionId,
        capturedAt: new Date().toISOString(),
      },
    );
    appendCompactionBridgeEvent('checkpoint.event.result', {
      projectDir: checkpointProjectDir,
      opencodeSessionId,
      daemonSessionId: registration.sessionId,
      ok: result.ok,
      dropped: result.dropped,
      reason: result.reason,
    });
    if (!result.ok) throw new Error(`daemon rejected checkpoint event: ${result.reason}`);
  }

  const bootstrap = async (): Promise<void> => {
    await register();
    dependencies.notify('Daemon connected.');
  };

  try {
    await bootstrap();
  } catch (error) {
    state = 'degraded';
    dependencies.notify(
      `Daemon unavailable; lifecycle is externally managed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    async event({ event }): Promise<void> {
      if (!event?.type) return;
      if (!daemonSessionId) {
        try {
          await register();
        } catch (error) {
          state = 'degraded';
          dependencies.notify(
            `Daemon reconnecting: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
      }

      const result = await dependencies.client.postEvent(
        daemonSessionId,
        `opencode.${event.type}`,
        {
          schema_version: '1.0',
          projectPath,
          ...event,
        },
      );
      if (!result.ok) {
        if (state !== 'degraded') dependencies.notify(`Daemon reconnecting: ${result.reason}.`);
        state = 'degraded';
        return;
      }
      if (state === 'degraded') dependencies.notify('Daemon connection recovered.');
      state = 'connected';
    },
    'experimental.session.compacting': async ({ sessionID }): Promise<void> => {
      const opencodeSessionId = String(sessionID ?? '').trim();
      appendCompactionBridgeEvent('compaction.hook.received', {
        projectDir,
        opencodeSessionId,
      });
      if (!opencodeSessionId) {
        appendCompactionBridgeEvent('compaction.hook.skipped', {
          projectDir,
          reason: 'missing_opencode_session_id',
        });
        return;
      }
      try {
        await awaitWithTimeout(
          forwardCompactionCheckpoint(projectDir, opencodeSessionId),
          COMPACTION_BRIDGE_TIMEOUT_MS,
          'compaction checkpoint bridge',
        );
        appendCompactionBridgeEvent('compaction.hook.completed', {
          projectDir,
          opencodeSessionId,
        });
      } catch (error) {
        appendCompactionBridgeEvent('compaction.hook.failed', {
          projectDir,
          opencodeSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Checkpoint persistence must never fail OpenCode compaction.
        dependencies.notify(
          `Compaction checkpoint forwarding failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
