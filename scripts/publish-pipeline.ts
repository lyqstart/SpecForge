#!/usr/bin/env bun

/**
 * 发布流水线
 * 
 * 职责：串联主流程，实现完整的发布流水线
 * Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 6.6
 * 
 * 主流程步骤（按顺序）：
 * 1. 检查 git tag 与 package.json version 对齐（check-version-alignment.ts）
 * 2. 枚举 packages/* 目录
 * 3. 对每个包：PackageValidator.validate(mode: "dev")
 * 4. DependencyRewriter.rewrite
 * 5. bun run build
 * 6. 验证 dist/ 中 main/types 文件存在
 * 7. PackageValidator.validate(mode: "publish")
 * 8. SchemaVersionManager.assertMonotonic
 * 9. bun publish（或 dry-run 模式）
 * 
 * 使用方法：
 *   bun run scripts/publish-pipeline.ts [选项]
 * 
 * 选项：
 *   --help              显示此帮助信息
 *   --dry-run           不实际 publish，只验证
 *   --package=<name>    只处理指定包（如 --package=cli）
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { validate } from '../packages/cli/src/distribution/package-validator';
import { rewrite } from '../packages/cli/src/distribution/dependency-rewriter';
import { SchemaVersionManager } from '../packages/cli/src/distribution/schema-version-manager';
import type { ParsedPackageJson, ValidationContext } from '../packages/cli/src/distribution/types';

// 导入版本对齐检查
import { execSync } from 'node:child_process';
import { readFile as fsReadFile } from 'node:fs/promises';

// 版本对齐检查函数（内联实现，避免额外文件依赖）
async function checkVersionAlignment(): Promise<void> {
  console.log('🔍 检查 git tag 与 package.json version 对齐...\n');
  
  // 获取最近 git tag
  let gitTagVersion: string | null = null;
  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    gitTagVersion = tag.startsWith('v') ? tag.slice(1) : tag;
  } catch {
    console.error('错误: 未找到 git tag。请在发布前创建 tag。');
    console.error('示例: git tag v1.0.0');
    process.exit(1);
  }
  
  console.log(`   Git tag version: ${gitTagVersion}`);
  
  // 读取 package.json version
  const packageJsonPath = join(process.cwd(), 'packages/cli/package.json');
  const pkgContent = await fsReadFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(pkgContent);
  const packageVersion = pkg.version;
  
  console.log(`   Package.json version: ${packageVersion}`);
  
  // 断言相等
  if (gitTagVersion !== packageVersion) {
    console.error('\n❌ 版本不匹配!');
    console.error(`   Git tag:    ${gitTagVersion}`);
    console.error(`   Package.json: ${packageVersion}`);
    console.error('\nGit tag version 必须与 packages/cli/package.json#version 完全相等。');
    console.error('请执行以下操作之一:');
    console.error('   1. 创建与 package.json version 匹配的 tag: git tag v<version>');
    console.error('   2. 更新 packages/cli/package.json#version 以匹配 tag');
    process.exit(1);
  }
  
  console.log('✅ 版本对齐检查通过!\n');
}

// ============================================================================
// 命令行参数解析
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
发布流水线 - 验证并发布 @specforge/* 包

用途：
  对 packages/* 下的所有包执行完整的发布前验证和发布流程

选项：
  --help              显示此帮助信息
  --dry-run           不实际 publish，只验证
  --package=<name>    只处理指定包（如 --package=cli）

示例：
  bun run scripts/publish-pipeline.ts
  bun run scripts/publish-pipeline.ts --dry-run
  bun run scripts/publish-pipeline.ts --package=cli --dry-run
`);
  process.exit(0);
}

const dryRun = args.includes('--dry-run');
const packageFilter = args.find(arg => arg.startsWith('--package='))?.split('=')[1];

// ============================================================================
// 错误码定义
// ============================================================================

type PublishErrorCode =
  | 'PUBLISH_VALIDATION'
  | 'PUBLISH_BUILD_FAILED'
  | 'PUBLISH_DIST_MISSING'
  | 'PUBLISH_BASELINE_DOWNGRADE'
  | 'WORKSPACE_NOT_REWRITTEN';

function exitWithError(code: PublishErrorCode, packageName: string, message: string, details?: string): never {
  console.error(`\n❌ [${code}] ${packageName}: ${message}`);
  if (details) {
    console.error(`   详情: ${details}`);
  }
  
  // 错误码 → 退出码映射
  const exitCodeMap: Record<PublishErrorCode, number> = {
    PUBLISH_VALIDATION: 1,
    PUBLISH_BUILD_FAILED: 1,
    PUBLISH_DIST_MISSING: 1,
    PUBLISH_BASELINE_DOWNGRADE: 1,
    WORKSPACE_NOT_REWRITTEN: 1,
  };
  
  process.exit(exitCodeMap[code] || 1);
}

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  console.log('🚀 发布流水线启动\n');
  
  // Step 0: 检查版本对齐（最早一步）
  await checkVersionAlignment();
  
  const repoRoot = resolve(__dirname, '..');
  const packagesDir = join(repoRoot, 'packages');
  
  // Step 1: 枚举 packages/* 目录
  console.log('📦 枚举 packages/* 目录...');
  const allPackages = readdirSync(packagesDir).filter(name => {
    const pkgPath = join(packagesDir, name);
    return statSync(pkgPath).isDirectory() && existsSync(join(pkgPath, 'package.json'));
  });
  
  // 应用 --package 过滤
  const packagesToProcess = packageFilter
    ? allPackages.filter(name => name === packageFilter)
    : allPackages;
  
  if (packagesToProcess.length === 0) {
    if (packageFilter) {
      console.error(`❌ 未找到包: ${packageFilter}`);
      process.exit(1);
    } else {
      console.error('❌ packages/ 目录下没有找到任何包');
      process.exit(1);
    }
  }
  
  console.log(`   找到 ${packagesToProcess.length} 个包: ${packagesToProcess.join(', ')}\n`);
  
  // 构建版本映射表（用于 DependencyRewriter）
  const versionMap = new Map<string, string>();
  for (const pkgName of packagesToProcess) {
    const pkgPath = join(packagesDir, pkgName);
    const pkgJsonPath = join(pkgPath, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as ParsedPackageJson;
    versionMap.set(pkgJson.name, pkgJson.version);
  }
  
  // 初始化 SchemaVersionManager
  const svm = new SchemaVersionManager('1.0'); // baseline 默认 1.0
  
  // 对每个包执行流水线
  for (const pkgName of packagesToProcess) {
    const pkgPath = join(packagesDir, pkgName);
    const pkgJsonPath = join(pkgPath, 'package.json');
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 处理包: ${pkgName}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 读取 package.json
    const pkgJsonRaw = readFileSync(pkgJsonPath, 'utf-8');
    let pkgJson = JSON.parse(pkgJsonRaw) as ParsedPackageJson;
    
    // 特殊处理：跳过 private: true 且不被 cli 依赖的包
    if (pkgJson.private === true) {
      // 检查 cli 是否依赖此包
      const cliPkgPath = join(packagesDir, 'cli', 'package.json');
      if (existsSync(cliPkgPath)) {
        const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf-8')) as ParsedPackageJson;
        const isCliDependency = 
          (cliPkg.dependencies && pkgJson.name in cliPkg.dependencies) ||
          (cliPkg.devDependencies && pkgJson.name in cliPkg.devDependencies);
        
        if (!isCliDependency) {
          console.log(`⏭️  跳过 private 包（不被 cli 依赖）: ${pkgJson.name}\n`);
          continue;
        }
      } else {
        console.log(`⏭️  跳过 private 包: ${pkgJson.name}\n`);
        continue;
      }
    }
    
    // Step 2: PackageValidator.validate(mode: "dev")
    console.log('1️⃣  验证 package.json (dev 模式)...');
    const devValidationCtx: ValidationContext = {
      packagePath: pkgPath,
      mode: 'dev',
      publishVersionMap: versionMap,
    };
    const devValidation = validate(pkgJson, devValidationCtx);
    if (!devValidation.isValid) {
      const firstError = devValidation.errors[0];
      exitWithError(
        'PUBLISH_VALIDATION',
        pkgJson.name,
        `Dev 模式验证失败: ${firstError.message}`,
        `字段: ${firstError.field}, 错误码: ${firstError.code}`
      );
    }
    console.log('   ✅ Dev 模式验证通过\n');
    
    // Step 3: DependencyRewriter.rewrite
    console.log('2️⃣  重写 workspace:* 依赖...');
    try {
      pkgJson = rewrite(pkgJson, versionMap);
      console.log('   ✅ 依赖重写完成\n');
    } catch (error) {
      exitWithError(
        'WORKSPACE_NOT_REWRITTEN',
        pkgJson.name,
        '依赖重写失败',
        error instanceof Error ? error.message : String(error)
      );
    }
    
    // Step 4: bun run build
    console.log('3️⃣  构建包...');
    const buildResult = Bun.spawnSync(['bun', 'run', 'build'], {
      cwd: pkgPath,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    if (buildResult.exitCode !== 0) {
      exitWithError(
        'PUBLISH_BUILD_FAILED',
        pkgJson.name,
        `构建失败 (退出码 ${buildResult.exitCode})`,
        buildResult.stderr.toString()
      );
    }
    console.log('   ✅ 构建成功\n');
    
    // Step 5: 验证 dist/ 中 main/types 文件存在
    console.log('4️⃣  验证 dist/ 文件...');
    const mainPath = join(pkgPath, pkgJson.main);
    const typesPath = join(pkgPath, pkgJson.types);
    
    if (!existsSync(mainPath)) {
      exitWithError(
        'PUBLISH_DIST_MISSING',
        pkgJson.name,
        `main 文件不存在: ${pkgJson.main}`,
        `绝对路径: ${mainPath}`
      );
    }
    
    if (!existsSync(typesPath)) {
      exitWithError(
        'PUBLISH_DIST_MISSING',
        pkgJson.name,
        `types 文件不存在: ${pkgJson.types}`,
        `绝对路径: ${typesPath}`
      );
    }
    console.log(`   ✅ main 文件存在: ${pkgJson.main}`);
    console.log(`   ✅ types 文件存在: ${pkgJson.types}\n`);
    
    // Step 6: PackageValidator.validate(mode: "publish")
    console.log('5️⃣  验证 package.json (publish 模式)...');
    const publishValidationCtx: ValidationContext = {
      packagePath: pkgPath,
      mode: 'publish',
      publishVersionMap: versionMap,
    };
    const publishValidation = validate(pkgJson, publishValidationCtx);
    if (!publishValidation.isValid) {
      const firstError = publishValidation.errors[0];
      exitWithError(
        'PUBLISH_VALIDATION',
        pkgJson.name,
        `Publish 模式验证失败: ${firstError.message}`,
        `字段: ${firstError.field}, 错误码: ${firstError.code}`
      );
    }
    console.log('   ✅ Publish 模式验证通过\n');
    
    // Step 7: SchemaVersionManager.assertMonotonic
    console.log('6️⃣  验证 schema_version 单调性...');
    // 注：这里简化处理，实际应该从 registry 获取历史最高版本
    // 本次实现假设 highestPublished 为 null（首次发布）或从环境变量读取
    const highestPublished = process.env.HIGHEST_PUBLISHED_BASELINE || null;
    const monotonicResult = svm.assertMonotonic(svm.baseline, highestPublished);
    if (!monotonicResult.isValid) {
      const firstError = monotonicResult.errors[0];
      exitWithError(
        'PUBLISH_BASELINE_DOWNGRADE',
        pkgJson.name,
        firstError.message,
        `当前 baseline: ${svm.baseline}, 历史最高: ${highestPublished}`
      );
    }
    console.log('   ✅ schema_version 单调性验证通过\n');
    
    // Step 8: bun publish（或 dry-run 模式）
    if (dryRun) {
      console.log('7️⃣  [DRY-RUN] 跳过实际发布\n');
      console.log(`✅ ${pkgJson.name} 验证通过（dry-run 模式）\n`);
    } else {
      console.log('7️⃣  发布到 npm registry...');
      const publishResult = Bun.spawnSync(['bun', 'publish'], {
        cwd: pkgPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      
      if (publishResult.exitCode !== 0) {
        exitWithError(
          'PUBLISH_VALIDATION',
          pkgJson.name,
          `发布失败 (退出码 ${publishResult.exitCode})`,
          publishResult.stderr.toString()
        );
      }
      console.log('   ✅ 发布成功\n');
      console.log(`✅ ${pkgJson.name} 发布完成\n`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 发布流水线完成');
  console.log('='.repeat(60));
  console.log(`\n处理了 ${packagesToProcess.length} 个包`);
  if (dryRun) {
    console.log('模式: DRY-RUN（未实际发布）');
  }
  console.log('');
}

// ============================================================================
// 入口
// ============================================================================

main().catch(error => {
  console.error('\n💥 发布流水线失败:', error);
  process.exit(1);
});
