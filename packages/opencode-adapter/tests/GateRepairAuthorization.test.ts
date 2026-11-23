import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { OpenCodeHttpRuntimeClient } from '../src/integration/OpenCodeHttpRuntimeClient';

function fixture(
  change?: (user: any, assistant: any) => void,
  transformQuote: (quote: string) => string = quote => quote
) {
  const now = Date.now(),
    directory = path.resolve('synthetic-gate-repair-project');
  const history = 'c'.repeat(64);
  const quote = transformQuote(
    `Authorize one diagnosed repair.\ngate_owner_repair_once WI-0001 attempt-0002 ${history}`
  );
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
  it('discovers an omitted user ID from the verified current assistant parent', async () => {
    const { client, request } = fixture();
    const { userMessageId: _explicit, ...derived } = request;
    delete (derived.invocation.args as Record<string, unknown>).diagnostic_user_message_id;
    const proof = await client.verifyGateRepairAuthorization(derived);
    expect(proof.userMessageId).toBe('msg_user');
    expect(proof.invocation.callId).toBe('call_actual');
  });
  it('binds fresh user parent, directory, exact text, history and running orchestrator call', async () => {
    const { client, request } = fixture();
    const proof = await client.verifyGateRepairAuthorization(request);
    expect(proof.source).toBe('gate-repair-diagnostic/v1');
    expect(proof.invocation.callId).toBe('call_actual');
    expect(proof.historySha256).toBe(request.historySha256);
  });
  const exactTextCases = [
    { name: 'terminal LF', wrap: (quote: string) => `${quote}\n` },
    { name: 'CRLF', wrap: (quote: string) => `${quote.replace(/\n/g, '\r\n')}\r\n` },
    { name: 'edge whitespace', wrap: (quote: string) => `  ${quote}\n \t` },
  ];
  it.each(exactTextCases)('binds the complete $name text digest', async ({ wrap }) => {
    const { client, request } = fixture(undefined, wrap);
    const proof = await client.verifyGateRepairAuthorization(request);
    expect(proof.userTextSha256).toBe(createHash('sha256').update(request.userText).digest('hex'));
    expect(proof.userTextSha256).not.toBe(
      createHash('sha256').update(request.userText.trim()).digest('hex')
    );
  });
  it.each(exactTextCases)(
    'discovers the parent while retaining complete $name text',
    async ({ wrap }) => {
      const { client, request } = fixture(undefined, wrap);
      const { userMessageId: _explicit, ...derived } = request;
      delete (derived.invocation.args as Record<string, unknown>).diagnostic_user_message_id;
      const proof = await client.verifyGateRepairAuthorization(derived);
      expect(proof.userTextSha256).toBe(
        createHash('sha256').update(request.userText).digest('hex')
      );
    }
  );
  it.each(['', 'user', 'msg_other'])(
    'never replaces an invalid explicit ID %s with the parent',
    async userMessageId => {
      const { client, request } = fixture();
      request.userMessageId = userMessageId;
      await expect(client.verifyGateRepairAuthorization(request)).rejects.toThrow();
    }
  );
  it.each([
    'missing',
    'invalid',
    'other-user',
    'stale',
    'synthetic',
    'ignored',
    'wrong-role',
    'other-session',
    'wrong-owner',
  ])('rejects %s with omitted ID', async variant => {
    const { client, request } = fixture((u, a) => {
      if (variant === 'missing') delete a.info.parentID;
      if (variant === 'invalid') a.info.parentID = '../msg_user';
      if (variant === 'other-user') a.info.parentID = 'msg_other';
      if (variant === 'stale') u.info.time.created = 1;
      if (variant === 'synthetic') u.parts[0].synthetic = true;
      if (variant === 'ignored') u.parts[0].ignored = true;
      if (variant === 'wrong-role') u.info.role = 'assistant';
      if (variant === 'other-session') u.info.sessionID = 'ses_other';
      if (variant === 'wrong-owner') a.info.agent = 'sf-executor';
    });
    const { userMessageId: _explicit, ...derived } = request;
    delete (derived.invocation.args as Record<string, unknown>).diagnostic_user_message_id;
    await expect(client.verifyGateRepairAuthorization(derived)).rejects.toThrow();
  });
  it.each(exactTextCases)('rejects normalized $name despite the same marker', async ({ wrap }) => {
    const { client, request } = fixture(undefined, wrap);
    request.userText = request.userText.trim();
    request.invocation.args.user_response_quote = request.userText;
    await expect(client.verifyGateRepairAuthorization(request)).rejects.toThrow(
      'GATE_REPAIR_FRESH_BOUND_USER_AUTHORIZATION_REQUIRED'
    );
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
