/** Process-local HTTP lifetime marker; JSON callers cannot manufacture this key. */
export const VERIFICATION_REQUEST_ABORT = Symbol('SpecForge trusted verification request lifetime');
export function verificationRequestAbort(context: unknown): AbortSignal | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const value = (context as { [VERIFICATION_REQUEST_ABORT]?: unknown })[VERIFICATION_REQUEST_ABORT];
  return value instanceof AbortSignal ? value : undefined;
}
/** Only resource cancellation/reclamation and permission revocation remain reachable under a latch. */
export function isVerificationRecoveryRequest(
  tool: string,
  args: Record<string, unknown>
): boolean {
  return (
    (tool === 'sf_verification_plan' && args.action === 'revoke') ||
    (tool === 'sf_verification_run' && (args.action === 'cancel' || args.action === 'recover'))
  );
}
