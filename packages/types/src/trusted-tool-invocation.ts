/** Neutral trusted-runtime tool-call evidence. Provider formats are validated by the adapter. */
export interface TrustedToolInvocationRequest {
  sessionId: string;
  messageId: string;
  directory: string;
  tool: 'sf_verification_plan' | 'sf_verification_run';
  args: Record<string, unknown>;
}
export interface TrustedToolInvocationProof {
  source: 'runtime-tool-invocation/v1';
  sessionId: string;
  messageId: string;
  callId: string;
  agent: 'sf-orchestrator' | 'sf-verifier';
  directory: string;
  tool: TrustedToolInvocationRequest['tool'];
  inputSha256: string;
  startedAt: number;
  observedAt: string;
  runtimeProjectionSha256: string;
}
export interface ToolInvocationVerifier {
  verifyToolInvocation(input: TrustedToolInvocationRequest): Promise<TrustedToolInvocationProof>;
}
