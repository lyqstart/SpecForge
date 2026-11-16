import { describe, expect, it, vi } from 'vitest';
import { OpenCodeHttpRuntimeClient } from '../src';
import type { RequiredVerificationSourceProof } from '@specforge/types/trusted-tool-invocation';

const input = {
  directory: '/project',
  sessionId: 'ses_child',
  callId: 'call_policy',
  tool: 'sf_safe_bash',
  args: { command: 'cat .specforge/file' },
};
const proof: RequiredVerificationSourceProof = {
  source: 'required-verification-source/v1',
  sessionId: input.sessionId,
  callId: input.callId,
  messageId: 'msg_tool',
  tool: input.tool,
  inputSha256: 'a'.repeat(64),
  agent: 'sf-design',
  directory: input.directory,
  userSessionId: 'ses_parent',
  userMessageId: 'msg_user',
  userTextSha256: 'b'.repeat(64),
  userCreatedAt: 1,
  observedAt: new Date().toISOString(),
  declaration: null,
  chainSha256: 'c'.repeat(64),
};

describe('verified invocation cancellation transport', () => {
  it('cancels only the revalidated user root and triggering child, requiring true receipts', async () => {
    const fetchFn = vi.fn(async () => new Response('true', { status: 200 }));
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch });
    vi.spyOn(client, 'readRequiredVerificationSource').mockResolvedValue(proof);
    const result = await client.stopGovernanceInvocation(input, proof);
    expect(result.stoppedSessionIds).toEqual(['ses_parent', 'ses_child']);
    expect(fetchFn.mock.calls.map(call => String(call[0]))).toEqual([
      'http://127.0.0.1:4096/session/ses_parent/abort?directory=%2Fproject',
      'http://127.0.0.1:4096/session/ses_child/abort?directory=%2Fproject',
    ]);
  });
  it('does not cancel any session after delegation identity drift', async () => {
    const fetchFn = vi.fn();
    const client = new OpenCodeHttpRuntimeClient({ fetchFn });
    vi.spyOn(client, 'readRequiredVerificationSource').mockResolvedValue({
      ...proof,
      userSessionId: 'ses_unrelated',
    });
    await expect(client.stopGovernanceInvocation(input, proof)).rejects.toThrow('changed');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('does not cancel after the source user text changes under the same message ID', async () => {
    const fetchFn = vi.fn();
    const client = new OpenCodeHttpRuntimeClient({ fetchFn });
    vi.spyOn(client, 'readRequiredVerificationSource').mockResolvedValue({
      ...proof,
      userTextSha256: 'd'.repeat(64),
    });
    await expect(client.stopGovernanceInvocation(input, proof)).rejects.toThrow('changed');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(['false', '{}', 'null'])('does not claim cancellation on response %s', async body => {
    const client = new OpenCodeHttpRuntimeClient({
      fetchFn: vi.fn(async () => new Response(body)) as typeof fetch,
    });
    vi.spyOn(client, 'readRequiredVerificationSource').mockResolvedValue(proof);
    await expect(client.stopGovernanceInvocation(input, proof)).rejects.toThrow('acknowledge');
  });
});
