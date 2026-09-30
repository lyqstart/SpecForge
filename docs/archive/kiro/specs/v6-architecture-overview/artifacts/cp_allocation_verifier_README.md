# Correctness Property Allocation Verifier

## Overview

This tool extends the original `cp_allocation_verifier.ts` (from task 4.1) to validate the correctness property allocation against existing spec directories. It reads the `correctness-property-allocation.json` file and verifies:

1. Each Property has at least 1 owner module spec
2. For each owner, the directory `.kiro/specs/{owner}/` exists
3. Reports any orphan Properties (no owners) or dangling owners (pointing to non-existent specs)

## Features

- **Dual output formats**: Human-readable and JSON (`--json` flag)
- **Comprehensive validation**: Checks for orphan properties, invalid owners, and dangling owners
- **Error reporting**: Detailed error messages with file paths
- **Exit codes**: Non-zero exit code on validation failure (except in JSON mode)

## Usage

### Basic usage (from artifacts directory):
```bash
node cp_allocation_verifier.ts
```

### With custom paths:
```bash
node cp_allocation_verifier.ts ../design.md correctness-property-allocation.json ../../
```

### JSON output:
```bash
node cp_allocation_verifier.ts --json
```

### With custom paths and JSON:
```bash
node cp_allocation_verifier.ts ../design.md correctness-property-allocation.json ../../ --json
```

## Output Examples

### Human-readable output:
```
=== Design.md Properties ===
[ ... parsed properties from design.md ... ]

=== Allocation Validation ===
❌ 9 properties with invalid owners (all owners point to non-existent specs):
   - Property 11: Configuration Merge Determinism (owners: configuration)
   - Property 15: Scope Boundary (owners: scope-gate)
   ...

❌ 10 dangling owners (point to non-existent specs):
   - Owner "configuration" referenced by properties: 11, 19, 27
   - Owner "scope-gate" referenced by properties: 15
   ...

📊 Summary:
   Total properties: 30
   Valid properties: 21
   Orphan properties: 0
   Properties with invalid owners: 9
   Dangling owners: 10
```

### JSON output (with `--json` flag):
```json
{
  "designProperties": [ ... ],
  "allocationValidation": {
    "success": false,
    "orphanProperties": [],
    "danglingOwners": [ ... ],
    "validPropertiesCount": 21,
    "invalidOwnerProperties": [ ... ],
    "totalProperties": 30,
    "errors": [ ... ]
  }
}
```

## Validation Categories

1. **Orphan Properties**: Properties with no owners (`owners` array is empty or missing)
2. **Properties with Invalid Owners**: Properties where all owners point to non-existent spec directories
3. **Valid Properties**: Properties with at least one valid owner (spec directory exists)
4. **Dangling Owners**: Individual owner references that point to non-existent spec directories

## Integration

This verifier is designed to be integrated into the V6 architecture validation pipeline (task 8.1). It can be called programmatically via its exported functions:

```typescript
import { readAllocationJson, validateAllocation, formatValidationResult } from './cp_allocation_verifier.ts';

const allocation = readAllocationJson('./correctness-property-allocation.json');
const result = validateAllocation(allocation, '../../');
const output = formatValidationResult(result, false); // or true for JSON
```

## Requirements

- **Requirements**: 30.1-30.15
- **Testing Strategy**: §2 (Correctness Property allocation validation)
- **Dependencies**: Task 1.1 (allocation JSON), Task 6 (downstream spec skeletons)

## Notes

- The verifier expects the `correctness-property-allocation.json` file to follow the schema defined in task 1.1
- Missing spec directories are expected during development (task 6 is partially completed)
- The tool exits with code 1 on validation failure (except in JSON mode which always exits with 0)
- All file paths can be customized via command-line arguments