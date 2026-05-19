#!/usr/bin/env bun
/**
 * check-version-alignment.ts - 发布前版本对齐检查
 * 
 * 此脚本在 publish-pipeline.ts 主流程的最早一步调用。
 * 读取：
 * 1. 最近 git tag（`git describe --tags --abbrev=0`）
 * 2. packages/cli/package.json#version
 * 
 * 断言两者完全相等。
 * 不相等时退出 PUBLISH_VALIDATION 错误码。
 * 
 * Requirements: 6.1
 * 
 * @example
 * bun run scripts/check-version-alignment.ts
 * # 或
 * node dist/check-version-alignment.js
 */

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 错误码
const EXIT_PUBLISH_VALIDATION = 1;

/**
 * 获取最近的 git tag
 * 使用 `git describe --tags --abbrev=0` 获取最近annotated tag
 * 如果没有 tag，返回 null
 */
function getLatestGitTag(): string | null {
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    
    // 去除 "v" 前缀（如果有）
    return tag.startsWith("v") ? tag.slice(1) : tag;
  } catch (error) {
    // 没有 tag 或者命令失败
    return null;
  }
}

/**
 * 读取 packages/cli/package.json 的 version 字段
 */
async function getCliPackageVersion(): Promise<string> {
  const packageJsonPath = join(process.cwd(), "packages/cli/package.json");
  const content = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(content);
  return pkg.version;
}

/**
 * 主函数：检查版本对齐
 */
async function main(): Promise<void> {
  console.log("Checking version alignment...");
  
  // 1. 获取 git tag 版本
  const gitTagVersion = getLatestGitTag();
  if (!gitTagVersion) {
    console.error("Error: No git tags found. Please create a tag before publishing.");
    process.exit(EXIT_PUBLISH_VALIDATION);
  }
  console.log(`Git tag version: ${gitTagVersion}`);
  
  // 2. 获取 package.json version
  const packageVersion = await getCliPackageVersion();
  console.log(`Package.json version: ${packageVersion}`);
  
  // 3. 断言两者相等
  if (gitTagVersion !== packageVersion) {
    console.error("");
    console.error("Error: Version mismatch detected!");
    console.error(`  Git tag version:    ${gitTagVersion}`);
    console.error(`  Package.json version: ${packageVersion}`);
    console.error("");
    console.error("The git tag version must match packages/cli/package.json#version.");
    console.error("Please either:");
    console.error("  1. Create a new tag matching the package version: git tag v<version>");
    console.error("  2. Update packages/cli/package.json#version to match the tag");
    process.exit(EXIT_PUBLISH_VALIDATION);
  }
  
  console.log("✓ Version alignment check passed!");
  console.log(`  Both git tag and package.json report version ${packageVersion}`);
}

// 运行
main().catch((error) => {
  console.error("Unexpected error during version alignment check:", error);
  process.exit(EXIT_PUBLISH_VALIDATION);
});