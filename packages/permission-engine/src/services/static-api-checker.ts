/**
 * Static API Checker
 * 
 * Performs static code analysis to detect prohibited API usage in plugin source code.
 * Implements Requirement 3.3 AC-3: "Perform static checks on plugin source code, 
 * prohibiting sensitive APIs: direct child_process.exec, fs out-of-bounds paths, 
 * undeclared network access."
 * 
 * Implements Property 28: Plugin Permission Gate - Static API Checks
 * 
 * @specforge/permission-engine
 */

import { z } from 'zod';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

/**
 * Types of prohibited APIs that static checker can detect
 */
export enum ProhibitedApiType {
  CHILD_PROCESS_EXEC = 'child_process.exec',
  CHILD_PROCESS_SPAWN = 'child_process.spawn',
  CHILD_PROCESS_EXEC_SYNC = 'child_process.execSync',
  CHILD_PROCESS_SPAWN_SYNC = 'child_process.spawnSync',
  CHILD_PROCESS_FORK = 'child_process.fork',
  CHILD_PROCESS_EXEC_FILE = 'child_process.execFile',
  CHILD_PROCESS_EXEC_FILE_SYNC = 'child_process.execFileSync',
  
  FS_READ_FILE = 'fs.readFile',
  FS_WRITE_FILE = 'fs.writeFile',
  FS_RENAME = 'fs.rename',
  FS_UNLINK = 'fs.unlink',
  FS_MKDIR = 'fs.mkdir',
  FS_RMDIR = 'fs.rmdir',
  FS_COPY_FILE = 'fs.copyFile',
  FS_CREATE_READ_STREAM = 'fs.createReadStream',
  FS_CREATE_WRITE_STREAM = 'fs.createWriteStream',
  FS_ACCESS = 'fs.access',
  FS_CONSTANTS = 'fs.constants',
  
  NET_HTTP = 'http.request',
  NET_HTTPS = 'https.request',
  NET_NODE_HTTP = 'http.get',
  NET_NODE_HTTPS = 'https.get',
  NET_REQUEST = 'net.request',
  NET_CONNECT = 'net.connect',
  NET_CREATE_CONNECTION = 'net.createConnection',
  NET_DGRAM = 'dgram.createSocket',
  
  DANGEROUS_EVAL = 'eval',
  DANGEROUS_FUNCTION = 'Function',
  DANGEROUS_SETTIMEOUT_STRING = 'setTimeout-string',
  DANGEROUS_SETINTERVAL_STRING = 'setInterval-string',
  
  PROCESS_ENV = 'process.env',
  PROCESS_STDIN = 'process.stdin',
  PROCESS_STDOUT = 'process.stdout',
  PROCESS_STDERR = 'process.stderr'
}

/**
 * Category of prohibited API
 */
export enum ProhibitedApiCategory {
  CHILD_PROCESS = 'child_process',
  FILESYSTEM = 'filesystem',
  NETWORK = 'network',
  CODE_INJECTION = 'code_injection',
  PROCESS_ACCESS = 'process_access'
}

/**
 * A detected prohibited API usage
 */
export interface DetectedProhibitedApi {
  type: ProhibitedApiType;
  category: ProhibitedApiCategory;
  line: number;
  column: number;
  code: string;
  context: string;
  severity: 'error' | 'warning';
}

/**
 * Configuration for static API checker
 */
export const StaticApiCheckerConfigSchema = z.object({
  /** Allowed filesystem paths (whitelist) - if empty, all paths allowed */
  allowedPaths: z.array(z.string()).optional(),
  /** Allowed network hosts (whitelist) - if empty, network access is fully restricted */
  allowedHosts: z.array(z.string()).optional(),
  /** Whether to allow child_process execution */
  allowChildProcess: z.boolean().optional(),
  /** Whether to allow filesystem access */
  allowFilesystem: z.boolean().optional(),
  /** Whether to allow network access */
  allowNetwork: z.boolean().optional(),
  /** Whether to allow code injection APIs (eval, Function) */
  allowCodeInjection: z.boolean().optional(),
  /** Whether to allow process access */
  allowProcessAccess: z.boolean().optional(),
  /** Project ID for event logging */
  projectId: z.string().optional(),
  /** Event logging enabled */
  eventLoggingEnabled: z.boolean().optional(),
  /** Path to events file */
  eventsFilePath: z.string().optional(),
  /** Custom event logger function */
  logEvent: z.function().optional()
});

export type StaticApiCheckerConfig = z.infer<typeof StaticApiCheckerConfigSchema>;

