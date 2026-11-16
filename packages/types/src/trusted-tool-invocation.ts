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
  stopGovernanceInvocation?(
    input: RequiredVerificationSourceRequest,
    expected: RequiredVerificationSourceProof,
  ): Promise<{ stoppedSessionIds: string[]; acknowledgedAt: string }>;
  verifyToolInvocation(
    input: TrustedToolInvocationRequest,
  ): Promise<TrustedToolInvocationProof>;
  verifyGateRepairAuthorization?(
    input: GateRepairAuthorizationRequest,
  ): Promise<GateRepairAuthorizationProof>;
  readRequiredVerificationSource?(
    input: RequiredVerificationSourceRequest,
  ): Promise<RequiredVerificationSourceProof>;
}

export interface RequiredVerificationSourceRequest {
  sessionId: string;
  callId: string;
  messageId?: string;
  directory: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface RequiredVerificationSourceProof {
  source: "required-verification-source/v1";
  sessionId: string;
  messageId: string;
  callId: string;
  tool: string;
  inputSha256: string;
  agent: string;
  directory: string;
  userSessionId: string;
  userMessageId: string;
  userTextSha256: string;
  userCreatedAt: number;
  observedAt: string;
  declaration:
    | import("./required-verification-contract.js").RequiredVerificationDeclaration
    | null;
  chainSha256: string;
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
