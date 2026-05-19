"use strict";
/**
 * REQ-25 Parser for Scope Gate Module
 *
 * Parses the REQ-25 section from the parent specification's requirements.md
 * to extract P0/P1/P2 capability lists.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Req25Parser = void 0;
/**
 * REQ-25 Parser class
 * Parses markdown to extract capability lists from REQ-25
 */
class Req25Parser {
    /**
     * Parse REQ-25 from markdown
     * @param markdown - The markdown content containing REQ-25
     * @returns Parsed REQ-25 data with P0/P1/P2 capability lists
     */
    parseReq25(markdown) {
        // Extract REQ-25 section
        const req25Section = this.extractReq25Section(markdown);
        if (!req25Section) {
            return this.createEmptyData();
        }
        // Parse each scope level
        const p0 = this.extractCapabilities(req25Section.p0Section, 'p0');
        const p1 = this.extractCapabilities(req25Section.p1Section, 'p1');
        const p2 = this.extractCapabilities(req25Section.p2Section, 'p2');
        // Generate source hash for change detection
        const sourceHash = this.generateHash(req25Section.rawSection);
        return {
            p0,
            p1,
            p2,
            lastUpdated: new Date(),
            sourceHash
        };
    }
    /**
     * Extract the REQ-25 section from markdown
     * @param markdown - Full markdown content
     * @returns Object containing raw sections for each scope level
     */
    extractReq25Section(markdown) {
        // Match REQ-25 section - look for various patterns that indicate the scope boundaries requirement
        const req25Patterns = [
            /#+\s*Requirement\s*25[:\s]/i,
            /V6\.0\s+开发范围边界/i,
            /P0\s*\/\s*P1\s*\/\s*P2/i,
            /开发范围边界.*P0.*P1.*P2/is
        ];
        let req25Start = -1;
        for (const pattern of req25Patterns) {
            const match = pattern.exec(markdown);
            if (match) {
                req25Start = match.index;
                break;
            }
        }
        if (req25Start === -1) {
            return null;
        }
        // Find the section boundaries
        const afterMatch = markdown.slice(req25Start);
        // Find the end of this requirement (next ### at heading level or ## Requirements or end)
        const nextSectionMatch = afterMatch.match(/\n#+\s+(?!Acceptance|Requirements)[A-Z]/);
        const endIndex = nextSectionMatch
            ? req25Start + (nextSectionMatch.index || 0)
            : markdown.length;
        const rawSection = markdown.slice(req25Start, endIndex);
        // Extract individual sections for each scope level
        const p0Section = this.extractScopeLevel(rawSection, '0');
        const p1Section = this.extractScopeLevel(rawSection, '1');
        const p2Section = this.extractScopeLevel(rawSection, '2');
        return {
            rawSection,
            p0Section,
            p1Section,
            p2Section
        };
    }
    /**
     * Extract a specific scope level section (P0, P1, or P2) from REQ-25
     */
    extractScopeLevel(section, level) {
        // The format in parent spec is:
        // 1. THE Requirements...P0 必做项（共 27 项），分组为：...
        // 2. THE Requirements...P1 项（共 15 项），包含...
        // 3. THE Requirements...P2 项，包含...
        // Find acceptance criteria number = level + 1
        const acNum = parseInt(level) + 1;
        // Pattern to match the specific acceptance criteria
        const acPattern = new RegExp(`^\\s*${acNum}\\.\\s+(.*?)(?=\\n\\s*${acNum + 1}\\.\\s+|\\n###|\\n##\\s+Notes|\\n##\\s+Glossary|$)`, 'is');
        const match = acPattern.exec(section);
        if (match) {
            return match[1];
        }
        // Fallback: try to find V6.x Px pattern
        const fallbackPatterns = [
            new RegExp(`V6\\.${level}\\s+P${level}[^.]*`, 'i'),
            new RegExp(`P${level}\\s+必做项|P${level}\\s+项|包含[^.]*P${level}`, 'i')
        ];
        for (const pattern of fallbackPatterns) {
            const fbMatch = pattern.exec(section);
            if (fbMatch) {
                const start = fbMatch.index;
                const remaining = section.slice(start);
                const nextAc = remaining.match(/\n\d+\.\s+THE\s+Requirements/i);
                return nextAc ? remaining.slice(0, nextAc.index) : remaining;
            }
        }
        return '';
    }
    /**
     * Extract capability definitions from list items
     * @param sectionText - The text containing capability list items
     * @param scopeTag - The scope tag (p0, p1, or p2)
     * @returns Array of capability definitions
     */
    extractCapabilities(sectionText, scopeTag) {
        if (!sectionText || !sectionText.trim()) {
            return [];
        }
        const capabilities = [];
        const seenIds = new Set();
        // Step 1: Find the list of capabilities
        // For P0 format: "分组为：- 基础设施（...）- 核心能力（..." 
        // For P1/P2 format: "包含 X、Y、Z"
        let listText = '';
        // Try "分组为" pattern first (for P0 which has grouped items with bullet points)
        const groupByMatch = sectionText.match(/分组为[:：]\s*([\s\S]*?)(?=\n\d+\.\s+THE|$)/i);
        if (groupByMatch) {
            // Extract items from bullet points in the grouped section
            const bulletItems = groupByMatch[1].match(/(?:^|\n)\s*[-•●]\s*([^\n（]+)/g);
            if (bulletItems) {
                listText = bulletItems
                    .map(m => {
                    // Remove bullet and parenthetical content
                    let item = m.replace(/^[-\s●●]\s*/, '').trim();
                    // Also extract items from within parentheses if they exist
                    const parenMatch = item.match(/[（(]([^）)]+)[）)]/);
                    if (parenMatch) {
                        item = parenMatch[1];
                    }
                    return item;
                })
                    .join('、');
            }
        }
        // Try "contains" patterns (for P1/P2)
        if (!listText) {
            const containsPatterns = [
                /包含[:：]\s*([^\n]+)/i,
                /包括[:：]\s*([^\n]+)/i
            ];
            for (const pattern of containsPatterns) {
                const match = pattern.exec(sectionText);
                if (match) {
                    listText = match[1];
                    break;
                }
            }
        }
        // If still no list, use the whole section text (after removing header)
        if (!listText) {
            listText = sectionText.replace(/^\s*\d+\.\s+THE\s+Requirements.*?(?: SHALL |should )/i, '');
        }
        // Step 2: Split by list separators
        const items = listText
            .split(/[、，。；：]/)
            .map(item => item.trim())
            .filter(item => item.length > 0);
        for (const itemText of items) {
            // Skip structural text
            if (/^THE\s+Requirements/i.test(itemText))
                continue;
            if (/^Acceptance\s+Criteria/i.test(itemText))
                continue;
            if (/^P\d+\s*必做项|^P\d+\s*项/i.test(itemText))
                continue;
            if (/^V\d+\.\d+/i.test(itemText))
                continue;
            if (/^\d+\.\s*THE/i.test(itemText))
                continue;
            if (/^分组为/i.test(itemText))
                continue;
            if (itemText.length < 2)
                continue;
            const id = this.normalizeCapabilityId(itemText);
            // Skip duplicates and empty IDs
            if (!id || seenIds.has(id))
                continue;
            seenIds.add(id);
            capabilities.push({
                id,
                displayName: itemText,
                scopeTag,
                entryPoints: [],
                dependencies: [],
                description: itemText
            });
        }
        return capabilities;
    }
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
    normalizeCapabilityId(rawName) {
        if (!rawName)
            return '';
        let normalized = rawName.trim();
        // Handle P0, P1, P2 prefixes (standalone)
        if (/^P[012]$/i.test(normalized)) {
            return normalized.toLowerCase();
        }
        // Remove common prefix words that shouldn't be part of the ID
        normalized = normalized.replace(/^(包含|包括|分组为)\s*/i, '');
        // Remove parenthetical content - handle Chinese （） and English ()
        // First, handle nested parentheses by processing from inside out
        while (/[（(][^)）]+[)）]/.test(normalized)) {
            normalized = normalized.replace(/[（(][^)）]+[)）]/g, '');
        }
        // Also handle patterns like "（...、...、...，共 X 项）" at end of items
        normalized = normalized.replace(/\s*[（(][^)）]*\d+[^）)]*[)）]/gi, '');
        // Replace Chinese punctuation with spaces
        normalized = normalized.replace(/[、，。；：]/g, ' ');
        // Handle + / _ 
        normalized = normalized
            .replace(/\+/g, ' ')
            .replace(/\//g, ' ')
            .replace(/_/g, ' ');
        // Convert to lowercase
        normalized = normalized.toLowerCase();
        // Replace spaces with hyphens
        normalized = normalized
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return normalized;
    }
    /**
     * Generate a simple hash for change detection
     */
    generateHash(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    /**
     * Create empty data structure
     */
    createEmptyData() {
        return {
            p0: [],
            p1: [],
            p2: [],
            lastUpdated: new Date(),
            sourceHash: ''
        };
    }
}
exports.Req25Parser = Req25Parser;
//# sourceMappingURL=req25-parser.js.map