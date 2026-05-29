/**
 * User Policy Loader Service
 * 
 * Loads user/project custom rules from config files.
 * Supports hot-reloading of user policies and detects hard rule conflicts.
 * 
 * Implements Layer 3 of the three-layer permission model.
 * 
 * @specforge/permission-engine
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { 
  UserPolicy, 
  UserPolicyCollection, 
  UserPolicyLoaderConfig,
  UserPolicyEvaluationResult,
  HardRuleConflictReport,
  UserPolicySchema,
  UserPolicyCollectionSchema,
  DEFAULT_USER_POLICY_COLLECTION
} from '../types/user-policies';
import { HardRuleEvaluator } from '../hard-rules';

/**
 * Pattern matcher interface for user policies
 */
interface UserPolicyPatternMatcher {
  matchesActor(actor: any, pattern: string): boolean;
  matchesAction(action: string, pattern: string): boolean;
  matchesResource(resource: any, pattern: string): boolean;
}

export class UserPolicyLoader implements UserPolicyPatternMatcher {
  private config: UserPolicyLoaderConfig;
  private policies: UserPolicy[] = [];
  private policyCollections: Map<string, UserPolicyCollection> = new Map();
  private fileWatchers: fs.FSWatcher[] = [];
  private cache: Map<string, UserPolicy[]> = new Map();
  private hardRuleEvaluator: HardRuleEvaluator;
  private conflictCache: HardRuleConflictReport | null = null;
  private isInitialized: boolean = false;

  constructor(config: UserPolicyLoaderConfig, hardRuleEvaluator?: HardRuleEvaluator) {
    this.config = {
      policyPaths: [],
      watchForChanges: false,
      validationEnabled: true,
      cacheEnabled: true,
      ...config
    };

    // Initialize hard rule evaluator for conflict detection
    this.hardRuleEvaluator = hardRuleEvaluator || new HardRuleEvaluator();

    // Add default policy path if not specified
    if (!this.config.defaultPolicyPath) {
      this.config.defaultPolicyPath = path.join(
        process.cwd(),
        SPEC_DIR_NAME,
        'permissions.json'
      );
    }
  }

  /**
   * Initialize the user policy loader
   */
  async initialize(): Promise<void> {
    // Load empty default collection
    this.loadDefaultPolicies();

    // Load policies from configured paths
    await this.loadPoliciesFromPaths();

    // Detect conflicts with hard rules
    this.conflictCache = this.detectHardRuleConflicts();

    // Set up file watchers if enabled
    if (this.config.watchForChanges) {
      this.setupFileWatchers();
    }

    this.isInitialized = true;
  }

