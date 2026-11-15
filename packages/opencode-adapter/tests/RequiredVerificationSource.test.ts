import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readRequiredVerificationSource } from '../src/integration/required-verification-source';

const directory = path.resolve('required-verification-source-fixture');
function fixture(delegated = false) {
  const text = 'SPECFORGE_REQUIRED_VERIFICATION_V1_BEGIN\n' + JSON.stringify({
    schema_version: '1.0', profile: 'candidate-exact-file-sha256/v1', work_item_id: 'WI-0001',
    project_spec_manifest_sha256: 'a'.repeat(64), candidate_generation: 'c'.repeat(64),
    requirements: [{ id: 'RV-trace', path: 'candidates/trace_delta.md', owner: 'sf-task-planner', expected_sha256: 'b'.repeat(64) }],
  }) + '\nSPECFORGE_REQUIRED_VERIFICATION_V1_END';
  const sessionId = delegated ? 'ses_child' : 'ses_root';
  const request = { sessionId, messageId: 'msg_call', callId: 'call_current', directory, tool: 'sf_artifact_write', args: { work_item_id: 'WI-0001' } };
  const user = { info: { id: 'msg_user', sessionID: 'ses_root', role: 'user', time: { created: Date.now() - 1000 } }, parts: [{ type: 'text', text, sessionID: 'ses_root', messageID: 'msg_user' }] };
  const current = { info: { id: 'msg_call', sessionID: sessionId, role: 'assistant', path: { cwd: directory }, time: { created: Date.now() - 500 }, agent: delegated ? 'sf-task-planner' : 'sf-orchestrator', parentID: delegated ? 'msg_delegated' : 'msg_user' }, parts: [{ type: 'tool', sessionID: sessionId, messageID: 'msg_call', callID: 'call_current', tool: request.tool, state: { status: 'running', time: { start: Date.now() - 100 }, input: request.args } }] };
  const parent = { info: { id: 'msg_parent', sessionID: 'ses_root', role: 'assistant', path: { cwd: directory }, time: { created: Date.now() - 500 }, agent: 'sf-orchestrator', parentID: 'msg_user' }, parts: [{ type: 'tool', sessionID: 'ses_root', messageID: 'msg_parent', callID: 'call_delegate', tool: 'task', state: { status: 'running', time: { start: Date.now() - 100 }, input: {}, metadata: { sessionId: 'ses_child' } } }] };
  const sessions: Record<string, unknown> = { ses_root: { id: 'ses_root', directory }, ses_child: { id: 'ses_child', directory, parentID: 'ses_root' } };
  const messages: Record<string, unknown> = { ses_root: delegated ? [user, parent] : [user, current], ses_child: [current] };
  const get = async (route: string) => {
    const parts = new URL(route, 'http://fixture.invalid').pathname.split('/');
    if (parts[3] === 'message' && parts[4]) return user;
    if (parts[3] === 'message') return messages[parts[2]!];
    return sessions[parts[2]!];
  };
  return { request, get, user, current, parent, sessions, messages, text };
}

