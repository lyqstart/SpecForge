/**
 * 测试脚本：验证 specforge --help 输出包含必需的子命令
 */

import { createDefaultHelpSystem } from './packages/cli/src/help/HelpSystem';
import { ModeSwitch } from './packages/cli/src/mode-switch';

// 创建 HelpSystem 实例
const helpSystem = createDefaultHelpSystem();

// 创建 ModeSwitch（交互模式）
const modeSwitch = new ModeSwitch({ json: false });

// 生成 help 输出
const helpOutput = helpSystem.generateGeneralHelp(modeSwitch);

console.log('=== specforge --help 输出 ===\n');
console.log(helpOutput);
console.log('\n=== 验证必需子命令 ===\n');

// 验证必需的子命令
const requiredCommands = ['init', 'daemon', 'job', 'webhook'];
const missingCommands: string[] = [];

for (const cmd of requiredCommands) {
  if (helpOutput.includes(cmd)) {
    console.log(`✓ ${cmd} - 已包含`);
  } else {
    console.log(`✗ ${cmd} - 缺失`);
    missingCommands.push(cmd);
  }
}

if (missingCommands.length === 0) {
  console.log('\n✓ 所有必需子命令都已包含在 help 输出中');
  process.exit(0);
} else {
  console.log(`\n✗ 缺失子命令: ${missingCommands.join(', ')}`);
  process.exit(1);
}