/**
 * Result of static API check
 */
export interface StaticApiCheckResult {
  valid: boolean;
  pluginId: string;
  pluginName: string;
  detectedApis: DetectedProhibitedApi[];
  hasErrors: boolean;
  hasWarnings: boolean;
  reason: 'valid' | 'prohibited_api_detected';
}

/**
 * Detailed result with parsed code information
 */
export interface StaticApiCheckDetailedResult extends StaticApiCheckResult {
  scannedFiles: string[];
  totalLines: number;
  scanDuration: number;
}

/**
 * Regex patterns for detecting prohibited APIs
 */
const PROHIBITED_PATTERNS: Array<{
  type: ProhibitedApiType;
  category: ProhibitedApiCategory;
  pattern: RegExp;
  severity: 'error' | 'warning';
  isOutOfBounds?: boolean;
  requiresPathAnalysis?: boolean;
}> = [
  // Child Process - Direct exec
  {
    type: ProhibitedApiType.CHILD_PROCESS_EXEC,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*exec\s*\()/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.CHILD_PROCESS_SPAWN,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*spawn\s*\()/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.CHILD_PROCESS_EXEC_SYNC,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*execSync\s*\()/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.CHILD_PROCESS_SPAWN_SYNC,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*spawnSync\s*\()/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.CHILD_PROCESS_FORK,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*fork\s*\()/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.CHILD_PROCESS_EXEC_FILE,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*execFile\s*\()/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.CHILD_PROCESS_EXEC_FILE_SYNC,
    category: ProhibitedApiCategory.CHILD_PROCESS,
    pattern: /(?:^|[.\s])(child_process\s*\.\s*execFileSync\s*\()/,
    severity: 'error'
  },
  
  // Filesystem - Direct access patterns
  {
    type: ProhibitedApiType.FS_READ_FILE,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*readFile\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*readFile\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_WRITE_FILE,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*writeFile\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*writeFile\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_RENAME,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*rename\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*rename\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_UNLINK,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*unlink\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*unlink\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_MKDIR,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*mkdir\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*mkdir\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_RMDIR,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*rmdir\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*rmdir\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_COPY_FILE,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*copyFile\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*copyFile\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_CREATE_READ_STREAM,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*createReadStream\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*createReadStream\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_CREATE_WRITE_STREAM,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*createWriteStream\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*createWriteStream\s*\()/,
    severity: 'error',
    requiresPathAnalysis: true
  },
  {
    type: ProhibitedApiType.FS_ACCESS,
    category: ProhibitedApiCategory.FILESYSTEM,
    pattern: /(?:^|[.\s])(?:fs\s*\.\s*access\s*\(|require\s*\(\s*['"]fs['"]\s*\)\s*\.\s*access\s*\()/,
    severity: 'warning',
    requiresPathAnalysis: true
  },
  
  // Network access patterns
  {
    type: ProhibitedApiType.NET_HTTP,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /(?:^|[.\s])(?:http\s*\.\s*request\s*\(|require\s*\(\s*['"]http['"]\s*\)\s*\.\s*request\s*\()/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_HTTPS,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /(?:^|[.\s])(?:https\s*\.\s*request\s*\(|require\s*\(\s*['"]https['"]\s*\)\s*\.\s*request\s*\()/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_NODE_HTTP,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /http\s*\.\s*get\s*\(/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_NODE_HTTPS,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /https\s*\.\s*get\s*\(/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_REQUEST,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /(?:^|[.\s])(?:net\s*\.\s*request\s*\(|require\s*\(\s*['"]net['"]\s*\)\s*\.\s*request\s*\()/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_CONNECT,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /(?:^|[.\s])(?:net\s*\.\s*connect\s*\(|require\s*\(\s*['"]net['"]\s*\)\s*\.\s*connect\s*\()/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_CREATE_CONNECTION,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /(?:^|[.\s])(?:net\s*\.\s*createConnection\s*\(|require\s*\(\s*['"]net['"]\s*\)\s*\.\s*createConnection\s*\()/,
    severity: 'error',
    isOutOfBounds: true
  },
  {
    type: ProhibitedApiType.NET_DGRAM,
    category: ProhibitedApiCategory.NETWORK,
    pattern: /(?:^|[.\s])(?:dgram\s*\.\s*createSocket\s*\(|require\s*\(\s*['"]dgram['"]\s*\)\s*\.\s*createSocket\s*\()/,
    severity: 'error',
    isOutOfBounds: true
  },
  
  // Code injection
  {
    type: ProhibitedApiType.DANGEROUS_EVAL,
    category: ProhibitedApiCategory.CODE_INJECTION,
    pattern: /(?:^|[^\w])eval\s*\(/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.DANGEROUS_FUNCTION,
    category: ProhibitedApiCategory.CODE_INJECTION,
    pattern: /(?:^|[^\w])Function\s*\(/,
    severity: 'error'
  },
  {
    type: ProhibitedApiType.DANGEROUS_SETTIMEOUT_STRING,
    category: ProhibitedApiCategory.CODE_INJECTION,
    pattern: /setTimeout\s*\(\s*(?:function|['"`]|await|async)/,
    severity: 'warning'
  },
  {
    type: ProhibitedApiType.DANGEROUS_SETINTERVAL_STRING,
    category: ProhibitedApiCategory.CODE_INJECTION,
    pattern: /setInterval\s*\(\s*(?:function|['"`]|await|async)/,
    severity: 'warning'
  },
  
  // Process access
  {
    type: ProhibitedApiType.PROCESS_ENV,
    category: ProhibitedApiCategory.PROCESS_ACCESS,
    pattern: /process\s*\.\s*env\s*\.\s*\w+/,
    severity: 'warning'
  },
  {
    type: ProhibitedApiType.PROCESS_STDIN,
    category: ProhibitedApiCategory.PROCESS_ACCESS,
    pattern: /process\s*\.\s*stdin/,
    severity: 'warning'
  },
  {
    type: ProhibitedApiType.PROCESS_STDOUT,
    category: ProhibitedApiCategory.PROCESS_ACCESS,
    pattern: /process\s*\.\s*stdout/,
    severity: 'warning'
  },
  {
    type: ProhibitedApiType.PROCESS_STDERR,
    category: ProhibitedApiCategory.PROCESS_ACCESS,
    pattern: /process\s*\.\s*stderr/,
    severity: 'warning'
  }
];

/**
 * Static API Checker
 * 
 * Scans plugin source code for prohibited API usage.
 * Implements Requirement 3.3 AC-3
 */
export class StaticApiChecker {
  private config: Required<StaticApiCheckerConfig>;
  
  constructor(config: StaticApiCheckerConfig = {}) {
    this.config = {
      allowedPaths: config.allowedPaths || [],
      allowedHosts: config.allowedHosts || [],
      allowChildProcess: config.allowChildProcess ?? false,
      allowFilesystem: config.allowFilesystem ?? false,
      allowNetwork: config.allowNetwork ?? false,
      allowCodeInjection: config.allowCodeInjection ?? false,
      allowProcessAccess: config.allowProcessAccess ?? false,
      projectId: config.projectId || 'default-project',
      eventLoggingEnabled: config.eventLoggingEnabled ?? true,
      eventsFilePath: config.eventsFilePath || './' + SPEC_DIR_NAME + '/logs/telemetry.jsonl',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      logEvent: config.logEvent || (async (_event: unknown) => { /* no-op */ })
    };
  }
  
  /**
   * Check source code for prohibited API usage
   * 
   * @param sourceCode Source code to scan
   * @param pluginId Plugin identifier
   * @param pluginName Plugin name
   * @returns Static API check result
   */
  check(sourceCode: string, pluginId: string, pluginName: string): StaticApiCheckResult {
    const detectedApis: DetectedProhibitedApi[] = [];
    
    // Skip empty source code
    if (!sourceCode || sourceCode.trim().length === 0) {
      return {
        valid: true,
        pluginId,
        pluginName,
        detectedApis: [],
        hasErrors: false,
        hasWarnings: false,
        reason: 'valid'
      };
    }
    
    const lines = sourceCode.split('\n');
    
    // Scan each line
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1; // 1-indexed
      
      // Check each pattern
      for (const patternDef of PROHIBITED_PATTERNS) {
        // Skip if category is allowed
        if (this.isCategoryAllowed(patternDef.category)) {
          continue;
        }
        
        // Create a global version of the regex for matchAll
        const globalPattern = new RegExp(patternDef.pattern.source, patternDef.pattern.flags + 'g');
        const matches = line.matchAll(globalPattern);
        for (const match of matches) {
          // Determine column number
          const column = match.index ?? 0;
          
          // Extract context (surrounding code)
          const startCol = Math.max(0, column - 20);
          const endCol = Math.min(line.length, column + match[0].length + 20);
          const context = line.substring(startCol, endCol);
          
          // Check if this is an out-of-bounds filesystem access
          let severity = patternDef.severity;
          if (patternDef.requiresPathAnalysis) {
            // For filesystem APIs, check if path is out of bounds
            if (this.isPathOutOfBounds(line)) {
              detectedApis.push({
                type: patternDef.type,
                category: patternDef.category,
                line: lineNumber,
                column: column + 1, // 1-indexed
                code: match[0],
                context: context.trim(),
                severity: 'error'
              });
            }
            // If path is within bounds, it's allowed - skip this detection
            continue;
          }
          
          // Check if this is an out-of-bounds network access
          if (patternDef.isOutOfBounds) {
            if (this.isNetworkOutOfBounds(line)) {
              detectedApis.push({
                type: patternDef.type,
                category: patternDef.category,
                line: lineNumber,
                column: column + 1,
                code: match[0],
                context: context.trim(),
                severity: 'error'
              });
            }
            continue;
          }
          
          detectedApis.push({
            type: patternDef.type,
            category: patternDef.category,
            line: lineNumber,
            column: column + 1,
            code: match[0],
            context: context.trim(),
            severity
          });
        }
      }
    }
    
    const hasErrors = detectedApis.some(api => api.severity === 'error');
    const hasWarnings = detectedApis.some(api => api.severity === 'warning');
    
    return {
      valid: !hasErrors,
      pluginId,
      pluginName,
      detectedApis,
      hasErrors,
      hasWarnings,
      reason: hasErrors ? 'prohibited_api_detected' : 'valid'
    };
  }
  
  /**
   * Check multiple source files
   * 
   * @param files Array of { filename, content } objects
   * @param pluginId Plugin identifier
   * @param pluginName Plugin name
   * @returns Detailed static API check result
   */
  checkMultipleFiles(
    files: Array<{ filename: string; content: string }>,
    pluginId: string,
    pluginName: string
  ): StaticApiCheckDetailedResult {
    const startTime = Date.now();
    const allDetectedApis: DetectedProhibitedApi[] = [];
    const scannedFiles: string[] = [];
    let totalLines = 0;
    
    for (const file of files) {
      scannedFiles.push(file.filename);
      totalLines += file.content.split('\n').length;
      
      const result = this.check(file.content, pluginId, pluginName);
      allDetectedApis.push(...result.detectedApis);
    }
    
    const hasErrors = allDetectedApis.some(api => api.severity === 'error');
    const hasWarnings = allDetectedApis.some(api => api.severity === 'warning');
    
    return {
      valid: !hasErrors,
      pluginId,
      pluginName,
      detectedApis: allDetectedApis,
      hasErrors,
      hasWarnings,
      reason: hasErrors ? 'prohibited_api_detected' : 'valid',
      scannedFiles,
      totalLines,
      scanDuration: Date.now() - startTime
    };
  }
  
  /**
   * Check if a category of API is allowed
   */
  private isCategoryAllowed(category: ProhibitedApiCategory): boolean {
    const allowChildProcess = this.config.allowChildProcess ?? false;
    const allowFilesystem = this.config.allowFilesystem ?? false;
    const allowNetwork = this.config.allowNetwork ?? false;
    const allowCodeInjection = this.config.allowCodeInjection ?? false;
    const allowProcessAccess = this.config.allowProcessAccess ?? false;
    
    switch (category) {
      case ProhibitedApiCategory.CHILD_PROCESS:
        return allowChildProcess;
      case ProhibitedApiCategory.FILESYSTEM:
        return allowFilesystem;
      case ProhibitedApiCategory.NETWORK:
        return allowNetwork;
      case ProhibitedApiCategory.CODE_INJECTION:
        return allowCodeInjection;
      case ProhibitedApiCategory.PROCESS_ACCESS:
        return allowProcessAccess;
      default:
        return false;
    }
  }
  
  /**
   * Check if a filesystem path is out of bounds
   * Returns true if the path access is prohibited
   */
  private isPathOutOfBounds(line: string): boolean {
    const allowedPaths = this.config.allowedPaths ?? [];
    
    // If no allowed paths configured, all filesystem access is considered out-of-bounds
    if (allowedPaths.length === 0) {
      return true;
    }
    
    // Try to extract path from the line
    const pathMatch = line.match(/['"]([^'"]+)['"]/);
    if (!pathMatch) {
      // Cannot determine path, treat as out-of-bounds
      return true;
    }
    
    const accessedPath = pathMatch[1];
    
    // Check if the accessed path is within any allowed path
    for (const allowedPath of allowedPaths) {
      if (this.isPathWithin(accessedPath, allowedPath)) {
        return false; // Within bounds
      }
    }
    
    return true; // Out of bounds
  }
  
  /**
   * Check if a path is within a directory
   */
  private isPathWithin(path: string, basePath: string): boolean {
    // Normalize paths
    const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '');
    
    // Check if path starts with base path
    return normalizedPath.startsWith(normalizedBase) || 
           normalizedPath.includes(`/${normalizedBase}/`) ||
           normalizedPath.includes(`\\${normalizedBase}\\`);
  }
  
  /**
   * Check if network access is out of bounds (unallowed host)
   * Returns true if the network access is prohibited
   */
  private isNetworkOutOfBounds(line: string): boolean {
    const allowedHosts = this.config.allowedHosts ?? [];
    
    // If no allowed hosts configured, all network access is considered undeclared
    if (allowedHosts.length === 0) {
      return true;
    }
    
    // Try to extract host from the line
    const hostMatch = line.match(/(?:https?:\/\/)([^/:\s]+)/);
    if (!hostMatch) {
      // Cannot determine host, treat as undeclared network access
      return true;
    }
    
    const accessedHost = hostMatch[1];
    
    // Check if the accessed host is in the allowed list
    for (const allowedHost of allowedHosts) {
      if (this.isHostAllowed(accessedHost, allowedHost)) {
        return false; // Allowed host
      }
    }
    
    return true; // Undeclared network access
  }
  
  /**
   * Check if a host matches an allowed pattern
   */
  private isHostAllowed(host: string, allowedPattern: string): boolean {
    // Support wildcard patterns like *.example.com
    if (allowedPattern.startsWith('*.')) {
      const suffix = allowedPattern.slice(2);
      return host.endsWith(suffix) || host === suffix.slice(1);
    }
    
    // Exact match
    return host === allowedPattern;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<StaticApiCheckerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      allowedPaths: config.allowedPaths !== undefined ? config.allowedPaths : this.config.allowedPaths,
      allowedHosts: config.allowedHosts !== undefined ? config.allowedHosts : this.config.allowedHosts
    };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): StaticApiCheckerConfig {
    return {
      allowedPaths: this.config.allowedPaths,
      allowedHosts: this.config.allowedHosts,
      allowChildProcess: this.config.allowChildProcess,
      allowFilesystem: this.config.allowFilesystem,
      allowNetwork: this.config.allowNetwork,
      allowCodeInjection: this.config.allowCodeInjection,
      allowProcessAccess: this.config.allowProcessAccess,
      projectId: this.config.projectId,
      eventLoggingEnabled: this.config.eventLoggingEnabled,
      eventsFilePath: this.config.eventsFilePath
    };
  }
  
  /**
   * Get all detected API types (for reporting)
   */
  static getProhibitedApiTypes(): Array<{ type: ProhibitedApiType; category: ProhibitedApiCategory }> {
    return PROHIBITED_PATTERNS.map(p => ({
      type: p.type,
      category: p.category
    }));
  }
}

/**
 * Create a static API checker with default restrictive configuration
 */
export function createRestrictiveStaticApiChecker(
  config?: StaticApiCheckerConfig
): StaticApiChecker {
  return new StaticApiChecker({
    allowChildProcess: false,
    allowFilesystem: false,
    allowNetwork: false,
    allowCodeInjection: false,
    allowProcessAccess: false,
    ...config
  });
}

/**
 * Create a static API checker that allows filesystem within specific directories
 */
export function createStaticApiCheckerWithFilesystem(
  allowedPaths: string[],
  config?: StaticApiCheckerConfig
): StaticApiChecker {
  return new StaticApiChecker({
    allowChildProcess: false,
    allowFilesystem: true,
    allowedPaths,
    allowNetwork: false,
    allowCodeInjection: false,
    allowProcessAccess: false,
    ...config
  });
}

/**
 * Create a static API checker that allows network to specific hosts
 */
export function createStaticApiCheckerWithNetwork(
  allowedHosts: string[],
  config?: StaticApiCheckerConfig
): StaticApiChecker {
  return new StaticApiChecker({
    allowChildProcess: false,
    allowFilesystem: false,
    allowNetwork: true,
    allowedHosts,
    allowCodeInjection: false,
    allowProcessAccess: false,
    ...config
  });
}

/**
 * Create a permissive static API checker (useful for testing)
 */
export function createPermissiveStaticApiChecker(
  config?: StaticApiCheckerConfig
): StaticApiChecker {
  return new StaticApiChecker({
    allowChildProcess: true,
    allowFilesystem: true,
    allowNetwork: true,
    allowCodeInjection: true,
    allowProcessAccess: true,
    ...config
  });
}