import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

export interface ReleaseRuntimeArtifactPlanItem {
  id: 'runtime:specforge' | 'runtime:specforged';
  entryPoint: string;
  outputPath: string;
}

export interface CompileInvocation {
  id: ReleaseRuntimeArtifactPlanItem['id'];
  bunExecutable: string;
  candidateRoot: string;
  entryPoint: string;
  outputPath: string;
  version: string;
}

export interface CompileResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface BuiltReleaseRuntimeArtifact {
  id: ReleaseRuntimeArtifactPlanItem['id'];
  path: string;
  sha256: string;
  size: number;
}

export interface BuildReleaseRuntimeArtifactOptions {
  candidateRoot: string;
  platform?: NodeJS.Platform;
  bunExecutable: string;
  runCompile?: (invocation: CompileInvocation) => Promise<CompileResult>;
}

function executableSuffix(platform: NodeJS.Platform): string {
  return platform === 'win32' ? '.exe' : '';
}

export function getReleaseRuntimeArtifactPlan(
  platform: NodeJS.Platform = process.platform,
): ReleaseRuntimeArtifactPlanItem[] {
  const suffix = executableSuffix(platform);
  return [
    {
      id: 'runtime:specforge',
      entryPoint: 'packages/cli/src/cli.ts',
      outputPath: `release/bin/specforge${suffix}`,
    },
    {
      id: 'runtime:specforged',
      entryPoint: 'packages/daemon-core/src/specforged.ts',
      outputPath: `release/bin/specforged${suffix}`,
    },
  ];
}

async function runBunCompile(invocation: CompileInvocation): Promise<CompileResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(invocation.bunExecutable, [
      'build',
      '--compile',
      '--define',
      `__SPECFORGE_BUILD_VERSION__=${JSON.stringify(invocation.version)}`,
      invocation.entryPoint,
      '--outfile',
      invocation.outputPath,
    ], {
      cwd: invocation.candidateRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ exitCode: code ?? -1, stdout, stderr }));
  });
}

export async function buildReleaseRuntimeArtifacts(
  options: BuildReleaseRuntimeArtifactOptions,
): Promise<BuiltReleaseRuntimeArtifact[]> {
  const candidateRoot = resolve(options.candidateRoot);
  const runCompile = options.runCompile ?? runBunCompile;
  const artifacts: BuiltReleaseRuntimeArtifact[] = [];
  let version = '';
  try {
    const rootManifest = JSON.parse(
      await readFile(resolve(candidateRoot, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    version = typeof rootManifest.version === 'string' ? rootManifest.version.trim() : '';
  } catch {
    throw new Error('RUNTIME_ARTIFACT_VERSION_AUTHORITY_INVALID: package.json');
  }
  if (!/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error(`RUNTIME_ARTIFACT_VERSION_AUTHORITY_INVALID: ${version || '<empty>'}`);
  }

  for (const planned of getReleaseRuntimeArtifactPlan(options.platform)) {
    const entryPoint = resolve(candidateRoot, ...planned.entryPoint.split('/'));
    const outputPath = resolve(candidateRoot, ...planned.outputPath.split('/'));
    try {
      const entry = await stat(entryPoint);
      if (!entry.isFile()) throw new Error('not a file');
    } catch {
      throw new Error(`RUNTIME_ARTIFACT_ENTRY_MISSING: ${planned.entryPoint}`);
    }

    const result = await runCompile({
      id: planned.id,
      bunExecutable: options.bunExecutable,
      candidateRoot,
      entryPoint,
      outputPath,
      version,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `RUNTIME_ARTIFACT_COMPILE_FAILED: ${planned.id}: ${result.stderr || result.stdout}`,
      );
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(outputPath);
    } catch {
      throw new Error(`RUNTIME_ARTIFACT_MISSING: ${planned.outputPath}`);
    }
    if (bytes.length === 0) {
      throw new Error(`RUNTIME_ARTIFACT_EMPTY: ${planned.outputPath}`);
    }
    artifacts.push({
      id: planned.id,
      path: planned.outputPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    });
  }

  return artifacts;
}
