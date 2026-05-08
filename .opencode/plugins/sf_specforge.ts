// sf_specforge — Thin entry point for OpenCode plugin loading
// The full implementation lives in tools/lib/ and is loaded via relative import
// This file must stay small (<5KB) to avoid OpenCode's plugin loading issues with large files
export { sf_specforge } from "../tools/lib/sf_specforge_plugin_entry.ts"
