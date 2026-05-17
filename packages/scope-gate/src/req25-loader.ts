/**
 * REQ-25 Loader - Automatically loads REQ-25 from parent specification
 * 
 * This module handles loading and parsing the REQ-25 capability definitions
 * from the parent specification (v6-architecture-overview) and integrating
 * them with the ScopeRegistry.
 * 
 * Requirements: 1.1, 2.1, 2.2 (Parent Spec Integration)
 */

import { readFileSync, existsSync, watch, FSWatcher } from 'fs';
import { resolve } from 'path';
import type { CapabilityDefinition, Req25Data, ValidationResult } from './types.js';
import { Req25Parser } from './req25-parser.js';

/**
 * Validation result for parent spec artifacts
 */
export interface ArtifactValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    hasCorrectnessProperties: boolean;
    hasScopeBoundaryVerifier: boolean;
    hasPropertyAllocation: boolean;
    hasDevelopmentRoadmap: boolean;
  };
}

/**
 * Result of loading parent spec REQ-25
 */
export interface LoadResult {
  success: boolean;
  capabilities: CapabilityDefinition[];
  metadata?: {
    p0Count: number;
    p1Count: number;
    p2Count: number;
    sourcePath: string;
    lastUpdated: Date;
    sourceHash: string;
  };
  error?: string;
}

/**
 * Result of change detection
 */
export interface ChangeDetectionResult {
  hasChanged: boolean;
  previousHash: string | null;
  currentHash: string | null;
  timestamp: Date;
  error?: string;
  details?: {
    p0CountChanged: boolean;
    p1CountChanged: boolean;
    p2CountChanged: boolean;
    previousP0Count: number;
    currentP0Count: number;
    previousP1Count: number;
    currentP1Count: number;
    previousP2Count: number;
    currentP2Count: number;
    capabilityDefinitionsChanged: boolean;
    addedCapabilities: string[];
    removedCapabilities: string[];
  };
}

/**
 * Detailed change information for a single capability
 */
export interface CapabilityChangeInfo {
  capabilityId: string;
  changeType: 'added' | 'removed' | 'modified';
  previousDefinition?: CapabilityDefinition;
  currentDefinition?: CapabilityDefinition;
  scopeTagChanged?: boolean;
  displayNameChanged?: boolean;
  descriptionChanged?: boolean;
}

/**
 * Full change details returned by detailed detection
 */
export interface DetailedChangeDetection {
  hasChanged: boolean;
  timestamp: Date;
  hashChanged: boolean;
  p0Count: { previous: number; current: number; changed: boolean };
  p1Count: { previous: number; current: number; changed: boolean };
  p2Count: { previous: number; current: number; changed: boolean };
  capabilityChanges: CapabilityChangeInfo[];
  previousHash: string | null;
  currentHash: string | null;
}

/**
 * Callback type for change notifications
 */
export type ChangeCallback = (result: ChangeDetectionResult) => void | Promise<void>;

/**
 * Watcher options for passive change detection
 */
export interface WatcherOptions {
  intervalMs?: number;      // Polling interval (for polling mode)
  debounceMs?: number;      // Debounce time for file system events
  persistent?: boolean;     // Keep watching after first change
  includeCapabilityDetails?: boolean; // Include detailed capability changes
}

/**
 * Active change detector interface
 */
export interface ActiveChangeDetector {
  start(): void;
  stop(): void;
  isWatching(): boolean;
  getLastResult(): ChangeDetectionResult | null;
}

/**
 * REQ-25 Loader
 * 
 * Automatically loads REQ-25 capability definitions from parent specification
 * and provides them for registration with ScopeRegistry.
 */
export class Req25Loader {
  private parser: Req25Parser;
  private cachedData: Req25Data | null = null;
  private cacheTimestamp: Date | null = null;
  
  // Cache TTL in milliseconds (5 minutes)
  private static readonly CACHE_TTL = 5 * 60 * 1000;
  
  // Change detection state
  private previousCapabilities: Map<string, CapabilityDefinition> = new Map();
  private watchers: FSWatcher[] = [];
  private activeDetectors: ActiveChangeDetector[] = [];
  private changeCallbacks: ChangeCallback[] = [];
  private watcherOptions: WatcherOptions = {
    intervalMs: 5000,      // Default 5 second polling
    debounceMs: 500,       // Default 500ms debounce
    persistent: true,
    includeCapabilityDetails: true
  };

