/** Neutral trusted-runtime tool-call evidence. Provider formats are validated by the adapter. */
export interface TrustedToolInvocationRequest {
  sessionId: string;
  messageId: string;
  directory: string;
  tool:
    | "sf_verification_plan"
    | "sf_verification_run"
    | "sf_state_transition"
    | "sf_hard_stop_resolve";
  args: Record<string, unknown>;
}
export interface TrustedToolInvocationProof {
  source: "runtime-tool-invocation/v1";
  sessionId: string;
  messageId: string;
  callId: string;
  agent: "sf-orchestrator" | "sf-verifier";
  directory: string;
  tool: TrustedToolInvocationRequest["tool"];
  inputSha256: string;
  startedAt: number;
  observedAt: string;
  runtimeProjectionSha256: string;
}
export interface ToolInvocationVerifier {
  verifyToolInvocation(
    input: TrustedToolInvocationRequest,
  ): Promise<TrustedToolInvocationProof>;
  verifyGateRepairAuthorization?(
    input: GateRepairAuthorizationRequest,
  ): Promise<GateRepairAuthorizationProof>;
}

export interface GateRepairAuthorizationRequest {
  invocation: TrustedToolInvocationRequest;
  userMessageId: string;
  userText: string;
  workItemId: string;
  attemptId: string;
  historySha256: string;
  completedAt: string;
}
export interface GateRepairAuthorizationProof {
  source: "gate-repair-diagnostic/v1";
  invocation: TrustedToolInvocationProof;
  userMessageId: string;
  userTextSha256: string;
  userCreatedAt: number;
  attemptId: string;
  historySha256: string;
}
