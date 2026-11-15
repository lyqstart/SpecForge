import type { RequiredVerificationOwner } from './required-verification-owner';

export type RequiredVerificationConsumer = Pick<RequiredVerificationOwner, 'assertReady'>;

/** These finite queries neither append evidence nor claim handoff readiness. */
export function isRequiredVerificationReadOnlyCall(
  tool: string,
  args: Record<string, unknown>
): boolean {
  return (
    ['sf_handoff', 'sf_v11_handoff'].includes(tool) &&
    ['validate', 'required_status'].includes(String(args.action))
  );
}

/** Runtime-owned evidence is mandatory, including for direct library consumers. */
export async function assertRequiredVerificationReady(
  owner: RequiredVerificationConsumer | undefined,
  projectRoot: string,
  workItemId: string,
  priorHistorySha256?: string
) {
  if (!owner || typeof owner.assertReady !== 'function')
    throw new Error('REQUIRED_VERIFICATION_OWNER_UNAVAILABLE');
  const receipt = await owner.assertReady(projectRoot, workItemId);
  if (priorHistorySha256 !== undefined && receipt.history_sha256 !== priorHistorySha256)
    throw new Error('REQUIRED_VERIFICATION_HISTORY_CHANGED');
  return receipt;
}
