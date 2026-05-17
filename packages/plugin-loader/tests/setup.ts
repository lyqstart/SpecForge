/**
 * plugin-loader 测试设置文件
 * 全局测试配置和 mock
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest'

// 全局测试配置
beforeAll(() => {
  // 测试环境初始化
})

// 每个测试文件结束后清理
afterEach(() => {
  // 清理 vi mocks
  vi.clearAllMocks()
})

// 所有测试结束后清理全局资源
afterAll(() => {
  // 全局清理
})