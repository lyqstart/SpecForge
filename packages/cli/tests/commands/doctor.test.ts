/**
 * Doctor Command tests (version-unification spec, R10.3).
 *
 * 覆盖三种 mode：
 *  1) NORMAL_RW          —— project manifest 存在且 dsv 在支持范围内
 *  2) project 缺失        —— project manifest 不存在 → data_schema_version 显示 N/A
 *  3) DEGRADED_HIGHER_THAN_KNOWN
 *                        —— project manifest 的 dsv 高于 HIGHEST_KNOWN_SCHEMA
 *
 * 测试用真实临时目录 + 真实文件 IO（不 mock dynamic import），
 * 这样能验证 cli (CommonJS) 通过 dynamic import 消费 version-unification (ESM) 的
 * 端到端协议路径是工作的。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import { runDoctorCommand } from '../../src/commands/doctor';

interface CapturedOutput {
  stdout: string;
  stderr: string;
}

function makeCapture(): CapturedOutput & {
  write: (chunk: string) => void;
  writeErr: (chunk: string) => void;
} {
  const cap = {
    stdout: '',
    stderr: '',
  } as CapturedOutput & {
    write: (chunk: string) => void;
    writeErr: (chunk: string) => void;
  };
  cap.write = (chunk: string) => {
    cap.stdout += chunk;
  };
  cap.writeErr = (chunk: string) => {
    cap.stderr += chunk;
  };
  return cap;
}

async function createTempProjectDir(): Promise<string> {
  const tmpRoot = os.tmpdir();
  const dirName = `sf-doctor-test-${crypto.randomUUID()}`;
  const tmp = path.join(tmpRoot, dirName);
  await fs.mkdir(path.join(tmp, '.specforge'), { recursive: true });
  return tmp;
}

async function writeProjectManifest(
  projectDir: string,
  dataSchemaVersion: number
): Promise<string> {
  const now = new Date().toISOString();
  const manifest = {
    data_schema_version: dataSchemaVersion,
    initialized_at: now,
    updated_at: now,
  };
  const manifestPath = path.join(projectDir, '.specforge', 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}

async function rmrf(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

describe('runDoctorCommand', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rmrf(dir);
    }
    tempDirs = [];
  });

  it('NORMAL_RW: 项目 manifest 存在且 dsv 在支持范围内时输出全部六行字段并 mode=NORMAL_RW', async () => {
    const projectDir = await createTempProjectDir();
    tempDirs.push(projectDir);

    // dsv = 0 在 MIN_SUPPORTED_DATA_SCHEMA=0 / HIGHEST_KNOWN_SCHEMA=0 范围内
    await writeProjectManifest(projectDir, 0);

    const userManifestPath = path.join(projectDir, 'fake-user-manifest.json');
    const cap = makeCapture();

    const exitCode = await runDoctorCommand({
      projectDir,
      userManifestPath,
      write: cap.write,
      writeErr: cap.writeErr,
    });

    expect(exitCode).toBe(0);
    expect(cap.stderr).toBe('');

    const out = cap.stdout;
    // header
    expect(out).toContain('SpecForge Doctor');
    // 6 个字段
    expect(out).toMatch(/code_version\s+:\s+\S+/);
    expect(out).toMatch(/min_supported_data_schema\s+:\s+0/);
    expect(out).toMatch(/data_schema_version\s+:\s+0/);
    expect(out).toContain(`user_manifest_path        : ${userManifestPath}`);
    expect(out).toContain(
      `project_manifest_path     : ${path.join(
        projectDir,
        '.specforge',
        'manifest.json'
      )}`
    );
    expect(out).toMatch(/mode\s+:\s+NORMAL_RW/);
  });

  it('project manifest 缺失：data_schema_version 显示 N/A，mode 仍可输出，退出码 0', async () => {
    const projectDir = await createTempProjectDir();
    tempDirs.push(projectDir);

    // 故意不写 manifest.json
    const userManifestPath = path.join(projectDir, 'fake-user-manifest.json');
    const cap = makeCapture();

    const exitCode = await runDoctorCommand({
      projectDir,
      userManifestPath,
      write: cap.write,
      writeErr: cap.writeErr,
    });

    expect(exitCode).toBe(0);
    expect(cap.stderr).toBe('');

    const out = cap.stdout;
    expect(out).toContain('SpecForge Doctor');
    expect(out).toMatch(/data_schema_version\s+:\s+N\/A/);
    // mode 必须仍然作为最后一行输出（占位 NORMAL_RW，因为 dsv=N/A 不能调 startup checker）
    expect(out).toMatch(/mode\s+:\s+\S+/);
    // user/project 路径都要绝对路径
    expect(path.isAbsolute(userManifestPath)).toBe(true);
    expect(out).toContain(userManifestPath);
  });

  it('DEGRADED_HIGHER_THAN_KNOWN: dsv 高于 HIGHEST_KNOWN_SCHEMA 时 mode=DEGRADED_HIGHER_THAN_KNOWN', async () => {
    const projectDir = await createTempProjectDir();
    tempDirs.push(projectDir);

    // 当前 HIGHEST_KNOWN_SCHEMA = 0；写 dsv = 999 → DEGRADED_HIGHER_THAN_KNOWN
    await writeProjectManifest(projectDir, 999);

    const userManifestPath = path.join(projectDir, 'fake-user-manifest.json');
    const cap = makeCapture();

    const exitCode = await runDoctorCommand({
      projectDir,
      userManifestPath,
      write: cap.write,
      writeErr: cap.writeErr,
    });

    expect(exitCode).toBe(0);
    expect(cap.stderr).toBe('');

    const out = cap.stdout;
    expect(out).toMatch(/data_schema_version\s+:\s+999/);
    expect(out).toMatch(/mode\s+:\s+DEGRADED_HIGHER_THAN_KNOWN/);
  });
});
