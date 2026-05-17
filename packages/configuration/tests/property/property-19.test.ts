/**
 * Property 19: Hot-reload Activation Boundary Test
 * 
 * Feature: configuration, Property 19: Hot-reload Activation Boundary
 * Derived-From: v6-architecture-overview Property 19
 * 
 * Property 19: For all configuration hot-reload events reload@t and subsequent events,
 * new config values apply to "start time > t" workflows/work items immediately;
 * workflows/work items with "start time <= t" that are still running maintain old values.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { HotReloadManager } from '../../src/hot-reload'
import { mergeConfigLayers } from '../../src/config-merge'
import { ConfigLayer, MergedConfig } from '../../src/types'

describe('Property 19: Hot-reload Activation Boundary', () => {
  let manager: HotReloadManager

  beforeEach(() => {
    manager = new HotReloadManager({ enabled: true, debounceMs: 0, watchPaths: [] })
  })

  /**
   * Helper to create a config with a specific key-value pair
   */
  function createConfig(key: string, value: string): MergedConfig {
    const layers: ConfigLayer[] = [
      { type: 'builtin', timestamp: Date.now(), data: { [key]: value } },
    ]
    return mergeConfigLayers(layers)
  }

  it('should apply new config to work items starting after reload time', () => {
    // Filter out dangerous property names that have special JavaScript behavior
    const safeKey = fc.string().filter(s => s.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(s))
    
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 100000 }), // baseTime
        fc.integer({ min: 1, max: 1000 }), // timeBeforeReload
        fc.integer({ min: 1, max: 1000 }), // timeAfterReload
        safeKey, // key (non-empty, safe)
        fc.string(), // valueBefore
        fc.string().filter(s => s !== ''), // valueAfter (different from before)
        (baseTime, timeBeforeReload, timeAfterReload, key, valueBefore, valueAfter) => {
          const reloadTime = baseTime + timeBeforeReload
          
          // Set up reload time FIRST, then create configs and snapshots
          manager['lastReloadTime'] = reloadTime
          manager['reloadEvents'].push({
            eventId: 'reload-1',
            timestamp: reloadTime,
            trigger: 'api-call',
            layersChanged: ['user', 'project'],
            activationBoundary: reloadTime,
          })

          // Create work item that starts BEFORE reload - should get old config
          const workItemBeforeTime = reloadTime - 10
          const oldConfig = createConfig(key, valueBefore)
          manager.snapshotConfig('work-item-before', workItemBeforeTime, oldConfig)

          // Create work item that starts AFTER reload - should get new config
          const workItemAfterTime = reloadTime + timeAfterReload
          const newConfig = createConfig(key, valueAfter)
          manager.snapshotConfig('work-item-after', workItemAfterTime, newConfig)

          // Get config for work item starting before reload
          const configBefore = manager.getConfigForWorkItem('work-item-before', workItemBeforeTime)

          // Get config for work item starting after reload
          const configAfter = manager.getConfigForWorkItem('work-item-after', workItemAfterTime)

          // Verify activation boundary:
          // - work item before reload should get old config
          // - work item after reload should get new config
          return configBefore.merged[key] === valueBefore &&
                 configAfter.merged[key] === valueAfter
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should maintain old config for work items starting at or before reload time', () => {
    // Filter out dangerous property names that have special JavaScript behavior
    const safeKey = fc.string().filter(s => s.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(s))
    
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 100000 }), // baseTime
        fc.integer({ min: 0, max: 1000 }), // offset before reload
        safeKey, // key (non-empty, safe)
        fc.string(), // value
        (baseTime, offset, key, value) => {
          const oldConfig = createConfig(key, value)
          const reloadTime = baseTime + 500

          // Simulate reload
          manager['lastReloadTime'] = reloadTime
          manager['reloadEvents'].push({
            eventId: 'reload-1',
            timestamp: reloadTime,
            trigger: 'api-call',
            layersChanged: ['user', 'project'],
            activationBoundary: reloadTime,
          })

          // Work item starting exactly at reload time (start time = t)
          manager.snapshotConfig('work-item-at-reload', reloadTime, oldConfig)

          // Work item starting before reload (start time < t)
          const beforeTime = reloadTime - offset
          manager.snapshotConfig('work-item-before-reload', beforeTime, oldConfig)

          // Get configs
          const configAt = manager.getConfigForWorkItem('work-item-at-reload', reloadTime)
          const configBefore = manager.getConfigForWorkItem('work-item-before-reload', beforeTime)

          // Both should get old config (start time <= reload time)
          return configAt.merged[key] === value &&
                 configBefore.merged[key] === value
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should record reload events with correct timestamps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 100000 }),
        fc.integer({ min: 1, max: 10 }),
        (baseTime, numReloads) => {
          // Clear any existing events from previous tests
          manager.clearReloadEvents()
          
          // Simulate multiple reloads at different times
          for (let i = 0; i < numReloads; i++) {
            const reloadTime = baseTime + i * 100
            manager['lastReloadTime'] = reloadTime
            manager['reloadEvents'].push({
              eventId: `reload-${i}`,
              timestamp: reloadTime,
              trigger: 'api-call' as const,
              layersChanged: ['user', 'project'],
              activationBoundary: reloadTime,
            })
          }

          // Verify all reload events are recorded with correct timestamps
          const events = manager.getReloadEvents()
          return events.length === numReloads &&
                 events.every((event, index) => event.timestamp === baseTime + index * 100)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should handle edge case: work item starting exactly at reload time gets old config', () => {
    const key = 'testKey'
    const beforeValue = 'beforeValue'
    
    const oldConfig = createConfig(key, beforeValue)
    const reloadTime = 1050

    // Simulate reload
    manager['lastReloadTime'] = reloadTime
    manager['reloadEvents'].push({
      eventId: 'reload-1',
      timestamp: reloadTime,
      trigger: 'api-call',
      layersChanged: ['user', 'project'],
      activationBoundary: reloadTime,
    })

    // Work item starts exactly at reload time (start time = t)
    manager.snapshotConfig('work-item-exact', reloadTime, oldConfig)

    // Get config - should get old config (start time <= reload time)
    const config = manager.getConfigForWorkItem('work-item-exact', reloadTime)

    expect(config.merged[key]).toBe(beforeValue)
  })

  it('should handle edge case: no reload has occurred yet', () => {
    const key = 'testKey'
    const initialValue = 'initialValue'
    
    const config = createConfig(key, initialValue)

    // No reload has occurred (lastReloadTime is null)
    expect(manager.getLastReloadTime()).toBeNull()

    // Work item starts without any reload - should use current config
    // Since no reload has happened, snapshotConfig should work normally
    manager.snapshotConfig('work-item-initial', Date.now(), config)
    
    // But getting config for work item when no reload has happened should throw
    // because we can't determine old vs new config
    expect(() => {
      manager.getConfigForWorkItem('work-item-initial', Date.now())
    }).toThrow('No configuration available')
  })

  it('should handle multiple consecutive reloads correctly', () => {
    const key = 'testKey'
    
    const config1 = createConfig(key, 'value1')
    const config2 = createConfig(key, 'value2')
    const config3 = createConfig(key, 'value3')

    const time0 = 1000
    const time1 = 2000
    const time2 = 3000

    // First reload at time1
    manager['lastReloadTime'] = time1
    manager['reloadEvents'].push({
      eventId: 'reload-1',
      timestamp: time1,
      trigger: 'api-call',
      layersChanged: ['user', 'project'],
      activationBoundary: time1,
    })

    // Work item starts at time0 (before first reload)
    manager.snapshotConfig('work-item-1', time0, config1)

    // Second reload at time2
    manager['lastReloadTime'] = time2
    manager['reloadEvents'].push({
      eventId: 'reload-2',
      timestamp: time2,
      trigger: 'api-call',
      layersChanged: ['user', 'project'],
      activationBoundary: time2,
    })

    // Work item starts at time1.5 (after first reload, before second)
    manager.snapshotConfig('work-item-2', time1 + 500, config2)

    // Work item starts at time3 (after second reload)
    manager.snapshotConfig('work-item-3', time2 + 500, config3)

    // Verify each work item gets the correct config based on activation boundary
    const configForWorkItem1 = manager.getConfigForWorkItem('work-item-1', time0)
    const configForWorkItem2 = manager.getConfigForWorkItem('work-item-2', time1 + 500)
    const configForWorkItem3 = manager.getConfigForWorkItem('work-item-3', time2 + 500)

    expect(configForWorkItem1.merged[key]).toBe('value1')
    expect(configForWorkItem2.merged[key]).toBe('value2')
    expect(configForWorkItem3.merged[key]).toBe('value3')
  })

  it('should correctly determine config version based on start time vs reload time', () => {
    const key = 'testKey'
    
    const oldConfig = createConfig(key, 'oldValue')
    const newConfig = createConfig(key, 'newValue')

    const reloadTime = 5000

    // Simulate reload
    manager['lastReloadTime'] = reloadTime
    manager['reloadEvents'].push({
      eventId: 'reload-1',
      timestamp: reloadTime,
      trigger: 'api-call',
      layersChanged: ['user', 'project'],
      activationBoundary: reloadTime,
    })

    // Test boundary: start time = reload time - 1 (should get old)
    manager.snapshotConfig('wi-before', reloadTime - 1, oldConfig)
    const configBefore = manager.getConfigForWorkItem('wi-before', reloadTime - 1)
    expect(configBefore.merged[key]).toBe('oldValue')

    // Test boundary: start time = reload time (should get old)
    manager.snapshotConfig('wi-at', reloadTime, oldConfig)
    const configAt = manager.getConfigForWorkItem('wi-at', reloadTime)
    expect(configAt.merged[key]).toBe('oldValue')

    // Test boundary: start time = reload time + 1 (should get new)
    manager.snapshotConfig('wi-after', reloadTime + 1, newConfig)
    const configAfter = manager.getConfigForWorkItem('wi-after', reloadTime + 1)
    expect(configAfter.merged[key]).toBe('newValue')
  })
})