  constructor() {
    this.parser = new Req25Parser();
  }

  /**
   * Load REQ-25 from parent specification
   * 
   * @param parentSpecPath - Path to the parent spec directory (e.g., .kiro/specs/v6-architecture-overview)
   * @param forceRefresh - If true, bypass cache and reload
   * @returns LoadResult with parsed capabilities
   */
  loadFromParentSpec(parentSpecPath: string, forceRefresh: boolean = false): LoadResult {
    // Check cache
    if (!forceRefresh && this.cachedData && this.cacheTimestamp) {
      const cacheAge = Date.now() - this.cacheTimestamp.getTime();
      if (cacheAge < Req25Loader.CACHE_TTL) {
        return this.convertToLoadResult(this.cachedData, parentSpecPath);
      }
    }

    // Resolve the requirements.md path
    const requirementsPath = resolve(parentSpecPath, 'requirements.md');
    
    if (!existsSync(requirementsPath)) {
      return {
        success: false,
        capabilities: [],
        error: `Parent spec requirements.md not found at: ${requirementsPath}`
      };
    }

    try {
      // Read and parse the requirements.md
      const content = readFileSync(requirementsPath, 'utf-8');
      const parsedData = this.parser.parseReq25(content);
      
      // Update cache
      this.cachedData = parsedData;
      this.cacheTimestamp = new Date();

      return this.convertToLoadResult(parsedData, requirementsPath);
    } catch (error) {
      return {
        success: false,
        capabilities: [],
        error: error instanceof Error ? error.message : 'Unknown error loading REQ-25'
      };
    }
  }

  /**
   * Convert internal Req25Data to LoadResult format
   */
  private convertToLoadResult(data: Req25Data, sourcePath: string): LoadResult {
    const allCapabilities = [...data.p0, ...data.p1, ...data.p2];
    
    return {
      success: true,
      capabilities: allCapabilities,
      metadata: {
        p0Count: data.p0.length,
        p1Count: data.p1.length,
        p2Count: data.p2.length,
        sourcePath,
        lastUpdated: data.lastUpdated,
        sourceHash: data.sourceHash
      }
    };
  }

  /**
   * Get the default parent spec path
   * 
   * Resolves the parent spec path relative to the scope-gate package
   */
  static getDefaultParentSpecPath(): string {
    // Get the path to the parent spec - use environment variable or calculate
    // First try environment variable
    const envPath = process.env.SCOPE_GATE_PARENT_SPEC;
    if (envPath) {
      return envPath;
    }
    
    // Calculate from current working directory if we're in the scope-gate package
    const scopeGatePath = process.cwd();
    
    // Check if we're in packages/scope-gate directory
    if (scopeGatePath.endsWith('packages/scope-gate') || scopeGatePath.endsWith('packages\\scope-gate')) {
      const repoRoot = resolve(scopeGatePath, '..', '..');
      return resolve(repoRoot, '.kiro', 'specs', 'v6-architecture-overview');
    }
    
    // Check if we're in the repo root
    const parentSpecPath = resolve(scopeGatePath, '.kiro', 'specs', 'v6-architecture-overview');
    if (existsSync(parentSpecPath)) {
      return parentSpecPath;
    }
    
    // Default fallback - assume we're in repo root
    return resolve('.kiro', 'specs', 'v6-architecture-overview');
  }

  /**
   * Load REQ-25 using the default parent spec path
   * 
   * @param forceRefresh - If true, bypass cache and reload
   * @returns LoadResult with parsed capabilities
   */
  load(forceRefresh: boolean = false): LoadResult {
    const parentSpecPath = Req25Loader.getDefaultParentSpecPath();
    return this.loadFromParentSpec(parentSpecPath, forceRefresh);
  }

  /**
   * Get all capabilities grouped by scope tag
   * 
   * @param parentSpecPath - Path to parent spec (optional, uses default if not provided)
   * @returns Object with p0, p1, p2 arrays
   */
  getCapabilitiesByScope(parentSpecPath?: string): { p0: CapabilityDefinition[]; p1: CapabilityDefinition[]; p2: CapabilityDefinition[] } {
    const path = parentSpecPath || Req25Loader.getDefaultParentSpecPath();
    const result = this.loadFromParentSpec(path);
    
    if (!result.success) {
      return { p0: [], p1: [], p2: [] };
    }

    return {
      p0: result.capabilities.filter(c => c.scopeTag === 'p0'),
      p1: result.capabilities.filter(c => c.scopeTag === 'p1'),
      p2: result.capabilities.filter(c => c.scopeTag === 'p2')
    };
  }