  /**
   * Check if loader is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Load default user policies (empty by default - users define their own)
   */
  private loadDefaultPolicies(): void {
    const defaultCollection = DEFAULT_USER_POLICY_COLLECTION;
    
    // Validate default collection if validation is enabled
    if (this.config.validationEnabled) {
      try {
        UserPolicyCollectionSchema.parse(defaultCollection);
      } catch (error) {
        console.warn('Default user policy collection validation failed:', error);
      }
    }

    // Add default collection to the map
    this.policyCollections.set('default', defaultCollection);
    
    // Add policies to the list (empty by default)
    this.policies.push(...defaultCollection.policies);

    console.log(`Loaded ${defaultCollection.policies.length} default user policies`);
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
        console.error(`Failed to load user policies from path ${policyPath}:`, error);
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
            console.error(`Failed to load user policy file ${filePath}:`, error);
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
        const validatedCollection = UserPolicyCollectionSchema.parse(collectionData);
        
        // Validate each policy in the collection
        for (const policy of validatedCollection.policies) {
          // Ensure policy is enabled by default
          if (policy.enabled === undefined) {
            policy.enabled = true;
          }
          UserPolicySchema.parse(policy);
        }

        // Add to collections map
        this.policyCollections.set(source, validatedCollection);
        
        // Add policies to the main list (only enabled policies)
        const enabledPolicies = validatedCollection.policies.filter(p => p.enabled !== false);
        this.policies.push(...enabledPolicies);

        console.log(`Loaded ${enabledPolicies.length} user policies from ${source}`);
      } catch (error) {
        console.error(`Failed to validate user policy collection from ${source}:`, error);
        throw error;
      }
    } else {
      // Skip validation, assume data is valid
      const collection = collectionData as UserPolicyCollection;
      const enabledPolicies = collection.policies.filter(p => p.enabled !== false);
      this.policyCollections.set(source, collection);
      this.policies.push(...enabledPolicies);
      
      console.log(`Loaded ${enabledPolicies.length} user policies from ${source} (without validation)`);
    }
  }

  /**
   * Detect hard rule conflicts in loaded policies
   */
  detectHardRuleConflicts(): HardRuleConflictReport {
    if (this.conflictCache && !this.config.cacheEnabled) {
      return this.conflictCache;
    }

    const conflicts: HardRuleConflictReport['conflicts'] = [];

    for (const policy of this.policies) {
      // Skip if policy allows (only deny policies can conflict with hard rules)
      if (policy.effect !== 'deny') {
        continue;
      }

      // Check if this deny policy conflicts with a hard rule that would allow
      for (const hardRule of this.hardRuleEvaluator.getAllRules()) {
        // Check if the user policy attempts to allow something the hard rule denies
        if (this.doesPolicyConflictWithHardRule(policy, hardRule)) {
          conflicts.push({
            userPolicyId: policy.id,
            hardRuleId: hardRule.id,
            description: `User policy "${policy.id}" attempts to ${policy.effect} ${policy.actionPattern} on ${policy.resourcePattern}, but hard rule "${hardRule.id}" (${hardRule.description}) takes precedence`,
            severity: 'error'
          });
        }
      }
    }

    const report: HardRuleConflictReport = {
      detected: conflicts.length > 0,
      conflicts,
      message: conflicts.length > 0 
        ? `Found ${conflicts.length} hard rule conflict(s) in user policies`
        : undefined
    };

    this.conflictCache = report;
    return report;
  }

  /**
   * Check if a user policy conflicts with a hard rule
   */
  private doesPolicyConflictWithHardRule(policy: UserPolicy, hardRule: { id: string; description: string }): boolean {
    // This is a simplified check - checks if user policy tries to allow something hard rule denies
    // The actual conflict detection is done by HardRuleEvaluator
    
    // Check if policy's action/resource patterns match any hard rule patterns
    const hardRulePatterns = this.getHardRulePatterns(hardRule.id);
    
    for (const pattern of hardRulePatterns) {
      const actionMatches = this.matchesActionPattern(policy.actionPattern, pattern.action);
      const resourceMatches = this.matchesResourcePattern(policy.resourcePattern, pattern.resource);
      
      if (actionMatches && resourceMatches) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get patterns for a hard rule
   */
  private getHardRulePatterns(hardRuleId: string): Array<{ action: string; resource: string }> {
    // Define patterns that would trigger each hard rule
    const patterns: Record<string, Array<{ action: string; resource: string }>> = {
      'hard-001': [
        { action: 'gate.bypass', resource: '*' },
        { action: 'validation.skip', resource: '*' },
        { action: 'check.override', resource: '*' }
      ],
      'hard-002': [
        { action: 'verification.forge', resource: '*' },
        { action: 'signature.falsify', resource: '*' },
        { action: 'approval.fabricate', resource: '*' }
      ],
      'hard-003': [
        { action: '*', resource: 'system.config:*' },
        { action: '*', resource: 'security.credentials:*' }
      ],
      'hard-004': [
        { action: 'write', resource: '/etc/*' },
        { action: 'write', resource: 'node_modules/*' }
      ],
      'hard-005': [
        { action: 'code.execute', resource: '*' },
        { action: 'script.run', resource: '*' },
        { action: 'command.exec', resource: '*' }
      ],
      'hard-006': [
        { action: 'data.export', resource: '*' },
        { action: 'log.dump', resource: '*' }
      ],
      'hard-007': [
        { action: 'agent.impersonate', resource: '*' },
        { action: 'identity.masquerade', resource: '*' }
      ],
      'hard-008': [
        { action: 'system.shutdown', resource: '*' },
        { action: 'service.stop', resource: '*' }
      ],
      'hard-009': [
        { action: 'data.corrupt', resource: '*' },
        { action: 'record.tamper', resource: '*' }
      ]
    };

    return patterns[hardRuleId] || [];
  }

  /**
   * Match action pattern against a hard rule action
   */
  private matchesActionPattern(policyAction: string, hardRuleAction: string): boolean {
    try {
      const policyRegex = new RegExp(policyAction.replace(/^action:/, ''));
      return policyRegex.test(hardRuleAction);
    } catch {
      return false;
    }
  }

  /**
   * Match resource pattern against a hard rule resource
   */
  private matchesResourcePattern(policyResource: string, hardRuleResource: string): boolean {
    // Handle wildcards
    if (hardRuleResource === '*') {
      return true;
    }
    
    try {
      const policyRegex = new RegExp(policyResource.replace(/^resourcePattern:/, ''));
      return policyRegex.test(hardRuleResource);
    } catch {
      return false;
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
              console.log(`User policy file changed: ${filePath}, reloading...`);
              
              try {
                // Remove old policies from this file
                this.removePoliciesFromSource(filename.toString());
                
                // Reload the file
                await this.loadPolicyFile(filePath);
                
                // Re-detect conflicts
                this.conflictCache = this.detectHardRuleConflicts();
              } catch (error) {
                console.error(`Failed to reload user policy file ${filePath}:`, error);
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
   * Evaluate user policies against a permission request
   */
  evaluate(
    actor: any,
    action: string,
    resource: any,
    context?: Record<string, unknown>
  ): UserPolicyEvaluationResult {
    const cacheKey = this.config.cacheEnabled ? this.generateCacheKey(actor, action, resource, context) : null;
    
    // Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      const cachedResult = this.cache.get(cacheKey)!;
      return {
        ...cachedResult,
        evaluatedPolicies: [...cachedResult.evaluatedPolicies]
      };
    }

    const evaluatedPolicies: UserPolicy[] = [];
    let matchedPolicy: UserPolicy | undefined;
    let resultAllowed = true; // Default to allow if no policies match
    
    // Sort policies by priority (higher priority = evaluated earlier)
    const sortedPolicies = [...this.policies].sort((a, b) => b.priority - a.priority);
    
    for (const policy of sortedPolicies) {
      // Skip disabled policies
      if (policy.enabled === false) {
        continue;
      }
      
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

    const result: UserPolicyEvaluationResult = {
      allowed: resultAllowed,
      matchedPolicy,
      reason: matchedPolicy ? `Matched user policy: ${matchedPolicy.description}` : undefined,
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
  getAllPolicies(): UserPolicy[] {
    return [...this.policies];
  }

  /**
   * Get policies by tag
   */
  getPoliciesByTag(tag: string): UserPolicy[] {
    return this.policies.filter(policy => 
      policy.metadata?.tags?.includes(tag)
    );
  }

  /**
   * Get policies for a specific agent role
   */
  getPoliciesForAgentRole(agentRole: string): UserPolicy[] {
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
    
    // Re-detect conflicts
    this.conflictCache = this.detectHardRuleConflicts();
    
    console.log('User policies reloaded successfully');
  }

  /**
   * Get hard rule conflict report
   */
  getHardRuleConflicts(): HardRuleConflictReport {
    return this.conflictCache || this.detectHardRuleConflicts();
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
  getConfig(): UserPolicyLoaderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<UserPolicyLoaderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Create a mock policy loader for testing
   */
  evaluateSimple(
    actor: string,
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ): UserPolicyEvaluationResult {
    const actorObj: Record<string, unknown> = { id: actor, agentRole: actor };
    const resourceObj: Record<string, unknown> = { type: resource };
    return this.evaluate(actorObj, action, resourceObj, context);
  }

  async loadFromPermissionsJson(filePath?: string): Promise<void> {
    const targetPath = filePath || this.config.defaultPolicyPath;
    if (!targetPath) return;

    try {
      const stats = await fs.promises.stat(targetPath);
      if (stats.isFile()) {
        await this.loadPolicyFile(targetPath);
        this.conflictCache = this.detectHardRuleConflicts();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  static createMockLoader(
    policies: UserPolicy[] = [], 
    hardRuleEvaluator?: HardRuleEvaluator
  ): UserPolicyLoader {
    const config: UserPolicyLoaderConfig = {
      policyPaths: [],
      watchForChanges: false,
      validationEnabled: false,
      cacheEnabled: false
    };
    
    const loader = new UserPolicyLoader(config, hardRuleEvaluator);
    
    // Load provided policies without file operations
    loader.policies = [...policies];
    loader.isInitialized = true;
    
    return loader;
  }
}