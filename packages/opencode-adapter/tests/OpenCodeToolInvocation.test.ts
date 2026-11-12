import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { OpenCodeHttpRuntimeClient } from '../src/integration/OpenCodeHttpRuntimeClient';
import type { TrustedToolInvocationRequest } from '@specforge/types/trusted-tool-invocation';

const directory = path.resolve('owned-verification-project');
const input: TrustedToolInvocationRequest = {
  sessionId: 'ses_owned',
  messageId: 'msg_owned',
  directory,
  tool: 'sf_verification_plan' as const,
  args: { work_item_id: 'WI-0001', task_id: 'Task-001' },
};
function fixture(request = input) {
  return {
    session: { id: request.sessionId, directory },
    message: {
      info: {
        id: request.messageId,
        sessionID: request.sessionId,
        role: 'assistant',
        agent: 'sf-orchestrator',
        path: { cwd: directory },
      },
      parts: [
        {
          sessionID: request.sessionId,
          messageID: request.messageId,
          type: 'tool',
          tool: request.tool,
          callID: 'call-owned',
          state: { status: 'running', input: request.args, time: { start: Date.now() - 1000 } },
        },
      ],
    },
  };
}
function client(data: ReturnType<typeof fixture>) {
  const fetchFn = vi.fn(
    async (url: string | URL | Request) =>
      new Response(
        JSON.stringify(String(url).includes('/message/') ? data.message : data.session),
        { status: 200 }
      )
  );
  return { api: new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch }), fetchFn };
}

describe('trusted OpenCode verification invocation', () => {
  it('proves the actual orchestrator recovery call and rejects a verifier claim', async () => {
    const request: TrustedToolInvocationRequest = {
      ...input,
      tool: 'sf_state_transition',
      args: { work_item_id: 'WI-0001', from_state: 'blocked', to_state: 'verification_running' },
    };
    const data = fixture(request);
    expect((await client(data).api.verifyToolInvocation(request)).agent).toBe('sf-orchestrator');
    data.message.info.agent = 'sf-verifier';
    await expect(client(data).api.verifyToolInvocation(request)).rejects.toThrow(
      'TOOL_INVOCATION_OWNER_NOT_PROVED'
    );
  });
  it('binds actual upstream agent, directory, running call and canonical input', async () => {
    const data = fixture();
    data.message.parts[0]!.state.input = { task_id: 'Task-001', work_item_id: 'WI-0001' };
    const { api, fetchFn } = client(data);
    const proof = await api.verifyToolInvocation(input);
    expect(proof.agent).toBe('sf-orchestrator');
    expect(proof.callId).toBe('call-owned');
    expect(proof.runtimeProjectionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[1]?.[0])).toContain(
      '/session/ses_owned/message/msg_owned?directory='
    );
  });

  it.each([
    [
      'wrong session project',
      (d: ReturnType<typeof fixture>) => {
        d.session.directory += '-other';
      },
    ],
    [
      'wrong session ID',
      (d: ReturnType<typeof fixture>) => {
        d.session.id = 'ses_other';
      },
    ],
    [
      'wrong message ID',
      (d: ReturnType<typeof fixture>) => {
        d.message.info.id = 'msg_other';
      },
    ],
    [
      'wrong message session',
      (d: ReturnType<typeof fixture>) => {
        d.message.info.sessionID = 'ses_other';
      },
    ],
    [
      'user message',
      (d: ReturnType<typeof fixture>) => {
        d.message.info.role = 'user';
      },
    ],
    [
      'caller role substituted',
      (d: ReturnType<typeof fixture>) => {
        d.message.info.agent = 'sf-verifier';
      },
    ],
    [
      'wrong message directory',
      (d: ReturnType<typeof fixture>) => {
        d.message.info.path.cwd += '-other';
      },
    ],
    [
      'completed call',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.state.status = 'completed';
      },
    ],
    [
      'wrong tool',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.tool = 'sf_verification_run' as typeof input.tool;
      },
    ],
    [
      'wrong call session',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.sessionID = 'ses_other';
      },
    ],
    [
      'wrong call message',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.messageID = 'msg_other';
      },
    ],
    [
      'changed arguments',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.state.input = { ...input.args, task_id: 'Task-002' };
      },
    ],
    [
      'ambiguous duplicate call',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts.push(structuredClone(d.message.parts[0]!));
      },
    ],
    [
      'missing call ID',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.callID = '';
      },
    ],
    [
      'old running call',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.state.time.start -= 400_000;
      },
    ],
    [
      'future running call',
      (d: ReturnType<typeof fixture>) => {
        d.message.parts[0]!.state.time.start += 400_000;
      },
    ],
  ])('rejects %s', async (_label, mutate) => {
    const data = fixture();
    mutate(data);
    await expect(client(data).api.verifyToolInvocation(input)).rejects.toThrow('TOOL_INVOCATION_');
  });

  it('rejects unavailable upstream rather than trusting local caller context', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const api = new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch });
    await expect(api.verifyToolInvocation(input)).rejects.toThrow('offline');
  });
});
