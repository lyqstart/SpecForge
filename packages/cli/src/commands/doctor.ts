/**
 * Read-only CLI diagnostics for the current V6 project layout.
 * Project state and migration remain owned by the Daemon.
 */

import * as fs from 'node:fs/promises';
import { resolveSpecForgeManifestPath } from '@specforge/types/user-level-paths';
import { projectSpecManifest } from '../utils/directory-layout';

export interface RunDoctorCommandArgs {
  projectDir?: string;
  userManifestPath?: string;
  write?: (chunk: string) => void;
  writeErr?: (chunk: string) => void;
}

function renderDoctorReport(state: {
  codeVersion: string;
  schemaVersion: string | 'N/A';
  userManifestPath: string;
  projectManifestPath: string;
  projectStatus: 'CURRENT' | 'PROJECT_NOT_INITIALIZED_OR_INVALID';
}): string {
  return [
    'SpecForge Doctor',
    `  code_version              : ${state.codeVersion}`,
    `  schema_version            : ${state.schemaVersion}`,
    `  user_manifest_path        : ${state.userManifestPath}`,
    `  project_manifest_path     : ${state.projectManifestPath}`,
    `  project_status            : ${state.projectStatus}`,
    '',
  ].join('\n');
}

export async function runDoctorCommand(args: RunDoctorCommandArgs = {}): Promise<number> {
  const projectDir = args.projectDir ?? process.cwd();
  const userManifestPath = args.userManifestPath ?? resolveSpecForgeManifestPath();
  const projectManifestPath = projectSpecManifest(projectDir);
  const write = args.write ?? (chunk => process.stdout.write(chunk));
  const writeErr = args.writeErr ?? (chunk => process.stderr.write(chunk));

  let vu: typeof import('@specforge/version-unification');
  try {
    vu = await import('@specforge/version-unification');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`doctor: failed to load version-unification module: ${message}\n`);
    return 1;
  }

  let codeVersion: string;
  try {
    codeVersion = vu.getCodeVersion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`doctor: failed to read code version: ${message}\n`);
    return 1;
  }

  let schemaVersion: string | 'N/A' = 'N/A';
  try {
    const parsed = JSON.parse(await fs.readFile(projectManifestPath, 'utf8')) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'schema_version' in parsed &&
      typeof (parsed as { schema_version: unknown }).schema_version === 'string'
    ) {
      schemaVersion = (parsed as { schema_version: string }).schema_version;
    }
  } catch {
    schemaVersion = 'N/A';
  }

  write(
    renderDoctorReport({
      codeVersion,
      schemaVersion,
      userManifestPath,
      projectManifestPath,
      projectStatus:
        schemaVersion === 'N/A' ? 'PROJECT_NOT_INITIALIZED_OR_INVALID' : 'CURRENT',
    })
  );
  return 0;
}
