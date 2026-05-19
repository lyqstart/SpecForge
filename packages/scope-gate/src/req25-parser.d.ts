/**
 * REQ-25 Parser for Scope Gate Module
 *
 * Parses the REQ-25 section from the parent specification's requirements.md
 * to extract P0/P1/P2 capability lists.
 */
import type { CapabilityDefinition, ScopeTag } from './types.js';
/**
 * Interface for parsed REQ-25 data
 */
export interface Req25Data {
    p0: CapabilityDefinition[];
    p1: CapabilityDefinition[];
    p2: CapabilityDefinition[];
    lastUpdated: Date;
    sourceHash: string;
}
/**
 * REQ-25 Parser class
 * Parses markdown to extract capability lists from REQ-25
 */
export declare class Req25Parser {
    /**
     * Parse REQ-25 from markdown
     * @param markdown - The markdown content containing REQ-25
     * @returns Parsed REQ-25 data with P0/P1/P2 capability lists
     */
    parseReq25(markdown: string): Req25Data;
    /**
     * Extract the REQ-25 section from markdown
     * @param markdown - Full markdown content
     * @returns Object containing raw sections for each scope level
     */
    private extractReq25Section;
    /**
     * Extract a specific scope level section (P0, P1, or P2) from REQ-25
     */
    private extractScopeLevel;
    /**
     * Extract capability definitions from list items
     * @param sectionText - The text containing capability list items
     * @param scopeTag - The scope tag (p0, p1, or p2)
     * @returns Array of capability definitions
     */
    extractCapabilities(sectionText: string, scopeTag: ScopeTag): CapabilityDefinition[];
    /**
     * Normalize capability ID to a consistent format
     * Examples:
     *   "P1" → "p1"
     *   "bugfix workflow" → "bugfix-workflow"
     *   "Knowledge Graph" → "knowledge-graph"
     *   "全局知识库 + sf-knowledge" → "全局知识库-sf-knowledge"
     *
     * @param rawName - The raw capability name from markdown
     * @returns Normalized capability ID
     */
    normalizeCapabilityId(rawName: string): string;
    /**
     * Generate a simple hash for change detection
     */
    private generateHash;
    /**
     * Create empty data structure
     */
    private createEmptyData;
}
//# sourceMappingURL=req25-parser.d.ts.map