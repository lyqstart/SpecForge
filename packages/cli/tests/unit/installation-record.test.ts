/**
 * Installation Record 单元测试
 * 
 * 测试 writeInstallationRecord 和 loadInstallationRecord 的各种场景：
 * - 正常写入和读取
 * - 文件不存在
 * - JSON 解析失败
 * - 缺少必需字段
 * - schema_version 严格等于 baseline
 * - 时间戳格式验证
 * 
 * Requirements: 4.3, 4.5, 6.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writeInstallationRecord,
  loadInstallationRecord,
  type LoadInstallationRecordResult,
} from '../../src/distribution/installation-record.js';
import type { InstallationRecord } from '../../src/distribution/types.js';
import { SchemaVersionManager } from '../../src/distribution/schema-version-manager.js';

describe('installation-record', () => {
  let tempDir: string;
  const svm = new SchemaVersionManager();

  beforeEach(async () => {
    // 创建临时测试目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'installation-record-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
  });

  describe('writeInstallationRecord', () => {
    it('应该成功写入安装记录', async () => {
      const record: InstallationRecord = {
        schema_version: '1.0',
        installedAt: new Date().toISOString(),
        cliVersion: '6.0.0',
        platform: 'win32',
        installSource: 'npm-global',
      };

      await writeInstallationRecord(tempDir, record);

      // 验证文件存在
      const filePath = path.join(tempDir, '.installation.json');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // 验证文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.schema_version).toBe(svm.baseline);
      expect(parsed.cliVersion).toBe('6.0.0');
      expect(parsed.platform).toBe('win32');
      expect(parsed.installSource).toBe('npm-global');
      expect(parsed.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('应该强制 schema_version 等于 baseline', async () => {
      const record: InstallationRecord = {
        schema_version: '99.99', // 故意使用错误的版本
        installedAt: new Date().toISOString(),
        cliVersion: '6.0.0',
        platform: 'darwin',
        installSource: 'npm-local',
      };

      await writeInstallationRecord(tempDir, record);

      // 验证写入的 schema_version 被强制改为 baseline
      const filePath = path.join(tempDir, '.installation.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.schema_version).toBe(svm.baseline);
      expect(parsed.schema_version).not.toBe('99.99');
    });

    it('应该使用 ISO 8601 UTC 毫秒精度时间戳', async () => {
      const now = new Date();
      const record: InstallationRecord = {
        schema_version: '1.0',
        installedAt: now.toISOString(),
        cliVersion: '6.0.0',
        platform: 'linux',
        installSource: 'dev',
      };

      await writeInstallationRecord(tempDir, record);

      const filePath = path.join(tempDir, '.installation.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // 验证时间戳格式：YYYY-MM-DDTHH:mm:ss.sssZ
      expect(parsed.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // 验证可以解析为有效日期
      const parsedDate = new Date(parsed.installedAt);
      expect(parsedDate.getTime()).not.toBeNaN();
    });

    it('应该在 installedAt 格式无效时使用当前时间', async () => {
      const record: InstallationRecord = {
        schema_version: '1.0',
        installedAt: 'invalid-date', // 无效的时间戳
        cliVersion: '6.0.0',
        platform: 'win32',
        installSource: 'npm-global',
      };

      const beforeWrite = Date.now();
      await writeInstallationRecord(tempDir, record);
      const afterWrite = Date.now();

      const filePath = path.join(tempDir, '.installation.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // 验证使用了当前时间（在写入前后的时间范围内）
      const writtenTime = new Date(parsed.installedAt).getTime();
      expect(writtenTime).toBeGreaterThanOrEqual(beforeWrite);
      expect(writtenTime).toBeLessThanOrEqual(afterWrite);
    });

    it('应该使用原子写入（tmp + rename）', async () => {
      const record: InstallationRecord = {
        schema_version: '1.0',
        installedAt: new Date().toISOString(),
        cliVersion: '6.0.0',
        platform: 'darwin',
        installSource: 'npm-global',
      };

      await writeInstallationRecord(tempDir, record);

      // 验证没有残留的 .tmp 文件
      const files = await fs.readdir(tempDir);
      const tmpFiles = files.filter(f => f.includes('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });

    it('应该在文件末尾添加换行符', async () => {
      const record: InstallationRecord = {
        schema_version: '1.0',
        installedAt: new Date().toISOString(),
        cliVersion: '6.0.0',
        platform: 'linux',
        installSource: 'dev',
      };

      await writeInstallationRecord(tempDir, record);

      const filePath = path.join(tempDir, '.installation.json');
      const content = await fs.readFile(filePath, 'utf-8');

      // 验证末尾有换行符
      expect(content.endsWith('\n')).toBe(true);
    });
  });

  describe('loadInstallationRecord', () => {
    it('应该成功加载有效的安装记录', async () => {
      const record: InstallationRecord = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        platform: 'win32',
        installSource: 'npm-global',
      };

      await writeInstallationRecord(tempDir, record);

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.record.schema_version).toBe(svm.baseline);
        expect(result.record.cliVersion).toBe('6.0.0');
        expect(result.record.platform).toBe('win32');
        expect(result.record.installSource).toBe('npm-global');
        expect(result.record.installedAt).toBe('2026-05-19T12:34:56.789Z');
      }
    });

    it('应该返回 missing 当文件不存在', async () => {
      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing');
    });

    it('应该返回 unparseable 当 JSON 解析失败', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      // 写入无效的 JSON
      await fs.writeFile(filePath, '{ invalid json }', 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('unparseable');
    });

    it('应该返回 missing_field 当缺少 schema_version', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      // 写入缺少 schema_version 的 JSON
      const incomplete = {
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        platform: 'win32',
        installSource: 'npm-global',
      };
      await fs.writeFile(filePath, JSON.stringify(incomplete), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当缺少 installedAt', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const incomplete = {
        schema_version: '1.0',
        cliVersion: '6.0.0',
        platform: 'darwin',
        installSource: 'npm-local',
      };
      await fs.writeFile(filePath, JSON.stringify(incomplete), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当缺少 cliVersion', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const incomplete = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        platform: 'linux',
        installSource: 'dev',
      };
      await fs.writeFile(filePath, JSON.stringify(incomplete), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当缺少 platform', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const incomplete = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        installSource: 'npm-global',
      };
      await fs.writeFile(filePath, JSON.stringify(incomplete), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当缺少 installSource', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const incomplete = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        platform: 'win32',
      };
      await fs.writeFile(filePath, JSON.stringify(incomplete), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当 platform 不是封闭枚举之一', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const invalid = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        platform: 'freebsd', // 不在封闭枚举中
        installSource: 'npm-global',
      };
      await fs.writeFile(filePath, JSON.stringify(invalid), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当 installSource 不是封闭枚举之一', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const invalid = {
        schema_version: '1.0',
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        platform: 'darwin',
        installSource: 'yarn-global', // 不在封闭枚举中
      };
      await fs.writeFile(filePath, JSON.stringify(invalid), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当字段类型错误', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      const invalid = {
        schema_version: 1.0, // 应该是 string，不是 number
        installedAt: '2026-05-19T12:34:56.789Z',
        cliVersion: '6.0.0',
        platform: 'linux',
        installSource: 'dev',
      };
      await fs.writeFile(filePath, JSON.stringify(invalid), 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当 JSON 是 null', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      await fs.writeFile(filePath, 'null', 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });

    it('应该返回 missing_field 当 JSON 是数组', async () => {
      const filePath = path.join(tempDir, '.installation.json');

      await fs.writeFile(filePath, '[]', 'utf-8');

      const result = await loadInstallationRecord(tempDir);

      expect(result.kind).toBe('missing_field');
    });
  });

  describe('封闭枚举类型验证', () => {
    it('应该接受所有有效的 platform 值', async () => {
      const platforms: Array<'win32' | 'darwin' | 'linux'> = ['win32', 'darwin', 'linux'];

      for (const platform of platforms) {
        const record: InstallationRecord = {
          schema_version: '1.0',
          installedAt: new Date().toISOString(),
          cliVersion: '6.0.0',
          platform,
          installSource: 'npm-global',
        };

        await writeInstallationRecord(tempDir, record);
        const result = await loadInstallationRecord(tempDir);

        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.record.platform).toBe(platform);
        }
      }
    });

    it('应该接受所有有效的 installSource 值', async () => {
      const sources: Array<'npm-global' | 'npm-local' | 'dev'> = [
        'npm-global',
        'npm-local',
        'dev',
      ];

      for (const installSource of sources) {
        const record: InstallationRecord = {
          schema_version: '1.0',
          installedAt: new Date().toISOString(),
          cliVersion: '6.0.0',
          platform: 'win32',
          installSource,
        };

        await writeInstallationRecord(tempDir, record);
        const result = await loadInstallationRecord(tempDir);

        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.record.installSource).toBe(installSource);
        }
      }
    });
  });
});
