/**
 * verify-tool-schemas.ts — installer guardrail against schema-time tool outages.
 *
 * Motivation: a single malformed tool `args` schema (e.g. Zod v4 requires
 * `z.record(keySchema, valueSchema)`, but a wrapper used the single-arg
 * `z.record(valueSchema)` form) crashes OpenCode's ToolRegistry when it builds
 * the JSON schema for ALL tools — every prompt then returns no response in every
 * directory. That is a "one bad schema kills all tools" total-outage class.
 *
 * A full runtime "load" of each wrapper is unsafe here (importing a wrapper runs
 * its top-level daemon-client import). Instead we statically scan installed
 * wrapper sources for the known schema-build pitfalls. This is deterministic,
 * side-effect free, and precisely targets the outage class.
 */

import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

export interface SchemaLintIssue {
  /** POSIX-ish relative path of the offending wrapper */
  relativePath: string
  /** 1-based line number of the offending call */
  line: number
  /** machine code for the pitfall */
  code: string
  /** human-readable message */
  message: string
}

const WRAPPER_DIRS = ["tools", "tools/lib", "plugins"]

/** Source-only lexical guard for plain JSON descriptors in a tool args shape.
 * This is not a substitute for real SDK/Kernel schema conversion acceptance. */
function rawArgsDescriptors(source:string):number[] {
  const tokens:Array<{value:string;index:number}>=[]
  for(let i=0;i<source.length;){
    const c=source[i]!
    if(/\s/.test(c)){i++;continue}
    if(c==='/'&&source[i+1]==='/'){const end=source.indexOf('\n',i+2);i=end<0?source.length:end;continue}
    if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue}
    if(c==='"'||c==="'"||c==='`'){
      const start=i++,quote=c
      while(i<source.length){if(source[i]==='\\'){i+=2;continue}if(source[i++]===quote)break}
      // A quoted key remains one token; quoted source text is never scanned as code.
      tokens.push({value:'<literal>',index:start});continue
    }
    const name=/^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(i))
    if(name){tokens.push({value:name[0],index:i});i+=name[0].length}
    else{tokens.push({value:c,index:i});i++}
  }
  const issues:number[]=[]
  for(let i=0;i<tokens.length-2;i++){
    if(tokens[i]!.value!=='args'||tokens[i+1]!.value!==':'||tokens[i+2]!.value!=='{')continue
    let depth=1
    for(let n=i+3;n<tokens.length&&depth>0;n++){
      const token=tokens[n]!
      if(depth===1&&tokens[n+1]?.value===':'&&tokens[n+2]?.value==='{')issues.push(token.index)
      if(token.value==='{')depth++
      if(token.value==='}')depth--
    }
  }
  return [...new Set(issues)]
}

/**
 * Return the top-level argument count of the call whose argument list starts at
 * `open` (index of the "(" that follows the callee). Commas nested inside
 * parens/brackets/braces or string/template literals are not counted.
 * Returns -1 when the argument list is empty, or null when parens are unbalanced.
 */
function topLevelArgCount(source: string, open: number): number | null {
  let depth = 0
  let commas = 0
  let sawToken = false
  let i = open
  let quote: string | null = null

  for (; i < source.length; i++) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      sawToken = true
      continue
    }

    if (ch === "(" || ch === "[" || ch === "{") {
      depth++
      if (depth > 1) sawToken = true
      continue
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--
      if (depth === 0) {
        // closed the argument list
        if (!sawToken && commas === 0) return 0
        return commas + 1
      }
      continue
    }

    if (depth === 1) {
      if (ch === ",") {
        commas++
        continue
      }
      if (!/\s/.test(ch)) sawToken = true
    }
  }

  return null // unbalanced
}

/** Lint a single wrapper source for schema-build pitfalls. */
export function lintToolSchemaSource(relativePath: string, source: string): SchemaLintIssue[] {
  const issues: SchemaLintIssue[] = []
  const lineStarts: number[] = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") lineStarts.push(i + 1)
  }
  const lineOf = (index: number): number => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= index) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  // Zod v4 `.record(...)` requires exactly two args (key schema + value schema).
  // A single-arg call produces an invalid schema whose value type is undefined,
  // and downstream JSON-schema conversion throws `undefined is not an object
  // (evaluating 'r._zod')`, taking down the whole ToolRegistry.
  const recordRe = /\.record\s*\(/g
  let m: RegExpExecArray | null
  while ((m = recordRe.exec(source)) !== null) {
    const open = m.index + m[0].length - 1 // index of "("
    const count = topLevelArgCount(source, open)
    if (count !== null && count === 1) {
      issues.push({
        relativePath,
        line: lineOf(m.index),
        code: "ZOD_RECORD_SINGLE_ARG",
        message:
          ".record() called with a single argument; Zod v4 requires record(keySchema, valueSchema). " +
          "Use record(tool.schema.string(), <valueSchema>). A single-arg record crashes OpenCode's ToolRegistry for ALL tools.",
      })
    }
  }

  for(const index of rawArgsDescriptors(source))issues.push({relativePath,line:lineOf(index),code:'ZOD_RAW_ARGS_DESCRIPTOR',message:'Tool args fields must be Zod schemas built with tool.schema; a plain JSON descriptor cannot be converted by the public SDK.'})
  return issues
}

/** Scan installed wrapper directories under `targetDir` for schema pitfalls. */
export async function lintInstalledToolSchemas(targetDir: string): Promise<SchemaLintIssue[]> {
  const issues: SchemaLintIssue[] = []
  for (const dir of WRAPPER_DIRS) {
    const abs = join(targetDir, dir)
    if (!existsSync(abs)) continue
    let files: string[]
    try {
      files = await readdir(abs)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith(".ts")) continue
      const rel = `${dir}/${file}`
      try {
        const source = await readFile(join(abs, file), "utf-8")
        issues.push(...lintToolSchemaSource(rel, source))
      } catch {
        // unreadable file — skip; SHA verify owns presence/integrity.
      }
    }
  }
  return issues
}
