/**
 * Built-in Policy Loader Service
 * 
 * Loads default agent role permissions from config files.
 * Supports JSON/YAML policy formats and validates policy schema.
 * 
 * Implements Layer 2 of the three-layer permission model.
 * 
 * @specforge/permission-engine
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { 
  BuiltinPolicy, 
  BuiltinPolicyCollection, 
  BuiltinPolicyLoaderConfig,
  BuiltinPolicyEvaluationResult,
  PatternMatcher,
  BuiltinPolicySchema,
  BuiltinPolicyCollectionSchema,
  DEFAULT_BUILTIN_POLICY_COLLECTION
} from '../types/builtin-policies';

export class BuiltinPolicyLoader implements PatternMatcher {
  private config: BuiltinPolicyLoaderConfig;
  private policies: BuiltinPolicy[] = [];
  private policyCollections: Map<string, BuiltinPolicyCollection> = new Map();
  private fileWatchers: fs.FSWatcher[] = [];
  private cache: Map<string, BuiltinPolicy[]> = new Map();

  constructor(config: BuiltinPolicyLoaderConfig) {
    this.config = {
      policyPaths: [],
      watchForChanges: false,
      validationEnabled: true,
      cacheEnabled: true,
      ...config
    };

    // Add default policy path if not specified
    if (!this.config.defaultPolicyPath) {
      this.config.defaultPolicyPath = path.join(process.cwd(), '.specforge', 'config', 'builtin-policies');
    }
  }

  /**
   * Initialize the policy loader
   */
  async initialize(): Promise<void> {
    // Load default policies first
    this.loadDefaultPolicies();

    // Load policies from configured paths
    await this.loadPoliciesFromPaths();

    // Set up file watchers if enabled
    if (this.config.watchForChanges) {
      this.setupFileWatchers();
    }
  }

  /**
   * Load default built-in policies
   */
  private loadDefaultPolicies(): void {
    const defaultCollection = DEFAULT_BUILTIN_POLICY_COLLECTION;
    
    // Validate default collection if validation is enabled
    if (this.config.validationEnabled) {
      try {
        BuiltinPolicyCollectionSchema.parse(defaultCollection);
      } catch (error) {
        console.warn('Default built-in policy collection validation failed:', error);
        // Continue with default policies even if validation fails
      }
    }

    // Add default policies to the collection
    this.policyCollections.set('default', defaultCollection);
    this.policies.push(...defaultCollection.policies);

    console.log(`Loaded ${defaultCollection.policies.length} default built-in policies`);
  }

  /**
   * Load policies from all configured paths
   */
  private async loadPoliciesFromPaths(): Promise<void> {
    const allPaths = [
      ...this.config.policyPaths,
      this.config.defaultPolicyPath!
    ].filter((p, i, arr) => arr.indexOf(p) === i); // Remove duplicates

    for (const policyPath of allPaths) {
      try {
        await this.loadPoliciesFromPath(policyPath);
      } catch (error) {
        console.error(`Failed to load policies from path ${policyPath}:`, error);
      }
    }
  }

  /**
   * Load policies from a specific path (file or directory)
   */
  private async loadPoliciesFromPath(policyPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(policyPath);

      if (stats.isDirectory()) {
        await this.loadPoliciesFromDirectory(policyPath);
      } else if (stats.isFile()) {
        await this.loadPolicyFile(policyPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Path doesn't exist, skip silently
        return;
      }
      throw error;
    }
  }

  /**
   * Load policies from a directory
   */
  private async loadPoliciesFromDirectory(dirPath: string): Promise<void> {
    try {
      const files = await fs.promises.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        
        // Only load JSON and YAML files
        if (file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.yml')) {
          try {
            await this.loadPolicyFile(filePath);
          } catch (error) {
            console.error(`Failed to load policy file ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to read directory ${dirPath}:`, error);
    }
  }

  /**
   * Load a single policy file
   */
  private async loadPolicyFile(filePath: string): Promise<void> {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    
    let parsedContent: any;
    
    // Parse based on file extension
    if (filePath.endsWith('.json')) {
      parsedContent = JSON.parse(fileContent);
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      parsedContent = yaml.parse(fileContent);
    } else {
      throw new Error(`Unsupported file format: ${filePath}`);
    }

    // Validate and load the policy collection
    await this.loadPolicyCollection(parsedContent, fileName);
  }

  /**
   * Load a policy collection
   */
  private async loadPolicyCollection(collectionData: any, source: string): Promise<void> {
    if (this.config.validationEnabled) {
      try {
        // Validate the collection schema
        const validatedCollection = BuiltinPolicyCollectionSchema.parse(collectionData);
        
        // Validate each policy in the collection
        for (const policy of validatedCollection.policies) {
          BuiltinPolicySchema.parse(policy);
        }

        // Add to collections map
        this.policyCollections.set(source, validatedCollection);
        
        // Add policies to the main list
        this.policies.push(...validatedCollection.policies);

        console.log(`Loaded ${validatedCollection.policies.length} policies from ${source}`);
      } catch (error) {
        console.error(`Failed to validate policy collection from ${source}:`, error);
        throw error;
      }
    } else {
      // Skip validation, assume data is valid
      const collection = collectionData as BuiltinPolicyCollection;
      this.policyCollections.set(source, collection);
      this.policies.push(...collection.policies);
      
      console.log(`Loaded ${collection.policies.length} policies from ${source} (without validation)`);
    }
  }

  /**
   * Set up file watchers for hot-reloading
   */
  private setupFileWatchers(): void {
    for (const policyPath of this.config.policyPaths) {
      try {
        const watcher = fs.watch(policyPath, { persistent: false }, async (eventType, filename) => {
          if (eventType === 'change' && filename) {
            const filePath = path.join(policyPath, filename.toString());
            
            // Only reload JSON/YAML files
            if (filePath.endsWith('.json') || filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
              console.log(`Policy file changed: ${filePath}, reloading...`);
              
              try {
                // Remove old policies from this file
                this.removePoliciesFromSource(filename.toString());
                
                // Reload the file
                await this.loadPolicyFile(filePath);
              } catch (error) {
                console.error(`Failed to reload policy file ${filePath}:`, error);
              }
            }
          }
        });
        
        this.fileWatchers.push(watcher);
      } catch (error) {
        console.error(`Failed to set up file watcher for ${policyPath}:`, error);
      }
    }
  }

  /**
   * Remove policies from a specific source
   */
  private removePoliciesFromSource(source: string): void {
    // Find indices of policies from this source
    const indicesToRemove: number[] = [];
    
    for (let i = 0; i < this.policies.length; i++) {
      // Check if this policy belongs to the source collection
      for (const [collectionSource, collection] of this.policyCollections.entries()) {
        if (collectionSource === source && collection.policies.includes(this.policies[i])) {
          indicesToRemove.push(i);
          break;
        }
      }
    }
    
    // Remove policies in reverse order to preserve indices
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      this.policies.splice(indicesToRemove[i], 1);
    }
    
    // Remove the collection
    this.policyCollections.delete(source);
    
    // Clear cache
    this.cache.clear();
  }

  /**
   * Evaluate built-in policies against a permission request
   */
  evaluate(
    actor: any,
    action: string,
    resource: any,
    context?: Record<string, unknown>
  ): BuiltinPolicyEvaluationResult {
    const cacheKey = this.config.cacheEnabled ? this.generateCacheKey(actor, action, resource, context) : null;
    
    // Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      const cachedResult = this.cache.get(cacheKey)!;
      return {
        ...cachedResult,
        evaluatedPolicies: [...cachedResult.evaluatedPolicies]
      };
    }

    const evaluatedPolicies: BuiltinPolicy[] = [];
    let matchedPolicy: BuiltinPolicy | undefined;
    let resultAllowed = true; // Default to allow if no policies match
    
    // Sort policies by priority (higher priority = evaluated earlier)
    const sortedPolicies = [...this.policies].sort((a, b) => b.priority - a.priority);
    
    for (const policy of sortedPolicies) {
      // Check if policy matches
      const matchesActor = this.matchesActor(actor, policy.actorPattern);
      const matchesAction = this.matchesAction(action, policy.actionPattern);
      const matchesResource = this.matchesResource(resource, policy.resourcePattern);
      
      if (matchesActor && matchesAction && matchesResource) {
        evaluatedPolicies.push(policy);
        
        // Check additional conditions if present
        let conditionsMet = true;
        if (policy.conditions) {
          conditionsMet = this.evaluateConditions(policy.conditions, actor, action, resource, context);
        }
        
        if (conditionsMet) {
          matchedPolicy = policy;
          resultAllowed = policy.effect === 'allow';
          
          // Stop evaluation at first matching policy (due to priority sorting)
          break;
        }
      }
    }

    const result: BuiltinPolicyEvaluationResult = {
      allowed: resultAllowed,
      matchedPolicy,
      reason: matchedPolicy ? `Matched built-in policy: ${matchedPolicy.description}` : undefined,
      evaluatedPolicies
    };

    // Cache the result
    if (cacheKey && this.config.cacheEnabled) {
      this.cache.set(cacheKey, {
        ...result,
        evaluatedPolicies: [...evaluatedPolicies]
      });
    }

    return result;
  }

  /**
   * Generate a cache key for the evaluation
   */
  private generateCacheKey(
    actor: any,
    action: string,
    resource: any,
    context?: Record<string, unknown>
  ): string {
    const actorKey = JSON.stringify(actor);
    const resourceKey = JSON.stringify(resource);
    const contextKey = context ? JSON.stringify(context) : '';
    
    return `${actorKey}:${action}:${resourceKey}:${contextKey}`;
  }

  /**
   * Check if an actor matches a pattern
   */
  matchesActor(actor: any, pattern: string): boolean {
    // Parse pattern like "agentRole:sf-reviewer" or "userId:123"
    const [key, value] = pattern.split(':');
    
    if (!key || !value) {
      return false;
    }
    
    // Check different actor properties
    switch (key.toLowerCase()) {
      case 'agentrole':
        return actor.agentRole === value;
      case 'userid':
        return actor.id === value;
      case 'sessionid':
        return actor.sessionId === value;
      case 'workflowrole':
        return actor.workflowRole === value;
      case 'remoteidentity':
        return actor.remoteIdentity === value;
      case '*':
        return true; // Wildcard matches any actor
      default:
        // Check custom actor properties
        return actor[key] === value;
    }
  }

  /**
   * Check if an action matches a pattern
   */
  matchesAction(action: string, pattern: string): boolean {
    // Parse pattern like "action:^tool\\.(execute|write)"
    const [prefix, ...rest] = pattern.split(':');
    const patternValue = rest.join(':'); // Handle patterns with colons in them
    
    if (prefix.toLowerCase() !== 'action') {
      return false;
    }
    
    // Convert pattern to regex
    try {
      const regex = new RegExp(patternValue);
      return regex.test(action);
    } catch (error) {
      console.error(`Invalid regex pattern for action matching: ${patternValue}`, error);
      return false;
    }
  }

  /**
   * Check if a resource matches a pattern
   */
  matchesResource(resource: any, pattern: string): boolean {
    // Parse pattern like "resourceType:*" or "resourceType:spec"
    const [key, value] = pattern.split(':');
    
    if (!key || !value) {
      return false;
    }
    
    // Check different resource properties
    switch (key.toLowerCase()) {
      case 'resourcetype':
        return value === '*' || resource.type === value;
      case 'resourceid':
        return value === '*' || resource.id === value;
      case 'resourcepath':
        return value === '*' || resource.path === value;
      case '*':
        return true; // Wildcard matches any resource
      default:
        // Check custom resource properties
        return value === '*' || resource[key] === value;
    }
  }

  /**
   * Evaluate additional conditions for a policy
   */
  private evaluateConditions(
    conditions: Record<string, any>,
    actor: any,
    action: string,
    resource: any,
    context?: Record<string, unknown>
  ): boolean {
    // Simple condition evaluation - can be extended for more complex logic
    for (const [key, expectedValue] of Object.entries(conditions)) {
      let actualValue: any;
      
      // Determine where to get the value from
      if (key.startsWith('actor.')) {
        const actorKey = key.substring(6);
        actualValue = actor[actorKey];
      } else if (key.startsWith('resource.')) {
        const resourceKey = key.substring(9);
        actualValue = resource[resourceKey];
      } else if (key.startsWith('context.')) {
        const contextKey = key.substring(8);
        actualValue = context?.[contextKey];
      } else if (key === 'action') {
        actualValue = action;
      } else {
        // Default to context
        actualValue = context?.[key];
      }
      
      // Compare values
      if (expectedValue !== undefined && actualValue !== expectedValue) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get all loaded policies
   */
  getAllPolicies(): BuiltinPolicy[] {
    return [...this.policies];
  }

  /**
   * Get policies by tag
   */
  getPoliciesByTag(tag: string): BuiltinPolicy[] {
    return this.policies.filter(policy => 
      policy.metadata?.tags?.includes(tag)
    );
  }

  /**
   * Get policies for a specific agent role
   */
  getPoliciesForAgentRole(agentRole: string): BuiltinPolicy[] {
    return this.policies.filter(policy => 
      policy.actorPattern === `agentRole:${agentRole}` || 
      policy.actorPattern.includes(`agentRole:${agentRole}`)
    );
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reload all policies
   */
  async reloadPolicies(): Promise<void> {
    // Clear current state
    this.policies = [];
    this.policyCollections.clear();
    this.cache.clear();
    
    // Reload policies
    this.loadDefaultPolicies();
    await this.loadPoliciesFromPaths();
    
    console.log('Policies reloaded successfully');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Close file watchers
    for (const watcher of this.fileWatchers) {
      watcher.close();
    }
    this.fileWatchers = [];
    
    // Clear cache
    this.cache.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): BuiltinPolicyLoaderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BuiltinPolicyLoaderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Create a mock policy loader for testing
   */
  static createMockLoader(): BuiltinPolicyLoader {
    const config: BuiltinPolicyLoaderConfig = {
      policyPaths: [],
      watchForChanges: false,
      validationEnabled: false,
      cacheEnabled: false
    };
    
    const loader = new BuiltinPolicyLoader(config);
    
    // Load default policies without file operations
    loader.loadDefaultPolicies();
    
    return loader;
  }
}