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
  checkNativeTool?(projectPath: string, tool: string, args: Record<string, unknown>): Promise<void>;
}

export interface ThinPluginDependencies {
  client: ThinPluginDaemonClient;
  notify: (message: string) => void;
}

export interface ThinPluginHooks {
  'tool.execute.before'(input: { tool: string; sessionID?: string; callID?: string }, output: { args: Record<string, unknown> }): Promise<void>;
  event(input: { event?: { type?: string; [key: string]: unknown } }): Promise<void>;
  'experimental.session.compacting'(input: { sessionID?: string }): Promise<void>;
}

type ConnectionState = 'disconnected' | 'connected' | 'degraded' | 'awaiting-initialization';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInitializationRefusal(error: unknown): boolean {
  return isRecord(error) && error.status === 409 && error.code === 'PROJECT_NOT_INITIALIZED';
}

function completedInitializationKey(event: Record<string, unknown>): string | undefined {
  if (event.type !== 'message.part.updated' || !isRecord(event.properties)) return;
  const part = event.properties.part;
  if (!isRecord(part) || part.type !== 'tool' || part.tool !== 'sf_project_init' ||
      !isRecord(part.state) || part.state.status !== 'completed' ||
      typeof part.sessionID !== 'string' || !part.sessionID ||
      typeof part.callID !== 'string' || !part.callID) return;
  return JSON.stringify([part.sessionID, part.callID]);
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
  let registering: Promise<boolean> | undefined;
  let recoveryRevision = 0;
  const completedInitializations = new Set<string>();

  function registrationFailed(error: unknown): void {
    const waiting = isInitializationRefusal(error);
    const next = waiting ? 'awaiting-initialization' : 'degraded';
    const previous = state;
    state = next;
    if (waiting) daemonSessionId = undefined;
    if (previous === next) return;
    dependencies.notify(waiting
      ? '项目尚未初始化；请切换到 sf-orchestrator 并调用 sf_project_init。初始化完成后会自动重新注册。'
      : `Daemon unavailable; lifecycle is externally managed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const register = async (): Promise<boolean> => {
    if (registering) return registering;
    const attempt = (async (): Promise<boolean> => {
      for (;;) {
        const revision = recoveryRevision;
        try {
          const registration = await daemonClient.register(projectPath);
          daemonSessionId = registration.sessionId;
          const previous = state;
          state = 'connected';
          if (previous !== 'connected') dependencies.notify(previous === 'disconnected'
            ? 'Daemon connected.' : 'Daemon connection recovered.');
          return true;
        } catch (error) {
          registrationFailed(error);
          // A newer completed init may race an older request rejected before
          // that init. One shared registration owner consumes the new revision.
          if (revision === recoveryRevision) return false;
        }
      }
    })();
    registering = attempt;
    try { return await attempt; }
    finally { if (registering === attempt) registering = undefined; }
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

  await register();

  return {
    'tool.execute.before': async (toolInput, output): Promise<void> => {
      if (!daemonClient.checkNativeTool) throw new Error('WRITE_GUARD_UNAVAILABLE: update the SpecForge daemon client');
      // OpenCode awaits this hook before execution; rejection must propagate.
      await daemonClient.checkNativeTool(projectPath, toolInput.tool, output.args);
    },
    async event({ event }): Promise<void> {
      if (!event?.type) return;
      const completed = completedInitializationKey(event);
      if (completed && !completedInitializations.has(completed)) {
        completedInitializations.add(completed);
        // Only retain bounded runtime delivery identities, never business state.
        if (completedInitializations.size > 128) completedInitializations.delete(completedInitializations.values().next().value!);
        recoveryRevision++;
        if (!daemonSessionId && !(await register())) return;
      }
      if (!daemonSessionId) {
        if (state === 'awaiting-initialization') return;
        if (!(await register())) return;
      }

      const result = await daemonClient.postEvent(
        daemonSessionId!,
        `opencode.${event.type}`,
        { schema_version: '1.0', projectPath, ...event },
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
      if (state === 'awaiting-initialization') {
        appendCompactionBridgeEvent('compaction.hook.skipped', { projectDir, opencodeSessionId, reason: 'project_initialization_required' });
        return;
      }
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
        if (isInitializationRefusal(error)) { registrationFailed(error); return; }
        // Checkpoint persistence must never fail OpenCode compaction.
        dependencies.notify(
          `Compaction checkpoint forwarding failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
