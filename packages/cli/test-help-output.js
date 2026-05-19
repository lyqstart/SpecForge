#!/usr/bin/env node

/**
 * 测试脚本：验证 specforge --help 输出包含必需的子命令
 * 
 * 任务 4.7 要求：
 * - init
 * - daemon
 * - job
 * - webhook
 */

const { execSync } = require('child_process');
const path = require('path');

try {
  // 运行 CLI 的 --help 命令
  const cliPath = path.join(__dirname, 'dist', 'cli.js');
  const output = execSync(`node "${cliPath}" --help`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  console.log('=== CLI --help 输出 ===\n');
  console.log(output);
  console.log('\n=== 验证必需的子命令 ===\n');
  
  const requiredCommands = ['init', 'daemon', 'job', 'webhook'];
  const results = {};
  
  for (const cmd of requiredCommands) {
    const found = output.includes(cmd);
    results[cmd] = found;
    console.log(`${found ? '✓' : '✗'} ${cmd}: ${found ? '找到' : '未找到'}`);
  }
  
  const allFound = Object.values(results).every(v => v);
  
  console.log('\n=== 测试结果 ===\n');
  if (allFound) {
    console.log('✓ 所有必需的子命令都已在 --help 输出中');
    process.exit(0);
  } else {
    console.log('✗ 部分子命令未在 --help 输出中找到');
    process.exit(1);
  }
} catch (error) {
  console.error('错误:', error.message);
  if (error.stdout) {
    console.log('\nstdout:', error.stdout.toString());
  }
  if (error.stderr) {
    console.error('\nstderr:', error.stderr.toString());
  }
  process.exit(1);
}
