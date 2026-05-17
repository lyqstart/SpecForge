/**
 * 禁止 API 规则集单元测试
 * 
 * 测试覆盖：
 *   - 规则定义完整性
 *   - 规则匹配逻辑
 *   - 权限验证
 *   - 通配符匹配
 * 
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  DEFAULT_RULE_SET, 
  createRuleMatcher, 
  RuleMatcher, 
  type StaticCheckRule,
  type RuleMatchType 
} from '../../src/static-checker/rules';

describe('禁止 API 规则集', () => {
  let ruleMatcher: RuleMatcher;

  beforeEach(() => {
    ruleMatcher = createRuleMatcher();
  });

  describe('规则定义完整性', () => {
    it('应该包含 child_process 相关规则', () => {
      const rules = ruleMatcher.getRules();
      const childProcessRules = rules.filter(rule => 
        rule.id.includes('CHILD_PROCESS') || 
        rule.pattern.includes('child_process')
      );
      
      expect(childProcessRules.length).toBeGreaterThan(0);
      expect(childProcessRules.every(rule => rule.requiredPermission === 'child_process')).toBe(true);
    });

    it('应该包含文件系统相关规则', () => {
      const rules = ruleMatcher.getRules();
      const fsRules = rules.filter(rule => 
        rule.id.includes('FS_') || 
        rule.pattern.includes('fs.')
      );
      
      expect(fsRules.length).toBeGreaterThan(0);
      expect(fsRules.every(rule => 
        rule.requiredPermission === 'filesystem.read' || 
        rule.requiredPermission === 'filesystem.write'
      )).toBe(true);
    });

    it('应该包含网络访问相关规则', () => {
      const rules = ruleMatcher.getRules();
      const networkRules = rules.filter(rule => 
        rule.id.includes('HTTP') || 
        rule.id.includes('HTTPS') || 
        rule.id.includes('NET_') ||
        rule.id.includes('FETCH')
      );
      
      expect(networkRules.length).toBeGreaterThan(0);
      expect(networkRules.every(rule => rule.requiredPermission === 'network')).toBe(true);
    });

    it('应该包含导入语句规则', () => {
      const rules = ruleMatcher.getRules();
      const importRules = rules.filter(rule => 
        rule.id.includes('IMPORT_') || 
        rule.matchType === 'import'
      );
      
      expect(importRules.length).toBeGreaterThan(0);
    });

    it('应该包含环境变量相关规则', () => {
      const rules = ruleMatcher.getRules();
      const envRules = rules.filter(rule => 
        rule.id.includes('PROCESS_ENV') || 
        rule.id.includes('OS_') ||
        rule.requiredPermission === 'env.read'
      );
      
      expect(envRules.length).toBeGreaterThan(0);
    });
  });

  describe('规则匹配逻辑', () => {
    it('应该匹配 child_process.exec 调用', () => {
      const matchedRules = ruleMatcher.matchRules('child_process.exec', 'function_call');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('CHILD_PROCESS_EXEC');
      expect(matchedRules[0].requiredPermission).toBe('child_process');
    });

    it('应该匹配 fs.readFile 调用', () => {
      const matchedRules = ruleMatcher.matchRules('fs.readFile', 'function_call');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('FS_READ_FILE');
      expect(matchedRules[0].requiredPermission).toBe('filesystem.read');
    });

    it('应该匹配 http.request 调用', () => {
      const matchedRules = ruleMatcher.matchRules('http.request', 'function_call');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('HTTP_REQUEST');
      expect(matchedRules[0].requiredPermission).toBe('network');
    });

    it('应该匹配 fetch 调用', () => {
      const matchedRules = ruleMatcher.matchRules('fetch', 'function_call');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('FETCH_API');
      expect(matchedRules[0].requiredPermission).toBe('network');
    });

    it('应该匹配 child_process 模块导入', () => {
      const matchedRules = ruleMatcher.matchRules('child_process', 'import');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('IMPORT_CHILD_PROCESS');
      expect(matchedRules[0].requiredPermission).toBe('child_process');
    });

    it('应该匹配 process.env 访问', () => {
      const matchedRules = ruleMatcher.matchRules('process.env', 'variable_ref');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('PROCESS_ENV_ACCESS');
      expect(matchedRules[0].requiredPermission).toBe('env.read');
    });
  });

  describe('权限验证', () => {
    it('应该在有权��时允许 child_process.exec', () => {
      const matchedRules = ruleMatcher.matchRules('child_process.exec', 'function_call', ['child_process']);
      
      expect(matchedRules).toHaveLength(0); // 有权限，不匹配任何规则
    });

    it('应该在有权��时允许 fs.readFile', () => {
      const matchedRules = ruleMatcher.matchRules('fs.readFile', 'function_call', ['filesystem.read']);
      
      expect(matchedRules).toHaveLength(0); // 有权限，不匹配任何规则
    });

    it('应该在有权��时允许 http.request', () => {
      const matchedRules = ruleMatcher.matchRules('http.request', 'function_call', ['network']);
      
      expect(matchedRules).toHaveLength(0); // 有权限，不匹配任何规则
    });

    it('应该在有读权限时允许 fs.readFile 但禁止 fs.writeFile', () => {
      const readFileRules = ruleMatcher.matchRules('fs.readFile', 'function_call', ['filesystem.read']);
      const writeFileRules = ruleMatcher.matchRules('fs.writeFile', 'function_call', ['filesystem.read']);
      
      expect(readFileRules).toHaveLength(0); // 有读权限，允许读
      expect(writeFileRules.length).toBeGreaterThan(0); // 无写权限，禁止写
    });

    it('应该支持部分权限', () => {
      // 只有 filesystem.read 权限
      const permissions = ['filesystem.read'];
      
      const fsReadRules = ruleMatcher.matchRules('fs.readFile', 'function_call', permissions);
      const fsWriteRules = ruleMatcher.matchRules('fs.writeFile', 'function_call', permissions);
      const fsUnlinkRules = ruleMatcher.matchRules('fs.unlink', 'function_call', permissions);
      
      expect(fsReadRules).toHaveLength(0); // 允许读
      expect(fsWriteRules.length).toBeGreaterThan(0); // 禁止写
      expect(fsUnlinkRules.length).toBeGreaterThan(0); // 禁止删除
    });
  });

  describe('通配符匹配', () => {
    it('应该匹配通配符模式 *.listen', () => {
      const matchedRules = ruleMatcher.matchRules('server.listen', 'function_call');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].pattern).toBe('*.listen');
      expect(matchedRules[0].requiredPermission).toBe('network');
    });

    it('应该匹配 child_process.* 模式', () => {
      // 测试多个 child_process 函数
      const execRules = ruleMatcher.matchRules('child_process.exec', 'function_call');
      const spawnRules = ruleMatcher.matchRules('child_process.spawn', 'function_call');
      const forkRules = ruleMatcher.matchRules('child_process.fork', 'function_call');
      
      expect(execRules.length).toBeGreaterThan(0);
      expect(spawnRules.length).toBeGreaterThan(0);
      expect(forkRules.length).toBeGreaterThan(0);
      
      // 所有 child_process 函数都需要 child_process 权限
      expect(execRules[0].requiredPermission).toBe('child_process');
      expect(spawnRules[0].requiredPermission).toBe('child_process');
      expect(forkRules[0].requiredPermission).toBe('child_process');
    });

    it('应该匹配 fs.* 模式', () => {
      // 测试多个 fs 函数
      const readFileRules = ruleMatcher.matchRules('fs.readFile', 'function_call');
      const writeFileRules = ruleMatcher.matchRules('fs.writeFile', 'function_call');
      const statRules = ruleMatcher.matchRules('fs.stat', 'function_call');
      
      expect(readFileRules.length).toBeGreaterThan(0);
      expect(writeFileRules.length).toBeGreaterThan(0);
      expect(statRules.length).toBeGreaterThan(0);
    });
  });

  describe('规则查询', () => {
    it('应该按权限获取规则', () => {
      const childProcessRules = ruleMatcher.getRulesByPermission('child_process');
      const fsReadRules = ruleMatcher.getRulesByPermission('filesystem.read');
      const networkRules = ruleMatcher.getRulesByPermission('network');
      
      expect(childProcessRules.length).toBeGreaterThan(0);
      expect(fsReadRules.length).toBeGreaterThan(0);
      expect(networkRules.length).toBeGreaterThan(0);
      
      expect(childProcessRules.every(rule => rule.requiredPermission === 'child_process')).toBe(true);
      expect(fsReadRules.every(rule => rule.requiredPermission === 'filesystem.read')).toBe(true);
      expect(networkRules.every(rule => rule.requiredPermission === 'network')).toBe(true);
    });

    it('应该按严重级别获取规则', () => {
      const errorRules = ruleMatcher.getRulesBySeverity('error');
      const warningRules = ruleMatcher.getRulesBySeverity('warning');
      
      expect(errorRules.length).toBeGreaterThan(0);
      expect(warningRules.length).toBeGreaterThan(0);
      
      expect(errorRules.every(rule => rule.severity === 'error')).toBe(true);
      expect(warningRules.every(rule => rule.severity === 'warning')).toBe(true);
    });

    it('应该获取所有启用的规则', () => {
      const rules = ruleMatcher.getRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every(rule => rule.enabled)).toBe(true);
      
      // 检查默认规则集中的所有规则都被加载
      const defaultRuleCount = DEFAULT_RULE_SET.rules.filter(rule => rule.enabled).length;
      expect(rules.length).toBe(defaultRuleCount);
    });
  });

  describe('边界情况', () => {
    it('应该处理不匹配的 API', () => {
      const matchedRules = ruleMatcher.matchRules('console.log', 'function_call');
      
      expect(matchedRules).toHaveLength(0); // console.log 不在规则集中
    });

    it('应该处理不匹配的类型', () => {
      // 尝试用错误的类型匹配
      const matchedRules = ruleMatcher.matchRules('child_process', 'function_call');
      
      // child_process 是导入规则，不是函数调用规则
      expect(matchedRules).toHaveLength(0);
    });

    it('应该处理空权限列表', () => {
      const matchedRules = ruleMatcher.matchRules('child_process.exec', 'function_call', []);
      
      expect(matchedRules.length).toBeGreaterThan(0); // 无权限，应该匹配
    });

    it('应该处理 undefined 权限', () => {
      const matchedRules = ruleMatcher.matchRules('child_process.exec', 'function_call', undefined as any);
      
      expect(matchedRules.length).toBeGreaterThan(0); // 无权限，应该匹配
    });
  });

  describe('规则集配置', () => {
    it('应该支持自定义规则集', () => {
      const customRuleSet = {
        version: '1.0',
        rules: [
          {
            id: 'CUSTOM_RULE',
            name: '自定义规则',
            description: '禁止使用 console.log',
            pattern: 'console.log',
            matchType: 'function_call' as RuleMatchType,
            severity: 'error' as const,
            errorMessage: '禁止使用 console.log（行 {line}）',
            enabled: true,
          },
        ],
      };

      const customMatcher = createRuleMatcher(customRuleSet);
      const matchedRules = customMatcher.matchRules('console.log', 'function_call');
      
      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].id).toBe('CUSTOM_RULE');
    });

    it('应该支持禁用规则', () => {
      const disabledRuleSet = {
        version: '1.0',
        rules: [
          {
            id: 'CHILD_PROCESS_EXEC',
            name: 'child_process.exec 调用',
            description: '禁止直接调用 child_process.exec',
            pattern: 'child_process.exec',
            matchType: 'function_call' as RuleMatchType,
            severity: 'error' as const,
            requiredPermission: 'child_process',
            errorMessage: '禁止调用 child_process.exec（行 {line}）',
            enabled: false, // 禁用此规则
          },
        ],
      };

      const disabledMatcher = createRuleMatcher(disabledRuleSet);
      const matchedRules = disabledMatcher.matchRules('child_process.exec', 'function_call');
      
      expect(matchedRules).toHaveLength(0); // 规则被禁用，不匹配
    });
  });
});