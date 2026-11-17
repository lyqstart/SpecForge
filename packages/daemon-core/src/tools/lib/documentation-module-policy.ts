import { extractModuleFromDdId, isValidDesignDecisionId } from '@specforge/types';

export const DOCUMENTATION_CONTEXT = 'documentation_context';

/** Exact, portable ordinary Markdown names; no pattern or governance alias. */
export function isDocumentationFilePath(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim() || !value.endsWith('.md')) return false;
  if (
    !value ||
    /[\\:*?[\]{}]/.test(value) ||
    [...value].some(char => char.charCodeAt(0) < 32) ||
    value.startsWith('/')
  )
    return false;
  return value
    .split('/')
    .every(
      part =>
        Boolean(part) &&
        !part.startsWith('.') &&
        !/[. ]$/.test(part) &&
        !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    );
}

export function inspectModuleImplementationKind(value: unknown): {
  kind: 'implementation' | 'documentation_context';
  errors: string[];
} {
  const definition = (value ?? {}) as Record<string, unknown>;
  const role = definition.implementation_kind;
  const errors: string[] = [];
  if (role !== undefined && role !== 'implementation' && role !== DOCUMENTATION_CONTEXT)
    errors.push('MODULE_IMPLEMENTATION_KIND_INVALID');
  const kind = role === DOCUMENTATION_CONTEXT ? DOCUMENTATION_CONTEXT : 'implementation';
  if (
    kind === DOCUMENTATION_CONTEXT &&
    (!Array.isArray(definition.code_paths) ||
      definition.code_paths.length === 0 ||
      !definition.code_paths.every(isDocumentationFilePath) ||
      new Set(definition.code_paths.map(p => p.toLowerCase())).size !==
        definition.code_paths.length)
  )
    errors.push('DOCUMENTATION_EXACT_MARKDOWN_PATHS_REQUIRED');
  return { kind, errors };
}

export interface DocumentationModuleView {
  module_code: string;
  implementation_kind: string;
  code_paths: string[];
  design_ids: string[];
  design_text: string;
  contract_entries: unknown[];
}

/** A heading declares a body; a mention, index row, quoted text or fenced example does not. */
export function declaredDesignBodies(text: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  let fence = '',
    current = '',
    depth = 0,
    body: string[] = [];
  const flush = () => {
    if (current) result.set(current, [...(result.get(current) ?? []), body.join('\n').trim()]);
    current = '';
    body = [];
  };
  for (const line of text.replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
      if (current) body.push(line);
      continue;
    }
    if (!fence) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        if (current && heading[1].length <= depth) flush();
        const id = /^(DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3})(?:\s|$)/.exec(heading[2])?.[1];
        if (id) {
          flush();
          current = id;
          depth = heading[1].length;
          continue;
        }
      }
    }
    if (current) body.push(line);
  }
  flush();
  return result;
}

export function inspectDocumentationTaskReferences(input: {
  modules: DocumentationModuleView[];
  tasks: Array<{ task_id: string; refs: string[]; allowed_write_files: string[] }>;
  tasksValid: boolean;
  paths?: string[];
}) {
  const errors: string[] = [];
  const refsByModule: Record<string, string[]> = {};
  const files: Array<{ module: string; path: string; task: string; design_refs: string[] }> = [];
  for (const module of input.modules.filter(m => m.implementation_kind === DOCUMENTATION_CONTEXT)) {
    const selected = module.code_paths.filter(file => !input.paths || input.paths.includes(file));
    if (selected.length && !input.tasksValid)
      errors.push(`DOCUMENTATION_TASK_CONTRACT_INVALID:${module.module_code}`);
    if (
      module.design_ids.length ||
      declaredDesignBodies(module.design_text).size ||
      module.contract_entries.length
    )
      errors.push(`DOCUMENTATION_OWNED_OBJECT_FORBIDDEN:${module.module_code}`);
    const refs = new Set<string>();
    for (const file of selected) {
      const tasks = input.tasks.filter(t => t.allowed_write_files.includes(file));
      if (!tasks.length) errors.push(`DOCUMENTATION_TASK_COVERAGE_MISSING:${file}`);
      for (const task of tasks) {
        const dd = [...new Set(task.refs.filter(isValidDesignDecisionId))].sort();
        if (!dd.length) errors.push(`DOCUMENTATION_TASK_DD_MISSING:${task.task_id}:${file}`);
        for (const id of dd) {
          const owners = input.modules.filter(m => m.module_code === extractModuleFromDdId(id));
          const bodies =
            owners.length === 1 ? declaredDesignBodies(owners[0].design_text).get(id) : undefined;
          if (
            owners.length !== 1 ||
            owners[0].implementation_kind !== 'implementation' ||
            !owners[0].design_ids.includes(id) ||
            bodies?.length !== 1 ||
            !bodies[0]
          )
            errors.push(`DOCUMENTATION_DD_BODY_INVALID:${id}`);
          refs.add(id);
        }
        files.push({ module: module.module_code, path: file, task: task.task_id, design_refs: dd });
      }
    }
    refsByModule[module.module_code] = [...refs].sort();
  }
  return { valid: errors.length === 0, errors, refsByModule, files };
}
