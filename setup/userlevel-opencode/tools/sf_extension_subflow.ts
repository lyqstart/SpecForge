import {
  createEmptyExtensionRegistry,
  createExtensionProposal,
  createExtensionRequest,
  createParentResumeToken,
  mergeExtensionRegistry,
  shouldTriggerExtensionSubflow,
  validateExtensionProposal,
} from "../../packages/daemon-core/src/tools/lib/extension-subflow-v12";

export default async function sf_extension_subflow(input: any) {
  const action = input?.action;

  if (action === "should_trigger") return shouldTriggerExtensionSubflow(input ?? {});
  if (action === "create_request") return createExtensionRequest(input);
  if (action === "create_proposal") {
    const request = input.request ?? createExtensionRequest(input);
    return createExtensionProposal({ ...input, request });
  }
  if (action === "validate_proposal") return validateExtensionProposal(input.proposal, input.registry);
  if (action === "merge_registry") {
    return mergeExtensionRegistry({
      registry: input.registry ?? createEmptyExtensionRegistry(),
      proposal: input.proposal,
      expected_registry_version: input.expected_registry_version,
      user_approved: input.user_approved === true,
    });
  }
  if (action === "resume_token") return createParentResumeToken(input.proposal, input.registry_version);

  return {
    ok: false,
    error: "unsupported sf_extension_subflow action",
    supported_actions: ["should_trigger", "create_request", "create_proposal", "validate_proposal", "merge_registry", "resume_token"],
  };
}
