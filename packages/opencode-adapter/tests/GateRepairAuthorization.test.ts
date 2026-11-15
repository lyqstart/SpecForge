import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { OpenCodeHttpRuntimeClient } from '../src/integration/OpenCodeHttpRuntimeClient';

function fixture(change?: (user: any, assistant: any) => void) {
  const now = Date.now(),
    directory = path.resolve('synthetic-gate-repair-project');
  const history = 'c'.repeat(64);
  const quote = `Authorize one diagnosed repair.\ngate_owner_repair_once WI-0001 attempt-0002 ${history}`;
  const args = {
    work_item_id: 'WI-0001',
    user_response_quote: quote,
    diagnostic_user_message_id: 'msg_user',
  };
  const user = {
    info: { id: 'msg_user', sessionID: 'ses_current', role: 'user', time: { created: now - 2000 } },
    parts: [{ type: 'text', text: quote, sessionID: 'ses_current', messageID: 'msg_user' }],
  };
  const assistant = {
    info: {
      id: 'msg_assistant',
      sessionID: 'ses_current',
      role: 'assistant',
      agent: 'sf-orchestrator',
      parentID: 'msg_user',
      path: { cwd: directory },
    },
    parts: [
      {
        type: 'tool',
        sessionID: 'ses_current',
        messageID: 'msg_assistant',
        callID: 'call_actual',
        tool: 'sf_hard_stop_resolve',
        state: { status: 'running', input: args, time: { start: now - 1000 } },
      },
    ],
  };
  change?.(user, assistant);
  const fetchFn = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const body = url.pathname.endsWith('/msg_user')
      ? user
      : url.pathname.endsWith('/msg_assistant')
        ? assistant
        : { id: 'ses_current', directory };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return {
    client: new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch }),
    request: {
      invocation: {
        sessionId: 'ses_current',
        messageId: 'msg_assistant',
        directory,
        tool: 'sf_hard_stop_resolve' as const,
        args,
      },
      userMessageId: 'msg_user',
      userText: quote,
      workItemId: 'WI-0001',
      attemptId: 'attempt-0002',
      historySha256: history,
      completedAt: new Date(now - 3000).toISOString(),
    },
  };
}
describe('Gate diagnostic authorization from actual Runtime projections', () => {
  it('binds fresh user parent, directory, exact text, history and running orchestrator call', async () => {
    const { client, request } = fixture();
    const proof = await client.verifyGateRepairAuthorization(request);
    expect(proof.source).toBe('gate-repair-diagnostic/v1');
    expect(proof.invocation.callId).toBe('call_actual');
    expect(proof.historySha256).toBe(request.historySha256);
  });
  it.each([
    [
      'assistant-authored text',
      (u: any) => {
        u.info.role = 'assistant';
      },
    ],
    [
      'other session',
      (u: any) => {
        u.info.sessionID = 'ses_other';
      },
    ],
    [
      'stale authorization',
      (u: any) => {
        u.info.time.created = 1;
      },
    ],
    [
      'synthetic text',
      (u: any) => {
        u.parts[0].synthetic = true;
      },
    ],
    [
      'changed quote',
      (u: any) => {
        u.parts[0].text += ' changed';
      },
    ],
    [
      'different parent',
      (_u: any, a: any) => {
        a.info.parentID = 'msg_other';
      },
    ],
    [
      'wrong owner',
      (_u: any, a: any) => {
        a.info.agent = 'sf-executor';
      },
    ],
    [
      'completed tool',
      (_u: any, a: any) => {
        a.parts[0].state.status = 'completed';
      },
    ],
    [
      'different call input',
      (_u: any, a: any) => {
        a.parts[0].state.input = {};
      },
    ],
  ])('rejects %s', async (_name, change) => {
    const { client, request } = fixture(change as (user: any, assistant: any) => void);
    await expect(client.verifyGateRepairAuthorization(request)).rejects.toThrow();
  });
  it('rejects a marker binding another attempt even when the quote is genuine', async () => {
    const { client, request } = fixture();
    request.attemptId = 'attempt-0003';
    await expect(client.verifyGateRepairAuthorization(request)).rejects.toThrow(
      'FRESH_BOUND_USER_AUTHORIZATION'
    );
  });
});
