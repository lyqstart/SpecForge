## Task Summary
**Task**: 修复 T5 属性测试的 Windows 路径兼容性
**Work Item**: WI-035

### Problem
`packages/daemon-core/tests/property/transition-guard-idempotency.property.test.ts` uses `fc.string()` to generate random directory suffix names, but fast-check generates characters illegal in Windows file paths (like `|`, `"`, `<`, etc.), causing `fs.mkdir` to fail with ENOENT.

### Root Cause
The `dirSuffixArb` arbitrary on line 48 used `fc.string({ minLength: 1, maxLength: 20 }).filter(...)`. The filter only excluded empty strings and null characters, but did not exclude Windows-incompatible characters like `|`, `"`, `<`, `>`, `:`, `*`, `?`, `/`, `\`.

### Fix Applied
Replaced `dirSuffixArb` definition from:
```typescript
const dirSuffixArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
  (s) => s.trim().length > 0 && !s.includes('\0'),
);
```
To:
```typescript
const dirSuffixArb = fc.stringMatching(/^[a-zA-Z0-9._\-]{1,20}$/);
```

This uses `fc.stringMatching()` (available in fast-check v4.8.0) to generate only safe characters: `[a-zA-Z0-9._\-]`, length 1-20.

### Verification
Ran: `cd packages/daemon-core && npx vitest run tests/property/transition-guard-idempotency.property.test.ts`
Result: **All 7 tests passed** ✅ (1.36s)

### Files Changed
- `packages/daemon-core/tests/property/transition-guard-idempotency.property.test.ts` — line 48 only

### Notes
- `workItemIdArb` (line 33) also uses `fc.string()` but was NOT changed because it generates work item IDs, not file paths — it's never used in `path.join()` or `fs.mkdir()`
- fast-check v4.x does not have `fc.char()` or `fc.stringOf()` — used `fc.stringMatching()` instead, which is the v4-compatible approach
- The `minLength: 1` in the regex `{1,20}$` ensures non-empty strings, eliminating the need for the trim filter