function normName(v: any): string {
  return String(v ?? "").trim().replace(/\\/g, "/").replace(/[^A-Za-z0-9_.\-/]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function emptyRegistry(version = "EXT-0000") {
  return { schema_version: "1.2", registry_version: version, extensions: [] };
}

function createRequest(input: any) {
  const parent = String(input?.parent_work_item_id ?? "").trim();
  const name = String(input?.missing_name ?? "").trim();
  const reason = String(input?.reason ?? "").trim();
  const state = String(input?.return_state ?? "").trim();
  if (!parent) throw new Error("parent_work_item_id is required");
  if (!name) throw new Error("missing_name is required");
  if (!reason) throw new Error("reason is required");
  if (!state) throw new Error("return_state is required");
  const suffix = String(input?.request_index ?? 1).padStart(3, "0");
  return { schema_version: "1.2", parent_work_item_id: parent, request_id: `EXTREQ-${parent}-${suffix}`, missing_kind: input?.missing_kind, missing_name: name, reason, return_state: state, requested_by: input?.requested_by ?? "sf-orchestrator", decision: "EXTENSION_REQUESTED" };
}

function createProposal(input: any) {
  if ((input?.recursive_depth ?? 0) > 0) throw new Error("recursive extension subflow is denied");
  const r = input?.request;
  if (!r) throw new Error("request is required");
  const id = input?.extension_id ?? `${r.missing_kind}.${normName(r.missing_name)}`;
  return { schema_version: "1.2", proposal_id: `EXTPROP-${r.request_id}`, request_id: r.request_id, parent_work_item_id: r.parent_work_item_id, extension_id: id, kind: r.missing_kind, missing_name: r.missing_name, schema_delta: input?.schema_delta ?? {}, usage_contract: input?.usage_contract ?? {}, compatibility_impact: input?.compatibility_impact ?? "low", return_to_parent: { parent_work_item_id: r.parent_work_item_id, return_state: r.return_state }, decision: "EXTENSION_PROPOSED" };
}

function validate(proposal: any, registry?: any) {
  const v: string[] = [];
  if (proposal?.schema_version !== "1.2") v.push("schema_version must be 1.2");
  if (!proposal?.extension_id) v.push("extension_id is required");
  if (!proposal?.parent_work_item_id) v.push("parent_work_item_id is required");
  if (!proposal?.request_id) v.push("request_id is required");
  if (!proposal?.return_to_parent?.return_state) v.push("return_state is required");
  const entries = Array.isArray(registry?.extensions) ? registry.extensions : [];
  if (entries.some((e: any) => e.extension_id === proposal?.extension_id && e.status === "active")) v.push(`duplicate active extension_id: ${proposal.extension_id}`);
  return { allowed: v.length === 0, decision: v.length === 0 ? "EXTENSION_VALID" : "EXTENSION_INVALID", violations: v };
}

function nextVersion(current: string): string {
  const m = /^EXT-(\d+)$/.exec(String(current ?? ""));
  return m ? `EXT-${String(Number(m[1]) + 1).padStart(4, "0")}` : "EXT-0001";
}

function mergeRegistry(input: any) {
  const registry = input?.registry ?? emptyRegistry();
  const proposal = input?.proposal;
  if (registry.registry_version !== input?.expected_registry_version) return { allowed: false, decision: "REGISTRY_VERSION_STALE", registry, violations: [`registry version mismatch: expected ${input?.expected_registry_version}, actual ${registry.registry_version}`] };
  if (input?.user_approved !== true) return { allowed: false, decision: "UNAPPROVED_EXTENSION_MERGE_DENIED", registry, violations: ["extension registry merge requires user approval"] };
  const check = validate(proposal, registry);
  if (!check.allowed) return { allowed: false, decision: check.violations.some((x: string) => x.includes("duplicate")) ? "DUPLICATE_EXTENSION_ID" : "EXTENSION_INVALID", registry, violations: check.violations };
  const nv = nextVersion(registry.registry_version);
  const next = { schema_version: "1.2", registry_version: nv, extensions: [...(Array.isArray(registry.extensions) ? registry.extensions : []), { extension_id: proposal.extension_id, kind: proposal.kind, status: "active", usage_contract: proposal.usage_contract, created_by_request_id: proposal.request_id }] };
  return { allowed: true, decision: "EXTENSION_MERGED", registry: next, violations: [], merge_evidence: { extension_id: proposal.extension_id, previous_registry_version: registry.registry_version, next_registry_version: nv, parent_work_item_id: proposal.parent_work_item_id, request_id: proposal.request_id } };
}

function resumeToken(proposal: any, registryVersion: string) {
  return { parent_work_item_id: proposal.parent_work_item_id, extension_id: proposal.extension_id, registry_version: registryVersion, return_state: proposal.return_to_parent.return_state, next_action: "resume_parent_workflow" };
}

function shouldTrigger(input: any) {
  return Boolean(input?.user_requested_extension || input?.artifact_type_exists === false || input?.workflow_path_exists === false || input?.gate_type_exists === false || input?.project_spec_section_exists === false || input?.tool_contract_exists === false);
}

export default async function sf_extension_subflow(input: any) {
  const action = input?.action;
  if (action === "should_trigger") return shouldTrigger(input ?? {});
  if (action === "create_request") return createRequest(input);
  if (action === "create_proposal") return createProposal({ ...input, request: input?.request ?? createRequest(input) });
  if (action === "validate_proposal") return validate(input?.proposal, input?.registry);
  if (action === "merge_registry") return mergeRegistry({ registry: input?.registry ?? emptyRegistry(), proposal: input?.proposal, expected_registry_version: input?.expected_registry_version, user_approved: input?.user_approved === true });
  if (action === "resume_token") return resumeToken(input?.proposal, input?.registry_version);
  return { ok: false, error: "unsupported sf_extension_subflow action", supported_actions: ["should_trigger", "create_request", "create_proposal", "validate_proposal", "merge_registry", "resume_token"] };
}