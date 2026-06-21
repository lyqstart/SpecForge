# v1.2 Write Guard native tool shadow fix09 continue03 report

RESULT: FIX09_CONTINUE03_HASH_COMPATIBILITY_PATCH_APPLIED

## Reason

continue02 proved the native write-tool shadow fix compiled and the installer upgraded the userlevel deployment, but deployment consistency failed because the host PowerShell environment did not expose Get-FileHash.

## Change

Replaced scripts/check-userlevel-live-consistency.ps1 SHA256 implementation with a .NET SHA256 fallback that does not depend on the Get-FileHash cmdlet.

## Scope

No SpecForge runtime source was changed in continue03. The native Write/Edit/ApplyPatch hotfix from commit 40a9850 remains unchanged.