describe('D31 real Runtime source traversal', () => {
  it('binds current direct call to the exact source user text', async () => {
    const f = fixture();
    const p = await readRequiredVerificationSource(f.request, f.get);
    expect(p.userTextSha256).toBe(createHash('sha256').update(f.text).digest('hex'));
    expect(p.declaration?.requirements).toHaveLength(1);
    expect(p.userMessageId).toBe('msg_user');
  });
  it('follows the live parent task rather than trusting the delegated prompt', async () => {
    const f = fixture(true);
    const p = await readRequiredVerificationSource(f.request, f.get);
    expect(p.userSessionId).toBe('ses_root');
    expect(p.agent).toBe('sf-task-planner');
  });
  it.each(['completed', 'error'])('rejects %s current calls', async status => {
    const f = fixture(); f.current.parts[0]!.state.status = status;
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('LIVE_CALL');
  });
  it('rejects caller input substitution', async () => {
    const f = fixture();
    await expect(readRequiredVerificationSource({ ...f.request, args: { work_item_id: 'WI-0002' } }, f.get)).rejects.toThrow('LIVE_CALL');
  });
  it('rejects cross-project session identity', async () => {
    const f = fixture(); f.sessions.ses_root = { id: 'ses_root', directory: path.resolve('another-project') };
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('PROJECT');
  });
  it('rejects an orphan child whose parent task is no longer running', async () => {
    const f = fixture(true); f.parent.parts[0]!.state.status = 'completed';
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('LIVE_DELEGATION');
  });
  it('rejects multiple live task claims for the same child', async () => {
    const f = fixture(true); f.messages.ses_root = [f.parent, structuredClone(f.parent)];
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('LIVE_DELEGATION');
  });
  it('rejects a malformed explicit declaration instead of returning no obligation', async () => {
    const f = fixture(); f.user.parts[0]!.text = 'SPECFORGE_REQUIRED_VERIFICATION_V1_BEGIN';
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('DECLARATION_INVALID');
  });
  it('does not infer obligations from arbitrary natural language', async () => {
    const f = fixture(); f.user.parts[0]!.text = 'Please inspect the report.';
    expect((await readRequiredVerificationSource(f.request, f.get)).declaration).toBeNull();
  });
  it('rejects a role that only imitates the sf prefix', async () => {
    const f = fixture(); f.current.info.agent = 'sf-unregistered';
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('AGENT');
  });
  it('requires the orchestrator to own the delegation', async () => {
    const f = fixture(true); f.parent.info.agent = 'sf-task-planner';
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('DELEGATION_OWNER');
  });
  it('rejects cancellation while reading the source', async () => {
    const f = fixture();
    const get = async (route: string) => {
      const result = await f.get(route);
      if (route.includes('/message/msg_user')) f.current.parts[0]!.state.status = 'completed';
      return result;
    };
    await expect(readRequiredVerificationSource(f.request, get)).rejects.toThrow('CALL_CHANGED');
  });
  it('rejects parent cancellation after source acquisition', async () => {
    const f = fixture(true);
    const get = async (route: string) => {
      const result = await f.get(route);
      if (route.includes('/message/msg_user')) f.parent.parts[0]!.state.status = 'completed';
      return result;
    };
    await expect(readRequiredVerificationSource(f.request, get)).rejects.toThrow('CALL_CHANGED');
  });
  it('rejects source replacement during the final recheck', async () => {
    const f = fixture(); let reads = 0;
    const get = async (route: string) => {
      if (route.includes('/message/msg_user') && ++reads === 2) f.user.parts[0]!.text = 'replaced';
      return f.get(route);
    };
    await expect(readRequiredVerificationSource(f.request, get)).rejects.toThrow('USER_CHANGED');
  });
  it('does not ignore a newer user instruction while an older tool remains live', async () => {
    const f = fixture();
    f.messages.ses_root = [f.user, f.current, { info: { ...f.user.info, id: 'msg_new', time: { created: Date.now() } }, parts: [] }];
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('NEWER_USER_TURN');
  });
  it('rejects a call from an older live turn when a new user arrives during lookup', async () => {
    const f = fixture();
    const get = async (route: string) => {
      const result = await f.get(route);
      if (route.includes('/message/msg_user')) f.messages.ses_root = [f.user, f.current, { info: { ...f.user.info, id: 'msg_new', time: { created: Date.now() } }, parts: [] }];
      return result;
    };
    await expect(readRequiredVerificationSource(f.request, get)).rejects.toThrow('NEWER_USER_TURN');
  });
  it('rejects incomplete Runtime windows without the source turn', async () => {
    const f = fixture(); f.messages.ses_root = [f.current];
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('USER_NOT_IN_CURRENT_WINDOW');
  });
  it('rejects future source text and stale live invocations', async () => {
    const f = fixture(); f.user.info.time.created = Date.now();
    await expect(readRequiredVerificationSource(f.request, f.get)).rejects.toThrow('USER_TIME');
    const stale = fixture(); stale.current.info.time.created -= 400000; stale.current.parts[0]!.state.time.start -= 400000;
    await expect(readRequiredVerificationSource(stale.request, stale.get)).rejects.toThrow('FRESHNESS');
  });
});
