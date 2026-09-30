#!/usr/bin/env node

/**
 * Correctness Property Allocation Verifier
 * 
 * This script parses design.md to extract Property N: Title and their
 * **Validates: Requirements ...** annotations, and validates allocation coverage.
 * 
 * Outputs structured coverage report with stable errorCode contracts.
 * 
 * Requirements: 30.1-30.15, REQ-25.4
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Error Codes (Stable Contract - aligned with Error Handling §"稳定契约")
// ============================================================

export const CoverageErrorCode = {
  /** Property has no owners assigned */
  E_PROPERTY_ORPHAN: "E_PROPERTY_ORPHAN",
  
  /** Owner points to non-existent spec directory */
  E_OWNER_DANGLING: "E_OWNER_DANGLING",
  
  /** Property has owners but all are invalid (point to non-existent specs) */
  E_PROPERTY_INVALID_OWNERS: "E_PROPERTY_INVALID_OWNERS",
  
  /** Failed to parse design.md file */
  E_DESIGN_PARSE_FAILED: "E_DESIGN_PARSE_FAILED",
  
  /** Failed to read or parse allocation JSON file */
  E_ALLOCATION_PARSE_FAILED: "E_ALLOCATION_PARSE_FAILED",
  
  /** Specs root directory not found */
  E_SPECS_ROOT_NOT_FOUND: "E_SPECS_ROOT_NOT_FOUND",
  
  /** General validation error */
  E_VALIDATION_ERROR: "E_VALIDATION_ERROR"
} as const;

export type CoverageErrorCode = typeof CoverageErrorCode[keyof typeof CoverageErrorCode];

// ============================================================
// Types
// ============================================================

interface PropertyInfo {
  id: string;
  validates: string[];
}

interface ParseResult {
  properties: PropertyInfo[];
  errors: string[];
}

interface AllocationProperty {
  id: string;
  title: string;
  validates: string[];
  owners: string[];
}

interface AllocationData {
  schema_version: string;
  properties: AllocationProperty[];
}

interface ValidationError {
  errorCode: CoverageErrorCode;
  message: string;
  context?: {
    propertyId?: string;
    propertyTitle?: string;
    owner?: string;
    specPath?: string;
  };
}

interface ValidationResult {
  success: boolean;
  orphanProperties: AllocationProperty[];  // Properties with no owners
  danglingOwners: { owner: string; propertyId: string; propertyTitle: string }[];  // Owners pointing to non-existent specs
  validProperties: AllocationProperty[];  // Properties with at least one valid owner
  invalidOwnerProperties: AllocationProperty[];  // Properties with owners but all are invalid
  errors: ValidationError[];
  summary: {
    totalProperties: number;
    validProperties: number;
    orphanProperties: number;
    invalidOwnerProperties: number;
    danglingOwners: number;
    coveragePercentage: number;
  };
}

/**
 * Parse design.md content to extract Property information
 */
export function parseDesignMd(content: string): ParseResult {
  const properties: PropertyInfo[] = [];
  const errors: string[] = [];
  
  // Split content into lines
  const lines = content.split('\n');
  
  // State machine for parsing
  let inPropertySection = false;
  let currentProperty: PropertyInfo | null = null;
  let propertyTitle = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if we're entering the Correctness Properties section
    if (line.includes('## Correctness Properties') || 
        line.includes('### 核心架构不变式') ||
        line.includes('### 补充运行期不变式')) {
      inPropertySection = true;
      continue;
    }
    
    // Check if we're leaving the property section (next major section)
    if (inPropertySection && line.startsWith('## ') && !line.includes('Property')) {
      inPropertySection = false;
      continue;
    }
    
    if (!inPropertySection) {
      continue;
    }
    
    // Look for Property N: Title pattern
    const propertyMatch = line.match(/#### Property (\d+): (.+)/);
    if (propertyMatch) {
      // If we have a previous property that wasn't closed properly
      if (currentProperty && currentProperty.validates.length === 0) {
        errors.push(`Property ${currentProperty.id} has no Validates annotation`);
      }
      
      const id = propertyMatch[1];
      const title = propertyMatch[2].trim();
      propertyTitle = title;
      currentProperty = { id, validates: [] };
      continue;
    }
    
    // Look for Validates annotation
    if (currentProperty && line.includes('**Validates: Requirements')) {
      // Extract requirement numbers from the Validates line
      const validatesMatch = line.match(/\*\*Validates: Requirements ([^\*]+)\*\*/);
      if (validatesMatch) {
        const requirementsText = validatesMatch[1];
        // Parse requirement numbers (can be like "30.1, 1.1, 4.1" or "30.1-30.15")
        const requirementNumbers = parseRequirementNumbers(requirementsText);
        currentProperty.validates = requirementNumbers;
        
        // Add the property to our list
        properties.push(currentProperty);
        currentProperty = null;
        propertyTitle = '';
      } else {
        errors.push(`Invalid Validates format for Property ${currentProperty.id}: ${line}`);
      }
      continue;
    }
    
    // Also check for Chinese format: **Validates: Requirements 30.1, 1.1, 4.1**
    if (currentProperty && line.includes('**Validates: Requirements') && line.includes('**')) {
      const chineseMatch = line.match(/\*\*Validates: Requirements ([^\*]+)\*\*/);
      if (chineseMatch) {
        const requirementsText = chineseMatch[1];
        const requirementNumbers = parseRequirementNumbers(requirementsText);
        currentProperty.validates = requirementNumbers;
        
        properties.push(currentProperty);
        currentProperty = null;
        propertyTitle = '';
      }
    }
  }
  
  // Check for any dangling property at the end
  if (currentProperty) {
    if (currentProperty.validates.length === 0) {
      errors.push(`Property ${currentProperty.id} has no Validates annotation`);
    } else {
      properties.push(currentProperty);
    }
  }
  
  return { properties, errors };
}

