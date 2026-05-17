/**
 * plugin-loader 基础测试框架
 * 验证测试环境正常工作
 */

import { describe, it, expect } from 'vitest'

describe('plugin-loader 基础测试框架', () => {
  it('should have working test environment', () => {
    expect(true).toBe(true)
  })

  it('should support basic assertions', () => {
    const value = 1 + 1
    expect(value).toBe(2)
    expect(value).toBeGreaterThan(1)
    expect(value).toBeLessThan(3)
  })

  it('should support async tests', async () => {
    const result = await Promise.resolve(42)
    expect(result).toBe(42)
  })
})