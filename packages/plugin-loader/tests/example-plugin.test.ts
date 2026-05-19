/**
 * Example Plugin Tests (Task 8.2.1)
 * 
 * 测试简单示例插件可以正常加载
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isPluginManifest } from '../src/manifest';

describe('Simple Example Plugin', () => {
  const examplePluginPath = path.join(__dirname, '..', 'examples', 'simple-example');

  it('应存在 plugin.json 清单文件', async () => {
    const manifestPath = path.join(examplePluginPath, 'plugin.json');
    const exists = await fs.access(manifestPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('应存在入口文件 index.js', async () => {
    const entryPath = path.join(examplePluginPath, 'index.js');
    const exists = await fs.access(entryPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('plugin.json 应是有效的清单格式', async () => {
    const manifestPath = path.join(examplePluginPath, 'plugin.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    expect(isPluginManifest(parsed)).toBe(true);
  });

  it('清单应包含正确的必填字段', async () => {
    const manifestPath = path.join(examplePluginPath, 'plugin.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    
    expect(manifest.schema_version).toBe('1.0');
    expect(manifest.id).toBe('simple-example');
    expect(manifest.name).toBe('Simple Example Plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.entry).toBe('./index.js');
  });

  it('入口文件应包含有效的 JavaScript 代码', async () => {
    const entryPath = path.join(examplePluginPath, 'index.js');
    const content = await fs.readFile(entryPath, 'utf-8');
    
    // 基本语法检查 - 文件不为空
    expect(content.length).toBeGreaterThan(0);
    
    // 检查是否包含导出语句
    expect(content).toContain('export');
  });
});