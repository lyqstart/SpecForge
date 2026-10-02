#!/usr/bin/env bun
/**
 * 发布前产品版本对齐检查。
 *
 * 根 package.json 是产品版本身份的唯一实现入口；所有当前 workspace package
 * 必须使用同一版本，当前提交必须具有精确的 specforge-v<semver> 标签。
 */

import { execFileSync } from 'node:child_process';
import {
  assertWorkspaceVersionAlignment,
  expectedProductTag,
  loadProductIdentity,
} from './lib/product-identity';

const EXIT_PUBLISH_VALIDATION = 1;

function tagsPointingAtHead(): readonly string[] {
  return execFileSync('git', ['tag', '--points-at', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split(/\r?\n/u)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const candidateRoot = process.cwd();
  const identity = await loadProductIdentity(candidateRoot);
  await assertWorkspaceVersionAlignment(candidateRoot, identity.version);

  const expectedTag = expectedProductTag(identity);
  const headTags = tagsPointingAtHead();
  if (!headTags.includes(expectedTag)) {
    throw new Error(
      `PRODUCT_TAG_MISMATCH:expected:${expectedTag}:head_tags:${headTags.join(',') || 'none'}`,
    );
  }

  console.log(`PRODUCT_VERSION=${identity.version}`);
  console.log(`PRODUCT_VERSION_EPOCH=${identity.versionEpoch}`);
  console.log(`PRODUCT_RELEASE_ID=${identity.releaseId}`);
  console.log(`PRODUCT_TAG=${expectedTag}`);
  console.log('VERSION_ALIGNMENT=PASS');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT_PUBLISH_VALIDATION);
});
