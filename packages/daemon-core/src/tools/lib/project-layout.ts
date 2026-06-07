/**
 * project-layout.ts — SpecForge project layout constants
 *
 * Provides project-level file and directory constants for path resolution
 * and policy enforcement across workflow types.
 */

/**
 * All known spec file names that may appear under a Work Item directory.
 */
export const PROJECT_SPEC_FILES: string[] = [
  'requirements.md',
  'design.md',
  'tasks.md',
  'verification.md',
  'intake.md',
  'impact_analysis.md',
  'refactor_analysis.md',
  'investigation_plan.md',
  'findings_report.md',
];

/**
 * Required files per workflow type.
 * Keyed by workflow_type string, value is the list of file names
 * that must exist for that workflow to be considered valid.
 */
export const WI_REQUIRED_FILES: Record<string, string[]> = {
  feature_spec: ['requirements.md', 'design.md', 'tasks.md'],
  bugfix_spec: ['bugfix.md', 'tasks.md'],
  change_request: ['intake.md', 'impact_analysis.md', 'design_delta.md', 'tasks.md'],
  refactor: ['refactor_analysis.md', 'tasks.md'],
  investigation: ['investigation_plan.md', 'findings_report.md'],
  ops_task: ['intake.md', 'tasks.md'],
  quick_change: ['intake.md', 'tasks.md'],
};

/**
 * Directories that are forbidden for MVP path policy.
 * These directories should not be directly accessed or written to
 * during MVP phase operations.
 */
export const MVP_FORBIDDEN_DIRS: string[] = [
  'standards',
  'archive',
  'state',
  'gates',
  'reports',
  'snapshots',
];