  /**
   * Check if parent spec REQ-25 has changed since last load
   * 
   * @param parentSpecPath - Path to parent spec
   * @returns true if REQ-25 has changed
   */
  hasChanged(parentSpecPath: string): boolean {
    if (!this.cachedData) {
      return true;
    }

    const requirementsPath = resolve(parentSpecPath, 'requirements.md');
    if (!existsSync(requirementsPath)) {
      return false;
    }

    try {
      const content = readFileSync(requirementsPath, 'utf-8');
      const newData = this.parser.parseReq25(content);
      return newData.sourceHash !== this.cachedData.sourceHash;
    } catch {
      return false;
    }
  }

  /**
   * Get cached data if available
   */
  getCachedData(): Req25Data | null {
    return this.cachedData;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cachedData = null;
    this.cacheTimestamp = null;
  }

  /**
   * Get parser instance for testing
   */
  getParser(): Req25Parser {
    return this.parser;
  }

  /**
   * Validate parent spec artifacts
   * 
   * Verifies that the parent spec has the necessary artifacts
   * for scope boundary enforcement.
   * 
   * @param parentSpecPath - Path to the parent spec directory
   * @returns ArtifactValidationResult
   */
  validateParentSpecArtifacts(parentSpecPath: string): ArtifactValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details = {
      hasCorrectnessProperties: false,
      hasScopeBoundaryVerifier: false,
      hasPropertyAllocation: false,
      hasDevelopmentRoadmap: false
    };

    // Check that parent spec path exists
    if (!existsSync(parentSpecPath)) {
      errors.push(`Parent spec path does not exist: ${parentSpecPath}`);
      return {
        isValid: false,
        errors,
        warnings,
        details
      };
    }

    // Check for requirements.md (essential)
    const requirementsPath = resolve(parentSpecPath, 'requirements.md');
    if (!existsSync(requirementsPath)) {
      errors.push('Parent spec requirements.md not found');
    }

