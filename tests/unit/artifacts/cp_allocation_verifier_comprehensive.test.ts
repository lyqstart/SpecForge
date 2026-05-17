import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Import the functions from cp_allocation_verifier.ts
import {
  parseDesignMd,
  readAllocationJson,
  validateAllocation,
  formatValidationResult,
  CoverageErrorCode,
  type ParseResult,
  type AllocationData,
  type ValidationResult
} from '../../../.kiro/specs/v6-architecture-overview/artifacts/cp_allocation_verifier.ts'

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}))

describe('cp_allocation_verifier - Comprehensive Unit Tests (Task 4.5)', () => {
  const mockFs = {
    readFileSync: readFileSync as any,
    existsSync: existsSync as any
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock: specs root exists
    mockFs.existsSync.mockImplementation((path: string) => {
      // Check if this is the specs root directory
      if (path === '/specs/root' || path === 'd:\\specs\\root') {
        return true
      }
      return false
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Task 4.1: parseDesignMd - Parse design.md', () => {
    it('should parse property with Validates annotation', () => {
      const designContent = `
## Correctness Properties

#### Property 1: Single Source of Truth
*For all* 状态变更路径 P，若 P 改变 V6 的权威状态...
**Validates: Requirements 30.1, 1.1, 4.1**

#### Property 2: Event Bus Traversal
*For all* 跨层通信消息 m...
**Validates: Requirements 30.2**
`

      const result = parseDesignMd(designContent)
      
      expect(result.properties).toHaveLength(2)
      expect(result.properties[0]).toEqual({
        id: '1',
        validates: ['30.1', '1.1', '4.1']
      })
      expect(result.properties[1]).toEqual({
        id: '2',
        validates: ['30.2']
      })
      expect(result.errors).toHaveLength(0)
    })

    it('should parse property with range in Validates annotation', () => {
      const designContent = `
## Correctness Properties

#### Property 3: Hard Rule Immutability
*For all* 配置层 L...
**Validates: Requirements 30.3, 7.5-7.8**
`

      const result = parseDesignMd(designContent)
      
      expect(result.properties).toHaveLength(1)
      expect(result.properties[0]).toEqual({
        id: '3',
        validates: ['30.3', '7.5', '7.6', '7.7', '7.8']
      })
    })

    it('should handle Chinese format Validates annotation', () => {
      const designContent = `
## Correctness Properties

#### Property 4: Adapter Encapsulation
*For all* OpenCode 特有概念...
**Validates: Requirements 30.4, 8.5, 8.6, 8.7, 22.3**
`

      const result = parseDesignMd(designContent)
      
      expect(result.properties).toHaveLength(1)
      expect(result.properties[0]).toEqual({
        id: '4',
        validates: ['30.4', '8.5', '8.6', '8.7', '22.3']
      })
    })

    it('should report error for property without Validates annotation', () => {
      const designContent = `
## Correctness Properties

#### Property 5: Session Identity Stability
*For all* 身份键是 sessionId...

#### Property 6: Idempotent Recovery
*For all* 重复回放 events.jsonl...
**Validates: Requirements 30.6, 6.6, 12.2**
`

      const result = parseDesignMd(designContent)
      
      expect(result.properties).toHaveLength(1) // Only Property 6 should be parsed
      expect(result.properties[0].id).toBe('6')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Property 5 has no Validates annotation')
    })

    it('should handle multiple property sections', () => {
      const designContent = `
## Correctness Properties

### 核心架构不变式

#### Property 1: Single Source of Truth
**Validates: Requirements 30.1, 1.1, 4.1**

#### Property 2: Event Bus Traversal
**Validates: Requirements 30.2**

### 补充运行期不变式

#### Property 16: Bearer Token Enforcement
**Validates: Requirements 5.4, 5.5**

## Other Section
This should not be parsed as a property.
`

      const result = parseDesignMd(designContent)
      
      expect(result.properties).toHaveLength(3)
      expect(result.properties.map(p => p.id)).toEqual(['1', '2', '16'])
    })
  })

  describe('Task 4.2: readAllocationJson - Read allocation JSON', () => {
    it('should parse valid allocation JSON', () => {
      const mockJsonContent = JSON.stringify({
        schema_version: '1.0',
        properties: [
          {
            id: '1',
            title: 'Single Source of Truth',
            validates: ['30.1', '1.1', '4.1'],
            owners: ['daemon-core']
          }
        ]
      })

      mockFs.readFileSync.mockReturnValue(mockJsonContent)

      const result = readAllocationJson('/path/to/allocation.json')
      
      expect(result.schema_version).toBe('1.0')
      expect(result.properties).toHaveLength(1)
      expect(result.properties[0]).toEqual({
        id: '1',
        title: 'Single Source of Truth',
        validates: ['30.1', '1.1', '4.1'],
        owners: ['daemon-core']
      })
    })

    it('should throw error for invalid JSON', () => {
      mockFs.readFileSync.mockReturnValue('invalid json')

      expect(() => {
        readAllocationJson('/path/to/allocation.json')
      }).toThrow('Failed to read or parse allocation JSON')
    })

    it('should throw error for missing required fields', () => {
      const mockJsonContent = JSON.stringify({
        // Missing schema_version
        properties: []
      })

      mockFs.readFileSync.mockReturnValue(mockJsonContent)

      expect(() => {
        readAllocationJson('/path/to/allocation.json')
      }).toThrow('Invalid allocation JSON: missing required fields')
    })
  })

  describe('Task 4.3: validateAllocation - Validate allocation coverage', () => {
    describe('Test Case 1: All properties have valid owners (pass case)', () => {
      it('should return success when all properties have valid owners', () => {
        const validAllocation: AllocationData = {
          schema_version: '1.0',
          properties: [
            {
              id: '1',
              title: 'Property 1',
              validates: ['30.1'],
              owners: ['daemon-core']
            },
            {
              id: '2',
              title: 'Property 2',
              validates: ['30.2'],
              owners: ['observability']
            }
          ]
        }

        // Mock that all spec directories exist
        mockFs.existsSync.mockImplementation((path: string) => {
          if (path === '/specs/root') return true
          if (typeof path === 'string') {
            // Check if path ends with the spec directory name
            return path.includes('daemon-core') || path.includes('observability')
          }
          return false
        })

        const result = validateAllocation(validAllocation, '/specs/root')
        
        expect(result.success).toBe(true)
        expect(result.orphanProperties).toHaveLength(0)
        expect(result.danglingOwners).toHaveLength(0)
        expect(result.invalidOwnerProperties).toHaveLength(0)
        expect(result.validProperties).toHaveLength(2)
        expect(result.errors).toHaveLength(0)
        expect(result.summary.coveragePercentage).toBe(100)
      })
    })

    describe('Test Case 2: Some property lacks owner (fail case)', () => {
      it('should detect orphan property with no owners', () => {
        const allocationWithOrphan: AllocationData = {
          schema_version: '1.0',
          properties: [
            {
              id: '1',
              title: 'Property 1',
              validates: ['30.1'],
              owners: ['daemon-core'] // Valid owner
            },
            {
              id: '2',
              title: 'Property 2',
              validates: ['30.2'],
              owners: [] // Orphan - no owners
            }
          ]
        }

        // Mock that daemon-core exists
        mockFs.existsSync.mockImplementation((path: string) => {
          if (path === '/specs/root') return true
          if (typeof path === 'string') {
            return path.includes('daemon-core')
          }
          return false
        })

        const result = validateAllocation(allocationWithOrphan, '/specs/root')
        
        expect(result.success).toBe(false)
        expect(result.orphanProperties).toHaveLength(1)
        expect(result.orphanProperties[0].id).toBe('2')
        expect(result.danglingOwners).toHaveLength(0)
        expect(result.validProperties).toHaveLength(1)
        expect(result.validProperties[0].id).toBe('1')
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0].errorCode).toBe(CoverageErrorCode.E_PROPERTY_ORPHAN)
        expect(result.summary.coveragePercentage).toBe(50) // 1 out of 2 properties valid
      })
    })

    describe('Test Case 3: Some owner points to non-existent directory (fail case)', () => {
      it('should detect dangling owner pointing to non-existent spec', () => {
        const allocationWithDangling: AllocationData = {
          schema_version: '1.0',
          properties: [
            {
              id: '1',
              title: 'Property 1',
              validates: ['30.1'],
              owners: ['daemon-core'] // Valid owner
            },
            {
              id: '3',
              title: 'Property 3',
              validates: ['30.3'],
              owners: ['non-existent-spec'] // Dangling owner
            }
          ]
        }

        // Mock that only daemon-core exists
        mockFs.existsSync.mockImplementation((path: string) => {
          if (path === '/specs/root') return true
          if (typeof path === 'string') {
            return path.includes('daemon-core')
          }
          return false
        })

        const result = validateAllocation(allocationWithDangling, '/specs/root')
        
        expect(result.success).toBe(false)
        expect(result.orphanProperties).toHaveLength(0)
        expect(result.danglingOwners).toHaveLength(1)
        expect(result.danglingOwners[0].owner).toBe('non-existent-spec')
        expect(result.danglingOwners[0].propertyId).toBe('3')
        expect(result.invalidOwnerProperties).toHaveLength(1)
        expect(result.invalidOwnerProperties[0].id).toBe('3')
        expect(result.validProperties).toHaveLength(1)
        expect(result.validProperties[0].id).toBe('1')
        expect(result.errors).toHaveLength(2) // E_OWNER_DANGLING and E_PROPERTY_INVALID_OWNERS
        expect(result.errors[0].errorCode).toBe(CoverageErrorCode.E_OWNER_DANGLING)
        expect(result.errors[1].errorCode).toBe(CoverageErrorCode.E_PROPERTY_INVALID_OWNERS)
        expect(result.summary.coveragePercentage).toBe(50)
      })

      it('should handle property with mixed valid and invalid owners', () => {
        const allocationMixed: AllocationData = {
          schema_version: '1.0',
          properties: [
            {
              id: '4',
              title: 'Property 4',
              validates: ['30.4'],
              owners: ['daemon-core', 'non-existent-spec'] // One valid, one invalid
            }
          ]
        }

        // Mock that only daemon-core exists
        mockFs.existsSync.mockImplementation((path: string) => {
          if (path === '/specs/root') return true
          if (typeof path === 'string') {
            return path.includes('daemon-core')
          }
          return false
        })

        const result = validateAllocation(allocationMixed, '/specs/root')
        
        expect(result.success).toBe(false)
        expect(result.orphanProperties).toHaveLength(0)
        expect(result.danglingOwners).toHaveLength(1)
        expect(result.danglingOwners[0].owner).toBe('non-existent-spec')
        expect(result.invalidOwnerProperties).toHaveLength(0) // Not invalid because has at least one valid owner
        expect(result.validProperties).toHaveLength(1) // Still valid because has at least one valid owner
        expect(result.errors).toHaveLength(1) // Only E_OWNER_DANGLING, not E_PROPERTY_INVALID_OWNERS
        expect(result.errors[0].errorCode).toBe(CoverageErrorCode.E_OWNER_DANGLING)
        expect(result.summary.coveragePercentage).toBe(100) // Property 4 is still considered valid
      })
    })

    it('should return error when specs root directory does not exist', () => {
      const mockAllocation: AllocationData = {
        schema_version: '1.0',
        properties: [
          {
            id: '1',
            title: 'Property 1',
            validates: ['30.1'],
            owners: ['daemon-core']
          }
        ]
      }

      mockFs.existsSync.mockReturnValue(false) // Specs root doesn't exist

      const result = validateAllocation(mockAllocation, '/non-existent/specs/root')
      
      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].errorCode).toBe(CoverageErrorCode.E_SPECS_ROOT_NOT_FOUND)
      expect(result.summary.coveragePercentage).toBe(0)
    })
  })

  describe('formatValidationResult - Format output', () => {
    const mockValidationResult: ValidationResult = {
      success: false,
      orphanProperties: [
        {
          id: '2',
          title: 'Property 2',
          validates: ['30.2'],
          owners: []
        }
      ],
      danglingOwners: [
        { owner: 'non-existent-spec', propertyId: '3', propertyTitle: 'Property 3' }
      ],
      validProperties: [
        {
          id: '1',
          title: 'Property 1',
          validates: ['30.1'],
          owners: ['daemon-core']
        }
      ],
      invalidOwnerProperties: [
        {
          id: '3',
          title: 'Property 3',
          validates: ['30.3'],
          owners: ['non-existent-spec']
        }
      ],
      errors: [
        {
          errorCode: CoverageErrorCode.E_PROPERTY_ORPHAN,
          message: 'Property 2 (Property 2) has no owners',
          context: { propertyId: '2', propertyTitle: 'Property 2' }
        },
        {
          errorCode: CoverageErrorCode.E_OWNER_DANGLING,
          message: 'Owner "non-existent-spec" for Property 3 (Property 3) points to non-existent directory: /specs/root/non-existent-spec',
          context: {
            propertyId: '3',
            propertyTitle: 'Property 3',
            owner: 'non-existent-spec',
            specPath: '/specs/root/non-existent-spec'
          }
        },
        {
          errorCode: CoverageErrorCode.E_PROPERTY_INVALID_OWNERS,
          message: 'Property 3 (Property 3) has owners but all are invalid: non-existent-spec',
          context: {
            propertyId: '3',
            propertyTitle: 'Property 3',
            owner: 'non-existent-spec'
          }
        }
      ],
      summary: {
        totalProperties: 3,
        validProperties: 1,
        orphanProperties: 1,
        invalidOwnerProperties: 1,
        danglingOwners: 1,
        coveragePercentage: 33
      }
    }

    it('should format JSON output with stable error codes', () => {
      const jsonOutput = formatValidationResult(mockValidationResult, true)
      
      const parsed = JSON.parse(jsonOutput)
      
      expect(parsed.success).toBe(false)
      expect(parsed.summary.totalProperties).toBe(3)
      expect(parsed.summary.coveragePercentage).toBe(33)
      expect(parsed.errors).toHaveLength(3)
      expect(parsed.errors[0].errorCode).toBe('E_PROPERTY_ORPHAN')
      expect(parsed.errors[1].errorCode).toBe('E_OWNER_DANGLING')
      expect(parsed.errors[2].errorCode).toBe('E_PROPERTY_INVALID_OWNERS')
      expect(parsed.orphanProperties).toBeDefined()
      expect(parsed.danglingOwners).toBeDefined()
      expect(parsed.invalidOwnerProperties).toBeDefined()
    })

    it('should format human-readable output', () => {
      const humanOutput = formatValidationResult(mockValidationResult, false)
      
      expect(humanOutput).toContain('❌ 1 orphan properties (no owners):')
      expect(humanOutput).toContain('❌ 1 properties with invalid owners')
      expect(humanOutput).toContain('❌ 1 dangling owners')
      expect(humanOutput).toContain('📊 Coverage Report Summary:')
      expect(humanOutput).toContain('Total properties: 3')
      expect(humanOutput).toContain('Valid properties: 1')
      expect(humanOutput).toContain('Coverage: 33%')
    })

    it('should format success case output', () => {
      const successResult: ValidationResult = {
        success: true,
        orphanProperties: [],
        danglingOwners: [],
        validProperties: [
          {
            id: '1',
            title: 'Property 1',
            validates: ['30.1'],
            owners: ['daemon-core']
          }
        ],
        invalidOwnerProperties: [],
        errors: [],
        summary: {
          totalProperties: 1,
          validProperties: 1,
          orphanProperties: 0,
          invalidOwnerProperties: 0,
          danglingOwners: 0,
          coveragePercentage: 100
        }
      }

      const humanOutput = formatValidationResult(successResult, false)
      
      expect(humanOutput).toContain('✅ All properties have valid owners')
      expect(humanOutput).toContain('Coverage: 100%')
    })
  })

  describe('Integration: End-to-end test scenarios', () => {
    it('should handle real-world allocation data', () => {
      // This test uses mock data to simulate real-world scenarios
      const realAllocation: AllocationData = {
        schema_version: '1.0',
        properties: [
          {
            id: '1',
            title: 'Single Source of Truth',
            validates: ['30.1', '1.1', '4.1'],
            owners: ['daemon-core']
          },
          {
            id: '2',
            title: 'Event Bus Traversal',
            validates: ['30.2'],
            owners: ['daemon-core', 'observability']
          },
          {
            id: '99',
            title: 'Test Orphan Property',
            validates: ['99.1'],
            owners: [] // Orphan
          },
          {
            id: '100',
            title: 'Test Dangling Property',
            validates: ['100.1'],
            owners: ['non-existent-module'] // Dangling
          }
        ]
      }

      // Mock that real spec directories exist but non-existent-module doesn't
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/specs/root') return true
        if (typeof path === 'string') {
          return path.includes('daemon-core') || path.includes('observability')
        }
        return false
      })

      const result = validateAllocation(realAllocation, '/specs/root')
      
      // Property 1 and 2 should be valid
      // Property 99 should be orphan
      // Property 100 should have invalid owners
      
      expect(result.validProperties.map(p => p.id)).toContain('1')
      expect(result.validProperties.map(p => p.id)).toContain('2')
      expect(result.orphanProperties.map(p => p.id)).toContain('99')
      expect(result.invalidOwnerProperties.map(p => p.id)).toContain('100')
      expect(result.danglingOwners.map(d => d.owner)).toContain('non-existent-module')
    })
  })
})