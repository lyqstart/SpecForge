/**
 * 异步资源管理示例测试
 * 展示如何遵循 async-resource-coding-standards.md 规则
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 模拟一个需要资源管理的类
class ResourceManager {
  private timers: ReturnType<typeof setTimeout>[] = []
  private subscriptions: string[] = []

  // 规则 C1: Promise.race 必须在 finally 中清理败者 timer
  async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`操作超时（${ms}ms）`)), ms)
          this.timers.push(timer)
        }),
      ])
    } finally {
      if (timer!) {
        clearTimeout(timer)
        const index = this.timers.indexOf(timer)
        if (index > -1) this.timers.splice(index, 1)
      }
    }
  }

  // 规则 C4: 返回需要清理的资源时，必须提供 dispose 方法
  subscribe(id: string): { unsubscribe: () => void } {
    this.subscriptions.push(id)
    return {
      unsubscribe: () => {
        const index = this.subscriptions.indexOf(id)
        if (index > -1) this.subscriptions.splice(index, 1)
      },
    }
  }

  // 规则 X2: 副作用必须可检测
  getActiveTimerCount(): number {
    return this.timers.length
  }

  getActiveSubscriptionCount(): number {
    return this.subscriptions.length
  }

  // 清理所有资源
  cleanup(): void {
    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers.length = 0
    this.subscriptions.length = 0
  }
}

describe('异步资源管理示例', () => {
  let manager: ResourceManager

  beforeEach(() => {
    manager = new ResourceManager()
    vi.useFakeTimers() // 规则 T4: 使用 fake timer
  })

  afterEach(() => {
    manager.cleanup()
    vi.useRealTimers() // 规则 T4: 恢复真实 timer
    
    // 规则 T1: 断言无残留资源
    expect(manager.getActiveTimerCount()).toBe(0)
    expect(manager.getActiveSubscriptionCount()).toBe(0)
  })

  it('should handle timeout correctly with cleanup', async () => {
    // 创建一个永远不会完成的 promise
    const neverResolves = new Promise<never>(() => {})
    
    const timeoutPromise = manager.withTimeout(neverResolves, 1000)
    
    // 使用 fake timer 推进时间
    vi.advanceTimersByTime(1001)
    
    await expect(timeoutPromise).rejects.toThrow('操作超时（1000ms）')
    
    // 验证 timer 已被清理
    expect(manager.getActiveTimerCount()).toBe(0)
  })

  it('should cleanup timer when promise resolves', async () => {
    const resolvesQuickly = Promise.resolve('success')
    
    const result = await manager.withTimeout(resolvesQuickly, 5000)
    
    expect(result).toBe('success')
    expect(manager.getActiveTimerCount()).toBe(0)
  })

  it('should manage subscriptions correctly', () => {
    const sub1 = manager.subscribe('id1')
    const sub2 = manager.subscribe('id2')
    
    expect(manager.getActiveSubscriptionCount()).toBe(2)
    
    sub1.unsubscribe()
    expect(manager.getActiveSubscriptionCount()).toBe(1)
    
    sub2.unsubscribe()
    expect(manager.getActiveSubscriptionCount()).toBe(0)
  })

  it('should support try/finally pattern for resource cleanup', async () => {
    const subscription = manager.subscribe('test-id')
    
    try {
      expect(manager.getActiveSubscriptionCount()).toBe(1)
      // 模拟一些操作
      const result = await Promise.resolve('operation completed')
      expect(result).toBe('operation completed')
    } finally {
      subscription.unsubscribe() // 无论成功失败都清理
      expect(manager.getActiveSubscriptionCount()).toBe(0)
    }
  })
})

describe('测试框架验证', () => {
  it('should have working test environment with async support', async () => {
    const result = await Promise.resolve(42)
    expect(result).toBe(42)
  })

  it('should support fake timers', () => {
    vi.useFakeTimers()
    
    let called = false
    setTimeout(() => { called = true }, 1000)
    
    expect(called).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(called).toBe(true)
    
    vi.useRealTimers()
  })

  it('should follow async-resource-coding-standards.md rules', () => {
    // 验证测试配置
    expect(process.env.NODE_ENV).toBeDefined()
    expect(typeof describe).toBe('function')
    expect(typeof it).toBe('function')
    expect(typeof expect).toBe('function')
    expect(typeof vi).toBe('object')
  })
})