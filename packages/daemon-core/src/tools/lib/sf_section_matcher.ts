/**
 * Shared tolerant Markdown-header matcher for the investigation gate cores.
 *
 * Both `sf_requirements_gate_core.ts` (`parseSections`) and `sf_design_gate_core.ts`
 * (`extractMarkdownSection` / findings-report section detection) need to recognize a required
 * section by its canonical name even when the header carries a trailing parenthetical /
 * annotation, e.g. `## 预期产出（执行阶段，非本 plan）` or `## 调查结论（直接回答原始问题）`.
 *
 * The rule (P4 fix — Requirements 2.1, 2.2): the canonical section name must appear as a PREFIX
 * of the header text; an OPTIONAL trailing parenthetical / annotation (full-width `（）` or
 * half-width `()`) after the canonical name is ignored. A header whose text merely EMBEDS the
 * canonical name without starting with it (e.g. `## 关于预期产出的备注`) is NOT a match and
 * remains a genuine miss (Requirement 3.2).
 *
 * This module centralizes the matcher so both cores stay consistent (task 16.1 wires it into the
 * requirements gate; task 16.2 reuses it in the design/findings gate).
 */

/**
 * Escape regular-expression special characters in a literal string so it can be embedded in a
 * dynamically-built pattern.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Options controlling how the tolerant header regex is composed, so the two gate cores can
 * preserve their respective existing anchoring behavior while sharing the prefix/annotation-tolerant
 * rule.
 */
export interface TolerantHeaderMatcherOptions {
  /** Minimum heading level (number of leading `#`). Defaults to 2. */
  minLevel?: number;
  /** Maximum heading level (number of leading `#`). Defaults to 3. */
  maxLevel?: number;
  /**
   * Whether at least one whitespace character is required after the leading `#` run.
   * `true` => `\s+` (used by the design gate's `extractMarkdownSection`);
   * `false` => `\s*` (preserves the requirements gate's `parseSections` behavior). Defaults to false.
   */
  requireHashSpace?: boolean;
  /**
   * Whether to allow an optional numeric list prefix (e.g. `1. `, `2、`, `3) `) before the
   * canonical name. Used by the design gate. Defaults to false.
   */
  allowNumberPrefix?: boolean;
  /** RegExp flags. Defaults to `'im'` (case-insensitive, multiline). */
  flags?: string;
}

/**
 * Build a prefix/annotation-tolerant header-matching regex for the given canonical section name.
 *
 * The produced pattern matches a single header line whose text begins with `sectionName`, optionally
 * followed by a trailing parenthetical / annotation, e.g.:
 *   - `## 预期产出`
 *   - `## 预期产出（执行阶段，非本 plan）`
 *   - `## 预期产出 (execution phase)`
 * but NOT `## 关于预期产出的备注` (canonical name is embedded, not a prefix).
 */
export function buildTolerantHeaderRegex(
  sectionName: string,
  options: TolerantHeaderMatcherOptions = {}
): RegExp {
  const {
    minLevel = 2,
    maxLevel = 3,
    requireHashSpace = false,
    allowNumberPrefix = false,
    flags = 'im',
  } = options;

  const escapedName = escapeRegExp(sectionName);
  const hashSpacing = requireHashSpace ? '\\s+' : '\\s*';
  const numberPrefix = allowNumberPrefix ? '(?:\\d+[.、)]\\s*)?' : '';
  // The canonical name must start the header text; an optional trailing parenthetical / annotation
  // (full-width or half-width parentheses) after the name is tolerated and ignored.
  const trailingAnnotation = '(?:\\s*[（(].*[)）])?';

  return new RegExp(
    `^#{${minLevel},${maxLevel}}${hashSpacing}${numberPrefix}${escapedName}${trailingAnnotation}\\s*$`,
    flags
  );
}
