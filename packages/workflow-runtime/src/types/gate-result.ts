/**
 * Gate Result Interface
 * Represents the result of a Gate execution
 * 
 * This interface defines the structure of results returned by Gate.check() methods.
 * It includes execution status, error information, and optional metadata.
 * 
 * **Validates: Requirements 2.2** - Gate Execution Determinism
 */

/**
 * Gate execution result
 * 
 * Represents the outcome of executing a Gate's check function.
 * The result includes:
 * - Execution status (passed/failed)
 * - Optional reason for failure
 * - Optional detailed metadata about the execution
 * - Schema version for forward compatibility
 * 
 * @example
 * ```typescript
 * const result: GateResult = {
 *   schema_version: "1.0",
 *   passed: true,
 *   reason: "All requirements validated",
 *   details: {
 *     checkedItems: 5,
 *     failedItems: 0,
 *     timestamp: "2024-01-15T10:30:00Z"
 *   }
 * };
 * ```
 */
export interface GateResult {
  /** Schema version for forward compatibility (currently "1.0") */
  schema_version: "1.0";
  
  /** Whether the Gate check passed (true) or failed (false) */
  passed: boolean;
  
  /** Optional reason for the result, especially useful for failures */
  reason?: string;
  
  /** Optional detailed metadata about the execution result */
  details?: Record<string, unknown>;
}