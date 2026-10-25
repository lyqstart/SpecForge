# Verifier repair and conformance audit

RUN_ID=CODEX-SF-20261025-VERIFIER-CONFORMANCE-A01
EXECUTION_MODE=CODEX_DIRECT
BASELINE=e7a48491b98aa5a61a99610a245e6c86d6c2dc25

User request: 修复 sf-verifier 指令与规格冲突，同步部署验证，继续逐条审计和真实 OpenCode 完整业务链，区分已实现、未实现、证据不足。

Confirmed: previous audit bytes and source/installed verifier agree. SPS §9.2/D18 forbids subprocess test/build execution. The verifier role, examples, evidence collection, loaded verification Skill and workflow delegation still give incompatible execution instructions. Architecture: registered installer assets -> OpenCode Agent/Skill loading -> verifier -> controlled read/evidence producers; commands are constrained by the Runtime internal interpreter. Responsibility: Agent/Skill/deployment consumers; existing runtime supports rejection, no runtime extension needed.

Scope: verifier, its verification Skill, feature workflow delegation, orchestrator/base summary consumers, targeted guidance regression, activity rule and error ledger, sole project-status; archive evidence. Preserve all previous audit files. No business truth-source edits. No product scope or execution-policy change. Do not bump runtime version for a prompt-only correction; identify deployed assets by immutable candidate commit and SHA-256. Installer normal hash-based upgrade skips unchanged executables; independently prove this before deploying.

Verification: baseline shell/guidance contract tests; patch test and relevant existing consumers; generated workflow check; release manifest/precheck; official installer upgrade/verify; actual installed bytes; fresh OpenCode session reads corrected instructions and attempts no forbidden execution. Continue specification audit using source, tests and raw runtime evidence. User approval remains a real stopping boundary, never infer Candidate approval from the audit request.

Prior failures: audit 001-004 sandbox cwd failures; 005 Vitest1 worker conflict; truncated reads and one wrong historical command filename. Preserve raw outputs, use fixed native Bun/working directory and repository worker settings; no failed output counts as product PASS. Existing audit root is classified prior assistant work, not user code. Applicable EXP-004/007/021/026/031/036/060/087/117/261/276/282/285. Rule hashes unchanged from fully read previous turn; targeted ledger ERR-1880/1882/1888/1889 checked. REPEATED_ERROR_CHECK=PASS; ACTIVE_EXPERIENCE_RULES_FILE_READ=YES; EXPERIENCE_FILE_READ=YES.