/**
 * Parse requirement numbers from text like "30.1, 1.1, 4.1" or "30.1-30.15"
 */
function parseRequirementNumbers(text: string): string[] {
  const result: string[] = [];
  const parts = text.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Check for range like "30.1-30.15"
    const rangeMatch = trimmed.match(/^(\d+\.\d+)-(\d+\.\d+)$/);
    if (rangeMatch) {
      const start = rangeMatch[1];
      const end = rangeMatch[2];
      
      // Parse start and end numbers
      const startParts = start.split('.');
      const endParts = end.split('.');
      
      if (startParts.length === 2 && endParts.length === 2) {
        const startMajor = parseInt(startParts[0]);
        const startMinor = parseInt(startParts[1]);
        const endMajor = parseInt(endParts[0]);
        const endMinor = parseInt(endParts[1]);
        
        // Only handle ranges within the same major number
        if (startMajor === endMajor) {
          for (let minor = startMinor; minor <= endMinor; minor++) {
            result.push(`${startMajor}.${minor}`);
          }
        } else {
          // If major differs, just add both as individual
          result.push(start);
          result.push(end);
        }
      } else {
        result.push(trimmed);
      }
    } else {
      result.push(trimmed);
    }
  }
  
  return result;
}

/**
 * Read and parse the allocation JSON file
 */