    // Check for artifacts directory
    const artifactsPath = resolve(parentSpecPath, 'artifacts');
    if (!existsSync(artifactsPath)) {
      warnings.push('Parent spec artifacts directory not found');
    } else {
      // Check for specific artifacts
      const correctnessPropsPath = resolve(artifactsPath, 'correctness-property-allocation.json');
      details.hasCorrectnessProperties = existsSync(correctnessPropsPath);
      if (!details.hasCorrectnessProperties) {
        warnings.push('correctness-property-allocation.json not found in artifacts');
      }

      const scopeBoundaryVerifierPath = resolve(artifactsPath, 'scope_boundary_verifier.ts');
      details.hasScopeBoundaryVerifier = existsSync(scopeBoundaryVerifierPath);
      if (!details.hasScopeBoundaryVerifier) {
        warnings.push('scope_boundary_verifier.ts not found in artifacts');
      }

      const propertyAllocationPath = resolve(artifactsPath, 'correctness-property-allocation.json');
      details.hasPropertyAllocation = existsSync(propertyAllocationPath);

      const roadmapPath = resolve(artifactsPath, 'development-roadmap.md');
      details.hasDevelopmentRoadmap = existsSync(roadmapPath);
      if (!details.hasDevelopmentRoadmap) {
        warnings.push('development-roadmap.md not found in artifacts');
      }

      // Validate Property 15 allocation to scope-gate
      if (details.hasPropertyAllocation) {
        try {
          const allocationContent = readFileSync(propertyAllocationPath, 'utf-8');
          const allocation = JSON.parse(allocationContent);
          
          const property15 = allocation.properties?.find(
            (p: { id: string | number; title: string }) => p.id === 15 || p.title?.includes('Scope Boundary')
          );
          
          if (!property15) {
            warnings.push('Property 15 (Scope Boundary) not found in correctness-property-allocation.json');
          } else if (!property15.owners?.includes('scope-gate')) {
            warnings.push('Property 15 (Scope Boundary) is not allocated to scope-gate');
          }
        } catch (e) {
          errors.push(`Failed to parse correctness-property-allocation.json: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details
    };
  }

  /**
   * Detect changes in REQ-25 since last load
   * 
   * @param parentSpecPath - Path to parent spec
   * @returns ChangeDetectionResult
   */
  detectChanges(parentSpecPath: string): ChangeDetectionResult {
    const previousData = this.cachedData;
    const previousHash = previousData?.sourceHash || null;
    
    // Load fresh data
    const result = this.loadFromParentSpec(parentSpecPath, true);
    
    if (!result.success || !result.metadata) {
      const returnVal: ChangeDetectionResult = {
        hasChanged: false,
        previousHash,
        currentHash: null,
        timestamp: new Date()
      };
      if (result.error) {
        returnVal.error = result.error;
      }
      return returnVal;
    }

    const currentHash = result.metadata.sourceHash;
    const hasChanged = previousHash !== currentHash;

    // Calculate count changes if there was previous data
    const returnVal: ChangeDetectionResult = {
      hasChanged,
      previousHash,
      currentHash,
      timestamp: new Date()
    };

    if (previousData) {
      returnVal.details = {
        p0CountChanged: previousData.p0.length !== result.metadata.p0Count,
        p1CountChanged: previousData.p1.length !== result.metadata.p1Count,
        p2CountChanged: previousData.p2.length !== result.metadata.p2Count,
        previousP0Count: previousData.p0.length,
        currentP0Count: result.metadata.p0Count,
        previousP1Count: previousData.p1.length,
        currentP1Count: result.metadata.p1Count,
        previousP2Count: previousData.p2.length,
        currentP2Count: result.metadata.p2Count
      };
    }

    return returnVal;
  }

  /**
   * Validate loaded capabilities against parent spec artifacts
   * 
   * Ensures that the loaded capabilities are consistent with
   * what is defined in parent spec artifacts.
   * 
   * @returns ValidationResult[]
   */
  validateCapabilitiesAgainstArtifacts(): ValidationResult[] {
    const results: ValidationResult[] = [];
    const data = this.cachedData;

    if (!data) {
      results.push({
        type: 'error',
        code: 'unregistered_capability',
        message: 'No capabilities loaded. Call load() or loadFromParentSpec() first.'
      });
      return results;
    }

    // Check that we have capabilities for each scope level
    if (data.p0.length === 0) {
      results.push({
        type: 'error',
        code: 'missing_scope_tag',
        message: 'No P0 capabilities found in REQ-25'
      });
    }

    if (data.p1.length === 0) {
      results.push({
        type: 'warning',
        code: 'missing_scope_tag',
        message: 'No P1 capabilities found in REQ-25'
      });
    }

    if (data.p2.length === 0) {
      results.push({
        type: 'warning',
        code: 'missing_scope_tag',
        message: 'No P2 capabilities found in REQ-25'
      });
    }

    // Validate capability IDs are properly normalized
    const allCapabilities = [...data.p0, ...data.p1, ...data.p2];
    const seenIds = new Set<string>();
    
    for (const cap of allCapabilities) {
      if (!cap.id || cap.id.trim() === '') {
        results.push({
          type: 'error',
          code: 'unregistered_capability',
          message: `Capability has empty ID: ${cap.displayName}`
        });
      }
      
      if (seenIds.has(cap.id)) {
        results.push({
          type: 'error',
          code: 'scope_tag_mismatch',
          message: `Duplicate capability ID: ${cap.id}`
        });
      }
      seenIds.add(cap.id);
    }

    // Validate scope tags are consistent
    for (const cap of allCapabilities) {
      if (!['p0', 'p1', 'p2'].includes(cap.scopeTag)) {
        results.push({
          type: 'error',
          code: 'incorrect_scope_tag',
          message: `Invalid scope tag '${cap.scopeTag}' for capability: ${cap.id}`
        });
      }
    }

    return results;
  }

  /**
   * Get validation summary
   * 
   * Convenience method to get a summary of validation status
   * for the currently loaded REQ-25 data.
   * 
   * @returns Object with validation summary
   */
  getValidationSummary(): {
    isLoaded: boolean;
    capabilityCounts: { p0: number; p1: number; p2: number };
    hasChanges: boolean;
    changeTimestamp: Date | null;
  } {
    const data = this.cachedData;
    
    return {
      isLoaded: data !== null,
      capabilityCounts: {
        p0: data?.p0.length || 0,
        p1: data?.p1.length || 0,
        p2: data?.p2.length || 0
      },
      hasChanges: false, // Would need to track previous state
      changeTimestamp: this.cacheTimestamp
    };
  }

  // ============================================================
  // Task 8.3: Enhanced Change Detection Implementation
  // ============================================================

  /**
   * Detect detailed changes in REQ-25 with capability-level diff
   * 
   * This method provides more granular change detection including:
   * - File hash comparison
   - P0/P1/P2 count changes
   - Added/removed/modified capability definitions
   * 
   * @param parentSpecPath - Path to parent spec
   * @returns DetailedChangeDetection with full diff information
   */
  detectDetailedChanges(parentSpecPath: string): DetailedChangeDetection {
    const previousData = this.cachedData;
    const previousHash = previousData?.sourceHash || null;
    
    // Load fresh data
    const result = this.loadFromParentSpec(parentSpecPath, true);
    
    const returnVal: DetailedChangeDetection = {
      hasChanged: false,
      timestamp: new Date(),
      hashChanged: false,
      p0Count: { previous: 0, current: 0, changed: false },
      p1Count: { previous: 0, current: 0, changed: false },
      p2Count: { previous: 0, current: 0, changed: false },
      capabilityChanges: [],
      previousHash,
      currentHash: null
    };
    
    if (!result.success || !result.metadata) {
      return returnVal;
    }
    
    const currentData = this.cachedData!;
    const currentHash = result.metadata.sourceHash;
    
    returnVal.currentHash = currentHash;
    returnVal.hashChanged = previousHash !== currentHash;
    returnVal.hasChanged = returnVal.hashChanged;
    
    if (previousData) {
      // Track count changes
      returnVal.p0Count = {
        previous: previousData.p0.length,
        current: currentData.p0.length,
        changed: previousData.p0.length !== currentData.p0.length
      };
      returnVal.p1Count = {
        previous: previousData.p1.length,
        current: currentData.p1.length,
        changed: previousData.p1.length !== currentData.p1.length
      };
      returnVal.p2Count = {
        previous: previousData.p2.length,
        current: currentData.p2.length,
        changed: previousData.p2.length !== currentData.p2.length
      };
      
      // Build maps for comparison
      const previousCaps = new Map<string, CapabilityDefinition>();
      const currentCaps = new Map<string, CapabilityDefinition>();
      
      for (const cap of previousData.p0) previousCaps.set(cap.id, cap);
      for (const cap of previousData.p1) previousCaps.set(cap.id, cap);
      for (const cap of previousData.p2) previousCaps.set(cap.id, cap);
      
      for (const cap of currentData.p0) currentCaps.set(cap.id, cap);
      for (const cap of currentData.p1) currentCaps.set(cap.id, cap);
      for (const cap of currentData.p2) currentCaps.set(cap.id, cap);
      
      // Find added capabilities (in current but not in previous)
      for (const [id, cap] of currentCaps) {
        if (!previousCaps.has(id)) {
          returnVal.capabilityChanges.push({
            capabilityId: id,
            changeType: 'added',
            currentDefinition: cap
          });
          returnVal.hasChanged = true;
        }
      }
      
      // Find removed capabilities (in previous but not in current)
      for (const [id, cap] of previousCaps) {
        if (!currentCaps.has(id)) {
          returnVal.capabilityChanges.push({
            capabilityId: id,
            changeType: 'removed',
            previousDefinition: cap
          });
          returnVal.hasChanged = true;
        }
      }
      
      // Find modified capabilities (exist in both but different)
      for (const [id, currentCap] of currentCaps) {
        const previousCap = previousCaps.get(id);
        if (previousCap) {
          const changes: CapabilityChangeInfo['changeType'][] = [];
          
          // Check for scope tag change
          if (previousCap.scopeTag !== currentCap.scopeTag) {
            changes.push('modified');
            returnVal.capabilityChanges.push({
              capabilityId: id,
              changeType: 'modified',
              previousDefinition: previousCap,
              currentDefinition: currentCap,
              scopeTagChanged: true
            });
            returnVal.hasChanged = true;
          }
          
          // Check for display name change
          if (previousCap.displayName !== currentCap.displayName && !changes.includes('modified')) {
            changes.push('modified');
            returnVal.capabilityChanges.push({
              capabilityId: id,
              changeType: 'modified',
              previousDefinition: previousCap,
              currentDefinition: currentCap,
              displayNameChanged: true
            });
            returnVal.hasChanged = true;
          }
        }
      }
    } else {
      // First load - all capabilities are "added"
      returnVal.p0Count = { previous: 0, current: currentData.p0.length, changed: currentData.p0.length > 0 };
      returnVal.p1Count = { previous: 0, current: currentData.p1.length, changed: currentData.p1.length > 0 };
      returnVal.p2Count = { previous: 0, current: currentData.p2.length, changed: currentData.p2.length > 0 };
      
      for (const cap of currentData.p0) {
        returnVal.capabilityChanges.push({
          capabilityId: cap.id,
          changeType: 'added',
          currentDefinition: cap
        });
      }
      for (const cap of currentData.p1) {
        returnVal.capabilityChanges.push({
          capabilityId: cap.id,
          changeType: 'added',
          currentDefinition: cap
        });
      }
      for (const cap of currentData.p2) {
        returnVal.capabilityChanges.push({
          capabilityId: cap.id,
          changeType: 'added',
          currentDefinition: cap
        });
      }
      
      returnVal.hasChanged = returnVal.capabilityChanges.length > 0;
    }
    
    // Update previous capabilities map
    if (currentData) {
      this.previousCapabilities.clear();
      for (const cap of [...currentData.p0, ...currentData.p1, ...currentData.p2]) {
        this.previousCapabilities.set(cap.id, cap);
      }
    }
    
    return returnVal;
  }

  /**
   * Set watcher options for passive change detection
   * 
   * @param options - Watcher configuration options
   */
  setWatcherOptions(options: Partial<WatcherOptions>): void {
    this.watcherOptions = { ...this.watcherOptions, ...options };
  }

  /**
   * Get current watcher options
   * 
   * @returns Current watcher options
   */
  getWatcherOptions(): WatcherOptions {
    return { ...this.watcherOptions };
  }

  /**
   * Start file watching for passive change detection (passive mode)
   * 
   * Uses fs.watch to monitor the parent spec requirements.md file
   * and triggers callbacks when changes are detected.
   * 
   * @param parentSpecPath - Path to parent spec
   * @param callback - Optional callback to invoke on changes
   * @returns Watcher instance for control
   */
  startWatching(parentSpecPath: string, callback?: ChangeCallback): FSWatcher | null {
    const requirementsPath = resolve(parentSpecPath, 'requirements.md');
    
    if (!existsSync(requirementsPath)) {
      console.warn(`[Req25Loader] Cannot watch: requirements.md not found at ${requirementsPath}`);
      return null;
    }
    
    // Register callback if provided
    if (callback) {
      this.changeCallbacks.push(callback);
    }
    
    try {
      // Use fs.watch for file changes
      const watcher = watch(requirementsPath, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange(parentSpecPath);
        }
      });
      
      this.watchers.push(watcher);
      console.log(`[Req25Loader] Started watching: ${requirementsPath}`);
      
      return watcher;
    } catch (error) {
      console.error(`[Req25Loader] Failed to start watching: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Handle file change event (internal)
   * 
   * @param parentSpecPath - Path to parent spec
   */
  private handleFileChange(parentSpecPath: string): void {
    // Debounce: use setTimeout with debounceMs
    const debounceMs = this.watcherOptions.debounceMs || 500;
    
    setTimeout(async () => {
      // Detect changes
      const changeResult = this.detectChanges(parentSpecPath);
      
      if (changeResult.hasChanged) {
        console.log(`[Req25Loader] REQ-25 changed: ${changeResult.currentHash} (was ${changeResult.previousHash})`);
        
        // Notify all registered callbacks
        for (const callback of this.changeCallbacks) {
          try {
            await callback(changeResult);
          } catch (error) {
            console.error(`[Req25Loader] Callback error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }, debounceMs);
  }

  /**
   * Stop all file watchers
   */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    console.log('[Req25Loader] Stopped all watchers');
  }

  /**
   * Register a change callback
   * 
   * @param callback - Function to call when REQ-25 changes
   */
  onChange(callback: ChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Unregister a change callback
   * 
   * @param callback - The callback to remove
   */
  offChange(callback: ChangeCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  /**
   * Create an active polling-based change detector (active mode)
   * 
   * Starts a background polling loop that checks for changes
   * at regular intervals.
   * 
   * @param parentSpecPath - Path to parent spec
   * @returns ActiveChangeDetector interface
   */
  createActiveDetector(parentSpecPath: string): ActiveChangeDetector {
    const self = this;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastResult: ChangeDetectionResult | null = null;
    let watching = false;
    
    // Load initial data for comparison
    this.loadFromParentSpec(parentSpecPath);
    
    const detector: ActiveChangeDetector = {
      start() {
        if (watching) return;
        
        watching = true;
        const intervalMs = self.watcherOptions.intervalMs || 5000;
        
        intervalId = setInterval(() => {
          const result = self.detectChanges(parentSpecPath);
          lastResult = result;
          
          if (result.hasChanged) {
            console.log(`[Req25Loader] Active detector: REQ-25 changed (${result.currentHash})`);
            
            // Notify callbacks
            for (const callback of self.changeCallbacks) {
              try {
                callback(result);
              } catch (error) {
                console.error(`[Req25Loader] Callback error: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }
          }
        }, intervalMs);
        
        console.log(`[Req25Loader] Started active detector with ${intervalMs}ms interval`);
      },
      
      stop() {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        watching = false;
        console.log('[Req25Loader] Stopped active detector');
      },
      
      isWatching() {
        return watching;
      },
      
      getLastResult() {
        return lastResult;
      }
    };
    
    this.activeDetectors.push(detector);
    return detector;
  }

  /**
   * Check if currently watching for changes
   * 
   * @returns true if any watchers or detectors are active
   */
  isWatching(): boolean {
    return this.watchers.length > 0 || this.activeDetectors.some(d => d.isWatching());
  }

  /**
   * Get the number of active watchers
   * 
   * @returns Number of file watchers
   */
  getWatcherCount(): number {
    return this.watchers.length;
  }

  /**
   * Get the number of active detectors
   * 
   * @returns Number of active change detectors
   */
  getDetectorCount(): number {
    return this.activeDetectors.filter(d => d.isWatching()).length;
  }

  /**
   * Stop all active detectors
   */
  stopAllDetectors(): void {
    for (const detector of this.activeDetectors) {
      detector.stop();
    }
  }

  /**
   * Cleanup all resources (watchers, detectors, callbacks)
   * 
   * Should be called when the loader is no longer needed.
   */
  dispose(): void {
    this.stopWatching();
    this.stopAllDetectors();
    this.changeCallbacks = [];
    this.previousCapabilities.clear();
    console.log('[Req25Loader] Disposed all resources');
  }
}

/**
 * Create a default Req25Loader instance
 */
export function createReq25Loader(): Req25Loader {
  return new Req25Loader();
}

/**
 * Convenience function to load and register capabilities with ScopeRegistry
 * 
 * This function combines loading REQ-25 and registering all capabilities
 * with the provided registry.
 * 
 * @param registry - ScopeRegistry instance to register capabilities with
 * @param parentSpecPath - Optional path to parent spec
 * @returns LoadResult
 */
export async function loadAndRegisterCapabilities(
  registry: { registerCapability(capability: CapabilityDefinition): void },
  parentSpecPath?: string
): Promise<LoadResult> {
  const loader = new Req25Loader();
  const path = parentSpecPath || Req25Loader.getDefaultParentSpecPath();
  const result = loader.loadFromParentSpec(path);
  
  if (result.success) {
    for (const capability of result.capabilities) {
      registry.registerCapability(capability);
    }
  }
  
  return result;
}

/**
 * Synchronous version of loadAndRegisterCapabilities
 * 
 * @param registry - ScopeRegistry instance to register capabilities with
 * @param parentSpecPath - Optional path to parent spec
 * @returns LoadResult
 */
export function loadAndRegisterCapabilitiesSync(
  registry: { registerCapability(capability: CapabilityDefinition): void },
  parentSpecPath?: string
): LoadResult {
  const loader = new Req25Loader();
  const path = parentSpecPath || Req25Loader.getDefaultParentSpecPath();
  const result = loader.loadFromParentSpec(path);
  
  if (result.success) {
    for (const capability of result.capabilities) {
      registry.registerCapability(capability);
    }
  }
  
  return result;
}