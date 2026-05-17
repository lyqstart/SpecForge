/**
 * Property 11: Configuration Merge Determinism Test
 * 
 * **Validates: Requirements 1.2, Property 11**
 * 
 * Feature: configuration, Property 11: Configuration Merge Determinism
 * Derived-From: v6-architecture-overview Property 11
 * 
 * Property 11 states: For all four-layer configuration inputs (builtin, user, project, runtime)
 * with fixed merge order, merge(builtin, user, project, runtime) result depends only on input
 * values and order, not on merge timing, machine, or caller. In other words:
 * "Same inputs always produce same merged output."
 * 
 * This test verifies:
 * 1. Idempotence: merge(layers) == merge(layers) (same result on repeated calls)
 * 2. Environment independence: merge produces identical output across multiple runs
 * 3. Deterministic timestamp: mergedAt is always 0 (not Date.now())
 * 4. Deterministic key ordering: keys are sorted alphabetically
 * 5. Deterministic layer ordering: layers are sorted by priority regardless of input order
 * 6. Edge cases: empty layers, null values, nested objects, arrays
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { mergeConfigLayers } from '../../src/config-merge'
import { ConfigLayer } from '../../src/types'

describe('Property 11: Configuration Merge Determinism', () => {
  /**
   * Generator for configuration layer types
   */
  const layerTypeGen = fc.constantFrom<'builtin' | 'user' | 'project' | 'runtime'>(
    'builtin',
    'user',
    'project',
    'runtime',
  )

  /**
   * Generator for primitive values (strings, numbers, booleans)
   */
  const primitiveGen = fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constant(null),
  )

  /**
   * Generator for simple configuration values (primitives and arrays)
   */
  const simpleValueGen = fc.oneof(
    primitiveGen,
    fc.array(primitiveGen, { minLength: 0, maxLength: 5 }),
  )

  /**
   * Generator for nested configuration objects (up to 2 levels deep)
   */
  const nestedObjectGen: fc.Arbitrary<Record<string, unknown>> = fc.record({
    level1Key1: simpleValueGen,
    level1Key2: simpleValueGen,
    nested: fc.record({
      level2Key1: simpleValueGen,
      level2Key2: simpleValueGen,
    }),
  })

  /**
   * Generator for configuration data (mix of primitives, objects, and arrays)
   */
  const configDataGen = fc.oneof(
    fc.record({
      simpleKey: simpleValueGen,
    }),
    fc.record({
      objectKey: nestedObjectGen,
    }),
    fc.record({
      key1: simpleValueGen,
      key2: simpleValueGen,
      key3: nestedObjectGen,
    }),
  )

  /**
   * Generator for configuration layers
   */
  const configLayerGen = fc.record({
    type: layerTypeGen,
    timestamp: fc.constant(0),
    data: configDataGen,
  }) as fc.Arbitrary<ConfigLayer>

  /**
   * Generator for arrays of configuration layers
   */
  const configLayersGen = fc.array(configLayerGen, { minLength: 0, maxLength: 10 })

  /**
   * Test 1: Idempotence - merge(layers) == merge(layers)
   * Same inputs should always produce identical output
   */
  it('should produce identical results for same inputs (idempotence)', () => {
    fc.assert(
      fc.property(configLayersGen, (layers) => {
        // Run merge twice with same inputs
        const result1 = mergeConfigLayers(layers)
        const result2 = mergeConfigLayers(layers)

        // Results should be identical
        expect(result1.merged).toEqual(result2.merged)
        expect(result1.sources).toEqual(result2.sources)
        expect(result1.metadata.mergedAt).toBe(result2.metadata.mergedAt)
        expect(result1.metadata.schemaVersion).toBe(result2.metadata.schemaVersion)
        expect(result1.metadata.validationErrors).toEqual(result2.metadata.validationErrors)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Test 2: Environment independence - multiple runs produce identical output
   * Simulates running merge in different environments/times
   */
  it('should be deterministic across multiple runs (environment independence)', () => {
    fc.assert(
      fc.property(configLayersGen, (layers) => {
        // Run merge multiple times
        const results = []
        for (let i = 0; i < 5; i++) {
          results.push(mergeConfigLayers(layers))
        }

        // All results should be identical
        const first = results[0]
        for (let i = 1; i < results.length; i++) {
          expect(results[i].merged).toEqual(first.merged)
          expect(results[i].sources).toEqual(first.sources)
          expect(results[i].metadata.mergedAt).toBe(first.metadata.mergedAt)
        }
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Test 3: Deterministic timestamp
   * mergedAt should always be 0 (not Date.now() or other time-dependent value)
   */
  it('should use deterministic timestamp (mergedAt = 0)', () => {
    fc.assert(
      fc.property(configLayersGen, (layers) => {
        const result = mergeConfigLayers(layers)
        expect(result.metadata.mergedAt).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Test 4: Deterministic key ordering
   * Keys should be sorted alphabetically for consistent output
   */
  it('should sort keys alphabetically for deterministic output', () => {
    fc.assert(
      fc.property(configLayersGen, (layers) => {
        const result = mergeConfigLayers(layers)
        const keys = Object.keys(result.merged)
        const sortedKeys = [...keys].sort()
        expect(keys).toEqual(sortedKeys)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Test 5: Deterministic layer ordering
   * Layers should be sorted by priority regardless of input order
   */
  it('should sort layers by priority regardless of input order', () => {
    fc.assert(
      fc.property(configLayersGen, (layers) => {
        const result = mergeConfigLayers(layers)
        const layerTypes = result.layers.map((l) => l.type)
        const expectedOrder = ['builtin', 'user', 'project', 'runtime']
        
        // Check that layers are in non-decreasing order
        // (same type layers can appear consecutively)
        let lastIndex = -1
        for (const type of layerTypes) {
          const currentIndex = expectedOrder.indexOf(type)
          expect(currentIndex).toBeGreaterThanOrEqual(lastIndex)
          lastIndex = currentIndex
        }
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Test 6: Layer order independence for different layer types
   * Merge result should be same regardless of input layer order when layers have different types
   * 
   * Note: This only applies when layers have unique types. When there are multiple layers
   * of the same type, their relative order matters (later layers override earlier ones).
   */
  it('should produce same result regardless of input layer order for different layer types', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          // Generate layers with unique types to avoid same-type conflicts
          fc.array(
            fc.record({
              type: fc.constantFrom<'builtin' | 'user' | 'project' | 'runtime'>(
                'builtin',
                'user',
                'project',
                'runtime',
              ),
              timestamp: fc.constant(0),
              data: configDataGen,
            }),
            { minLength: 1, maxLength: 4, uniqueItems: true }, // Ensure unique types
          ),
          fc.integer({ min: 0, max: 100 }),
        ),
        ([layers, seed]) => {
          // Shuffle layers using seed
          const shuffled = [...layers].sort(() => (seed % 2 === 0 ? -1 : 1))

          const result1 = mergeConfigLayers(layers)
          const result2 = mergeConfigLayers(shuffled)

          // When layers have unique types, merge result should be identical
          // regardless of input order because layers are sorted by priority
          expect(result1.merged).toEqual(result2.merged)
          expect(result1.sources).toEqual(result2.sources)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Test 7: Edge case - empty layers
   * Merge of empty layers should produce empty result
   */
  it('should handle empty layers deterministically', () => {
    fc.assert(
      fc.property(fc.constant([]), (layers) => {
        const result1 = mergeConfigLayers(layers)
        const result2 = mergeConfigLayers(layers)

        expect(result1.merged).toEqual({})
        expect(result2.merged).toEqual({})
        expect(result1.merged).toEqual(result2.merged)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * Test 8: Edge case - null and undefined values
   * Null/undefined values should be handled deterministically
   */
  it('should handle null and undefined values deterministically', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: layerTypeGen,
            timestamp: fc.constant(0),
            data: fc.record({
              nullKey: fc.constant(null),
              undefinedKey: fc.constant(undefined),
              normalKey: fc.string(),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (layers) => {
          const result1 = mergeConfigLayers(layers)
          const result2 = mergeConfigLayers(layers)

          expect(result1.merged).toEqual(result2.merged)
          expect(result1.sources).toEqual(result2.sources)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Test 9: Edge case - empty objects and arrays
   * Empty objects and arrays should be handled deterministically
   */
  it('should handle empty objects and arrays deterministically', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: layerTypeGen,
            timestamp: fc.constant(0),
            data: fc.record({
              emptyObj: fc.constant({}),
              emptyArr: fc.constant([]),
              normalKey: fc.string(),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (layers) => {
          const result1 = mergeConfigLayers(layers)
          const result2 = mergeConfigLayers(layers)

          expect(result1.merged).toEqual(result2.merged)
          expect(result1.sources).toEqual(result2.sources)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Test 10: Sensitive field protection determinism
   * Sensitive field rejection should be deterministic
   */
  it('should handle sensitive field protection deterministically', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: layerTypeGen,
            timestamp: fc.constant(0),
            data: fc.record({
              apiKeys: fc.record({ openai: fc.string() }),
              normalKey: fc.string(),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (layers) => {
          const result1 = mergeConfigLayers(layers)
          const result2 = mergeConfigLayers(layers)

          // Validation errors should be identical
          expect(result1.metadata.validationErrors).toEqual(result2.metadata.validationErrors)
          expect(result1.merged).toEqual(result2.merged)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Test 11: Deep merge determinism
   * Deep merging of nested objects should be deterministic
   */
  it('should perform deep merge deterministically', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: layerTypeGen,
            timestamp: fc.constant(0),
            data: fc.record({
              config: fc.record({
                database: fc.record({
                  host: fc.string(),
                  port: fc.integer({ min: 1, max: 65535 }),
                }),
                cache: fc.record({
                  enabled: fc.boolean(),
                  ttl: fc.integer({ min: 0, max: 3600 }),
                }),
              }),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (layers) => {
          const result1 = mergeConfigLayers(layers)
          const result2 = mergeConfigLayers(layers)

          expect(result1.merged).toEqual(result2.merged)
          expect(result1.sources).toEqual(result2.sources)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Test 12: Array replacement determinism
   * Arrays should be replaced (not concatenated) deterministically
   */
  it('should replace arrays deterministically (not concatenate)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: layerTypeGen,
            timestamp: fc.constant(0),
            data: fc.record({
              items: fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (layers) => {
          const result1 = mergeConfigLayers(layers)
          const result2 = mergeConfigLayers(layers)

          // Main assertion: determinism
          expect(result1.merged).toEqual(result2.merged)
          
          // Verify arrays are not concatenated by checking that the result
          // matches the highest-priority layer that defines items
          const layerOrder: ConfigLayerType[] = ['builtin', 'user', 'project', 'runtime']
          let expectedArray: unknown[] | undefined
          
          // Find the highest-priority layer that defines items
          for (const type of layerOrder) {
            // Find the LAST layer of this type (since multiple layers of same type can exist)
            const layersOfType = layers.filter((l) => l.type === type)
            if (layersOfType.length > 0) {
              const lastOfType = layersOfType[layersOfType.length - 1]
              if (lastOfType.data.items !== undefined) {
                expectedArray = lastOfType.data.items as unknown[]
              }
            }
          }
          
          if (expectedArray !== undefined) {
            expect(result1.merged.items).toEqual(expectedArray)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