export function readAllocationJson(filePath: string): AllocationData {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as AllocationData;
    
    // Validate required fields
    if (!data.schema_version || !data.properties) {
      throw new Error('Invalid allocation JSON: missing required fields (schema_version or properties)');
    }
    
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to read or parse allocation JSON at ${filePath}: ${errorMessage}`);
  }
}

/**
 * Validate allocation data against existing spec directories
 */
export function validateAllocation(allocation: AllocationData, specsRoot: string): ValidationResult {
  const orphanProperties: AllocationProperty[] = [];
  const danglingOwners: { owner: string; propertyId: string; propertyTitle: string }[] = [];
  const validProperties: AllocationProperty[] = [];
  const invalidOwnerProperties: AllocationProperty[] = [];
  const errors: ValidationError[] = [];
  
  // Check if specs root exists
  if (!existsSync(specsRoot)) {
    errors.push({
      errorCode: CoverageErrorCode.E_SPECS_ROOT_NOT_FOUND,
      message: `Specs root directory not found: ${specsRoot}`,
      context: { specPath: specsRoot }
    });
    
    return {
      success: false,
      orphanProperties,
      danglingOwners,
      validProperties,
      invalidOwnerProperties,
      errors,
      summary: {
        totalProperties: allocation.properties.length,
        validProperties: 0,
        orphanProperties: 0,
        invalidOwnerProperties: 0,
        danglingOwners: 0,
        coveragePercentage: 0
      }
    };
  }
  
  for (const property of allocation.properties) {
    // Check if property has at least one owner
    if (!property.owners || property.owners.length === 0) {
      orphanProperties.push(property);
      errors.push({
        errorCode: CoverageErrorCode.E_PROPERTY_ORPHAN,
        message: `Property ${property.id} (${property.title}) has no owners`,
        context: {
          propertyId: property.id,
          propertyTitle: property.title
        }
      });
      continue;
    }
    
    let hasValidOwner = false;
    let hasInvalidOwner = false;
    const invalidOwners: string[] = [];
    
    // Check each owner directory
    for (const owner of property.owners) {
      const ownerDir = join(specsRoot, owner);
      if (existsSync(ownerDir)) {
        hasValidOwner = true;
      } else {
        hasInvalidOwner = true;
        invalidOwners.push(owner);
        danglingOwners.push({ 
          owner, 
          propertyId: property.id,
          propertyTitle: property.title
        });
        errors.push({
          errorCode: CoverageErrorCode.E_OWNER_DANGLING,
          message: `Owner "${owner}" for Property ${property.id} (${property.title}) points to non-existent directory: ${ownerDir}`,
          context: {
            propertyId: property.id,
            propertyTitle: property.title,
            owner,
            specPath: ownerDir
          }
        });
      }
    }
    
    if (hasValidOwner) {
      // Property has at least one valid owner
      validProperties.push(property);
    } else if (hasInvalidOwner) {
      // Property has owners but all are invalid
      invalidOwnerProperties.push(property);
      errors.push({
        errorCode: CoverageErrorCode.E_PROPERTY_INVALID_OWNERS,
        message: `Property ${property.id} (${property.title}) has owners but all are invalid: ${invalidOwners.join(', ')}`,
        context: {
          propertyId: property.id,
          propertyTitle: property.title,
          owner: invalidOwners.join(', ')
        }
      });
    }
  }
  
  const totalProperties = allocation.properties.length;
  const coveragePercentage = totalProperties > 0 
    ? Math.round((validProperties.length / totalProperties) * 100) 
    : 0;
  
  const success = orphanProperties.length === 0 && 
                  invalidOwnerProperties.length === 0 && 
                  danglingOwners.length === 0;
  
  return {
    success,
    orphanProperties,
    danglingOwners,
    validProperties,
    invalidOwnerProperties,
    errors,
    summary: {
      totalProperties,
      validProperties: validProperties.length,
      orphanProperties: orphanProperties.length,
      invalidOwnerProperties: invalidOwnerProperties.length,
      danglingOwners: danglingOwners.length,
      coveragePercentage
    }
  };
}

/**
 * Format validation results for output
 */
export function formatValidationResult(result: ValidationResult, jsonOutput: boolean = false): string {
  if (jsonOutput) {
    // Structured JSON output with stable errorCode contracts
    const jsonResult: any = {
      success: result.success,
      summary: result.summary,
      errors: result.errors.map(err => ({
        errorCode: err.errorCode,
        message: err.message,
        context: err.context
      }))
    };
    
    // Only include detailed arrays if there are issues (to keep output clean)
    if (result.orphanProperties.length > 0) {
      jsonResult.orphanProperties = result.orphanProperties.map(p => ({ 
        id: p.id, 
        title: p.title,
        validates: p.validates
      }));
    }
    
    if (result.danglingOwners.length > 0) {
      jsonResult.danglingOwners = result.danglingOwners.map(d => ({
        owner: d.owner,
        propertyId: d.propertyId,
        propertyTitle: d.propertyTitle
      }));
    }
    
    if (result.invalidOwnerProperties.length > 0) {
      jsonResult.invalidOwnerProperties = result.invalidOwnerProperties.map(p => ({ 
        id: p.id, 
        title: p.title,
        validates: p.validates,
        owners: p.owners
      }));
    }
    
    if (result.validProperties.length > 0) {
      jsonResult.validPropertiesCount = result.validProperties.length;
    }
    
    return JSON.stringify(jsonResult, null, 2);
  } else {
    // Human-readable output
    let output = '';
    
    if (result.success) {
      output += '✅ All properties have valid owners\n';
    } else {
      // Group errors by type for better readability
      const orphanErrors = result.errors.filter(e => e.errorCode === CoverageErrorCode.E_PROPERTY_ORPHAN);
      const danglingErrors = result.errors.filter(e => e.errorCode === CoverageErrorCode.E_OWNER_DANGLING);
      const invalidOwnerErrors = result.errors.filter(e => e.errorCode === CoverageErrorCode.E_PROPERTY_INVALID_OWNERS);
      const otherErrors = result.errors.filter(e => ![
        CoverageErrorCode.E_PROPERTY_ORPHAN,
        CoverageErrorCode.E_OWNER_DANGLING,
        CoverageErrorCode.E_PROPERTY_INVALID_OWNERS
      ].includes(e.errorCode));
      
      if (orphanErrors.length > 0) {
        output += `❌ ${orphanErrors.length} orphan properties (no owners):\n`;
        for (const error of orphanErrors) {
          output += `   - Property ${error.context?.propertyId}: ${error.context?.propertyTitle}\n`;
        }
      }
      
      if (invalidOwnerErrors.length > 0) {
        output += `❌ ${invalidOwnerErrors.length} properties with invalid owners (all owners point to non-existent specs):\n`;
        for (const error of invalidOwnerErrors) {
          output += `   - Property ${error.context?.propertyId}: ${error.context?.propertyTitle} (owners: ${error.context?.owner})\n`;
        }
      }
      
      if (danglingErrors.length > 0) {
        output += `❌ ${danglingErrors.length} dangling owners (point to non-existent specs):\n`;
        const grouped = result.danglingOwners.reduce((acc, { owner, propertyId, propertyTitle }) => {
          if (!acc[owner]) acc[owner] = [];
          acc[owner].push(`${propertyId}: ${propertyTitle}`);
          return acc;
        }, {} as Record<string, string[]>);
        
        for (const [owner, propertyRefs] of Object.entries(grouped)) {
          output += `   - Owner "${owner}" referenced by properties: ${propertyRefs.join(', ')}\n`;
        }
      }
      
      if (otherErrors.length > 0) {
        output += `❌ ${otherErrors.length} other errors:\n`;
        for (const error of otherErrors) {
          output += `   - [${error.errorCode}] ${error.message}\n`;
        }
      }
    }
    
    output += `\n📊 Coverage Report Summary:\n`;
    output += `   Total properties: ${result.summary.totalProperties}\n`;
    output += `   Valid properties: ${result.summary.validProperties}\n`;
    output += `   Orphan properties: ${result.summary.orphanProperties}\n`;
    output += `   Properties with invalid owners: ${result.summary.invalidOwnerProperties}\n`;
    output += `   Dangling owners: ${result.summary.danglingOwners}\n`;
    output += `   Coverage: ${result.summary.coveragePercentage}%\n`;
    
    return output;
  }
}

/**
 * Main function to run the parser and coverage report generator
 */
export function main(): void {
  const args = process.argv.slice(2);
  
  // Parse flags
  const jsonOutput = args.includes('--json');
  const filteredArgs = args.filter(arg => arg !== '--json');
  
  const designMdPath = filteredArgs[0] || join(__dirname, '..', 'design.md');
  const allocationJsonPath = filteredArgs[1] || join(__dirname, 'correctness-property-allocation.json');
  const specsRoot = filteredArgs[2] || join(dirname(__dirname), '..');
  
  try {
    // Parse design.md (original functionality)
    const designContent = readFileSync(designMdPath, 'utf-8');
    const parseResult = parseDesignMd(designContent);
    
    if (parseResult.errors.length > 0) {
      const parseErrors: ValidationError[] = parseResult.errors.map(error => ({
        errorCode: CoverageErrorCode.E_DESIGN_PARSE_FAILED,
        message: error
      }));
      
      if (jsonOutput) {
        console.log(JSON.stringify({
          success: false,
          errors: parseErrors
        }, null, 2));
      } else {
        console.error('Errors found during design.md parsing:');
        parseResult.errors.forEach(error => console.error(`  - ${error}`));
      }
      process.exit(1);
    }
    
    // Read and validate allocation JSON (coverage report functionality)
    const allocation = readAllocationJson(allocationJsonPath);
    const validationResult = validateAllocation(allocation, specsRoot);
    
    // Output results
    if (jsonOutput) {
      // Structured JSON output with stable errorCode contracts
      const output = {
        success: validationResult.success,
        summary: validationResult.summary,
        errors: validationResult.errors,
        details: {
          designProperties: parseResult.properties,
          allocationValidation: {
            orphanProperties: validationResult.orphanProperties.map(p => ({ 
              id: p.id, 
              title: p.title,
              validates: p.validates
            })),
            danglingOwners: validationResult.danglingOwners,
            validProperties: validationResult.validProperties.map(p => ({ 
              id: p.id, 
              title: p.title,
              validates: p.validates,
              owners: p.owners
            })),
            invalidOwnerProperties: validationResult.invalidOwnerProperties.map(p => ({ 
              id: p.id, 
              title: p.title,
              validates: p.validates,
              owners: p.owners
            }))
          }
        }
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Human-readable output
      console.log('=== Design.md Properties ===');
      console.log(JSON.stringify(parseResult.properties, null, 2));
      
      console.log('\n=== Coverage Report ===');
      console.log(formatValidationResult(validationResult, false));
    }
    
    // Exit with appropriate exit code based on validation result
    // 0 = success (all properties have valid owners)
    // 1 = failure (orphan properties, dangling owners, or other validation errors)
    if (!validationResult.success) {
      process.exit(1);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const validationError: ValidationError = {
      errorCode: CoverageErrorCode.E_VALIDATION_ERROR,
      message: errorMessage
    };
    
    if (jsonOutput) {
      console.log(JSON.stringify({
        success: false,
        errors: [validationError]
      }, null, 2));
    } else {
      console.error(`Error: ${errorMessage}`);
    }
    process.exit(1);
  }
}

// Run if called directly
// Check if this module is being run directly (not imported)
if (import.meta.main) {
  main();
}

