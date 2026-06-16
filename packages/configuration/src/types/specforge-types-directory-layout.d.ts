declare module '@specforge/types/directory-layout' {
  export const SPEC_DIR_NAME: string;
  export const SPEC_USER_DIR_NAME: string;
  export const LAYOUT: any;
  export const legacyPaths: any;
  export const legacyUserLayoutReadOnly: any;
  export type LayoutKey = string;

  export function resolveProjectPath(projectRoot: string, key: any, ...subpath: string[]): string;

  export function projectRoot(projectRoot: string): string;
  export function projectSpecManifest(projectRoot: string): string;
  export function projectExtensionRegistry(projectRoot: string): string;
  export function projectRequirementsIndex(projectRoot: string): string;
  export function projectDesignIndex(projectRoot: string): string;
  export function projectArchitecture(projectRoot: string): string;
  export function projectGlossary(projectRoot: string): string;
  export function projectDecisions(projectRoot: string): string;
  export function projectTraceMatrix(projectRoot: string): string;
  export function projectModulesRoot(projectRoot: string): string;
  export function moduleRoot(projectRoot: string, moduleName: string): string;
  export function moduleJson(projectRoot: string, moduleName: string): string;
  export function moduleRequirements(projectRoot: string, moduleName: string): string;
  export function moduleDesign(projectRoot: string, moduleName: string): string;
  export function moduleTrace(projectRoot: string, moduleName: string): string;

  export function workItemsRoot(projectRoot: string): string;
  export function workItemRoot(projectRoot: string, workItemId: string): string;
  export function workItemJson(projectRoot: string, workItemId: string): string;
  export function workItemIntake(projectRoot: string, workItemId: string): string;
  export function workItemRuntimeLog(projectRoot: string, workItemId: string): string;
  export function workItemCandidateManifest(projectRoot: string, workItemId: string): string;
  export function workItemCandidatesRoot(projectRoot: string, workItemId: string): string;
  export function workItemGatesRoot(projectRoot: string, workItemId: string): string;
  export function workItemGateSummary(projectRoot: string, workItemId: string): string;
  export function workItemUserDecision(projectRoot: string, workItemId: string): string;
  export function workItemVerificationReport(projectRoot: string, workItemId: string): string;
  export function workItemMergeReport(projectRoot: string, workItemId: string): string;
  export function workItemEvidenceRoot(projectRoot: string, workItemId: string): string;
  export function workItemEvidenceManifest(projectRoot: string, workItemId: string): string;

  export function validatePathPolicy(inputPath: string): { valid: boolean; violations: string[] };
  export function isProjectSpecPath(inputPath: string): boolean;
  export function isWorkItemPath(inputPath: string): boolean;
  export function isLegacySpecPath(inputPath: string): boolean;
}
