function norm(v: any): string {
  return String(v ?? "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function shellTargets(command: string): string[] {
  const out: string[] = [];
  const redirect = /(?:^|[^>])>>?\s*(["']?)([^"'\s|;&]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = redirect.exec(command)) !== null) if (m[2]) out.push(norm(m[2]));
  const patterns = [
    /\bSet-Content\b[^|;&]*?\s+-Path\s+(["'])(.*?)\1/gi,
    /\bOut-File\b[^|;&]*?\s+-FilePath\s+(["'])(.*?)\1/gi,
    /\bNew-Item\b[^|;&]*?\s+-Path\s+(["'])(.*?)\1/gi,
    /fs\.writeFileSync\(\s*(["'`])([^"'`]+)\1/gi,
    /fs\.appendFileSync\(\s*(["'`])([^"'`]+)\1/gi,
  ];
  for (const p of patterns) while ((m = p.exec(command)) !== null) if (m[2]) out.push(norm(m[2]));
  return uniq(out);
}

function shellRisk(command: string) {
  const raw = String(command ?? "");
  const write =
    />/.test(raw) ||
    /\bSet-Content\b/i.test(raw) ||
    /\bOut-File\b/i.test(raw) ||
    /\bNew-Item\b[^|;&]*-ItemType\s+File/i.test(raw) ||
    /\bCopy-Item\b/i.test(raw) ||
    /\bMove-Item\b/i.test(raw) ||
    /\bRemove-Item\b/i.test(raw) ||
    /fs\.writeFileSync/i.test(raw) ||
    /fs\.appendFileSync/i.test(raw);
  const targets = shellTargets(raw);
  return { is_write_risk: write, extracted_target_paths: targets, unknown_target: write && targets.length === 0 };
}

function allowedPath(path: string, input: any): boolean {
  const p = norm(path);
  for (const entry of Array.isArray(input?.allowed_write_files) ? input.allowed_write_files : []) {
    const candidate = norm(typeof entry === "string" ? entry : entry?.path);
    if (candidate && (p === candidate || p.startsWith(candidate + "/"))) return true;
  }
  for (const dir of Array.isArray(input?.allowed_write_dirs) ? input.allowed_write_dirs : []) {
    const candidate = norm(dir).replace(/\/$/, "");
    if (candidate && (p === candidate || p.startsWith(candidate + "/"))) return true;
  }
  return false;
}

function makeResult(input: any, allowed: boolean, decision: string, violations: string[], paths: string[], shell?: any) {
  return {
    allowed,
    denied: !allowed,
    decision,
    violations,
    blocked_write_attempts: allowed ? 0 : 1,
    normalized_paths: paths,
    shell_write_risk: shell,
    audit_event: {
      type: allowed ? "write_guard.preflight" : "write_guard.violation",
      work_item_id: input?.work_item_id,
      tool_name: input?.tool_name,
      operation: input?.operation,
      state: input?.current_state,
      allowed,
      target_paths: paths,
      violations,
    },
  };
}

export default async function sf_write_guard_preflight(input: any) {
  const op = input?.operation ?? "read";
  const shell = op === "shell_command" ? shellRisk(input?.command ?? "") : undefined;
  const paths = uniq([...(Array.isArray(input?.target_paths) ? input.target_paths.map(norm) : []), ...(shell?.extracted_target_paths ?? [])]);

  if (op === "read" || (op === "shell_command" && !shell?.is_write_risk)) return makeResult(input, true, "READ_ONLY_ALLOWED", [], paths, shell);
  if (input?.current_state !== "implementation_running") return makeResult(input, false, "STATE_NOT_IMPLEMENTATION_RUNNING", ["write denied outside implementation_running"], paths, shell);
  if (input?.code_permission_revoked === true) return makeResult(input, false, "CODE_PERMISSION_REVOKED", ["write denied because code permission has been revoked"], paths, shell);
  if (input?.code_permission_enabled !== true) return makeResult(input, false, "CODE_PERMISSION_NOT_ENABLED", ["write denied because code permission is not enabled"], paths, shell);
  if (op === "shell_command" && shell?.unknown_target) return makeResult(input, false, "UNKNOWN_SHELL_WRITE_TARGET", ["shell write denied because target path cannot be determined"], paths, shell);
  if (paths.length === 0) return makeResult(input, false, "NO_TARGET_PATHS", ["write denied because no target_paths were supplied"], paths, shell);

  for (const path of paths) {
    if (path === ".specforge/work-items" || path.startsWith(".specforge/work-items/")) return makeResult(input, false, "DENIED_PATH", ["write denied by denied path: " + path], paths, shell);
    if (path === ".specforge/project" || path.startsWith(".specforge/project/")) {
      const ok = input?.allow_project_spec_write === true && input?.tool_name === "sf_project_spec_merge";
      if (!ok) return makeResult(input, false, "DIRECT_PROJECT_SPEC_WRITE", ["direct project spec write denied: " + path], paths, shell);
      continue;
    }
    if (!allowedPath(path, input)) return makeResult(input, false, op === "shell_command" ? "SHELL_WRITE_RISK" : "OUT_OF_SCOPE_WRITE", ["out-of-scope write denied: " + path], paths, shell);
  }

  return makeResult(input, true, "ALLOWED", [], paths, shell);
}

export { sf_write_guard_preflight };