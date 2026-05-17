/**
 * Unit Tests for DiagnosisReport Data Model
 *
 * Tests cover:
 * - Report creation and factory functions
 * - Serialization/deserialization round-trip
 * - Validation logic
 * - Helper functions
 *
 * Validates: Requirements SH-3, SH-4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  DiagnosisReport,
  DiagnosticEvidence,
  RecommendedAction,
  ConfidenceLevel,
  RiskTier,
  EvidenceSource,
  createDiagnosisReport,
  createDiagnosticEvidence,
  createRecommendedAction,
  serializeDiagnosisReport,
  deserializeDiagnosisReport,
  validateDiagnosisReport,
  getActionsByRiskTier,
  getDiagnosisReportSummary,
} from '../src/diagnosis-report';

describe('DiagnosisReport Data Model', () => {
  describe('Factory Functions', () => {
    describe('createDiagnosticEvidence', () => {
      it('should create evidence with required fields', () => {
        const evidence = createDiagnosticEvidence({
          source: 'events',
          blobRef: 'blob://abc123',
          description: 'Test evidence',
        });

        expect(evidence.source).toBe('events');
        expect(evidence.blobRef).toBe('blob://abc123');
        expect(evidence.description).toBe('Test evidence');
        expect(evidence.collectedAt).toBeDefined();
        expect(typeof evidence.collectedAt).toBe('number');
      });

      it('should include optional fields when provided', () => {
        const now = Date.now();
        const evidence = createDiagnosticEvidence({
          source: 'state',
          blobRef: 'blob://def456',
          description: 'State evidence',
          confidence: 0.85,
          collectedAt: now,
        });

        expect(evidence.confidence).toBe(0.85);
        expect(evidence.collectedAt).toBe(now);
      });

      it('should support all evidence sources', () => {
        const sources: EvidenceSource[] = ['events', 'state', 'artifacts', 'analysis'];

        for (const source of sources) {
          const evidence = createDiagnosticEvidence({
            source,
            blobRef: `blob://${source}`,
            description: `${source} evidence`,
          });
          expect(evidence.source).toBe(source);
        }
      });
    });

    describe('createRecommendedAction', () => {
      it('should create action with required fields', () => {
        const action = createRecommendedAction({
          action: 'Add missing section',
          riskTier: 'L1',
          description: 'Add missing requirements section',
        });

        expect(action.id).toBeDefined();
        expect(action.action).toBe('Add missing section');
        expect(action.riskTier).toBe('L1');
        expect(action.description).toBe('Add missing requirements section');
      });

      it('should generate unique IDs for each action', () => {
        const action1 = createRecommendedAction({
          action: 'Action 1',
          riskTier: 'L1',
          description: 'Description 1',
        });

        const action2 = createRecommendedAction({
          action: 'Action 2',
          riskTier: 'L1',
          description: 'Description 2',
        });

        expect(action1.id).not.toBe(action2.id);
      });

      it('should include optional fields when provided', () => {
        const action = createRecommendedAction({
          action: 'Fix formatting',
          riskTier: 'L2',
          description: 'Fix markdown formatting',
          estimatedEffort: 15,
          preconditions: ['Backup required'],
          expectedOutcome: 'Valid markdown',
        });

        expect(action.estimatedEffort).toBe(15);
        expect(action.preconditions).toEqual(['Backup required']);
        expect(action.expectedOutcome).toBe('Valid markdown');
      });

      it('should support all risk tiers', () => {
        const tiers: RiskTier[] = ['L1', 'L2', 'L3'];

        for (const tier of tiers) {
          const action = createRecommendedAction({
            action: `Action for ${tier}`,
            riskTier: tier,
            description: `Description for ${tier}`,
          });
          expect(action.riskTier).toBe(tier);
        }
      });
    });

    describe('createDiagnosisReport', () => {
      let evidence: DiagnosticEvidence[];
      let actions: RecommendedAction[];

      beforeEach(() => {
        evidence = [
          createDiagnosticEvidence({
            source: 'events',
            blobRef: 'blob://ev1',
            description: 'Event evidence',
          }),
        ];

        actions = [
          createRecommendedAction({
            action: 'Add section',
            riskTier: 'L1',
            description: 'Add missing section',
          }),
        ];
      });

      it('should create report with required fields', () => {
        const report = createDiagnosisReport({
          workItemId: 'wi-123',
          rootCause: 'Missing requirements section',
          confidence: 'high',
          evidence,
          recommendedActions: actions,
        });

        expect(report.schema_version).toBe('1.0');
        expect(report.reportId).toBeDefined();
        expect(report.workItemId).toBe('wi-123');
        expect(report.rootCause).toBe('Missing requirements section');
        expect(report.confidence).toBe('high');
        expect(report.evidence).toEqual(evidence);
        expect(report.recommendedActions).toEqual(actions);
        expect(report.generatedAt).toBeDefined();
        expect(typeof report.generatedAt).toBe('number');
      });

      it('should generate unique report IDs', () => {
        const report1 = createDiagnosisReport({
          workItemId: 'wi-1',
          rootCause: 'Cause 1',
          confidence: 'high',
          evidence,
          recommendedActions: actions,
        });

        const report2 = createDiagnosisReport({
          workItemId: 'wi-2',
          rootCause: 'Cause 2',
          confidence: 'medium',
          evidence,
          recommendedActions: actions,
        });

        expect(report1.reportId).not.toBe(report2.reportId);
      });

      it('should include optional fields when provided', () => {
        const report = createDiagnosisReport({
          workItemId: 'wi-123',
          rootCause: 'Root cause',
          confidence: 'medium',
          evidence,
          recommendedActions: actions,
          iteration: 2,
          notes: 'Second attempt',
          analysisDataRef: 'blob://analysis',
        });

        expect(report.iteration).toBe(2);
        expect(report.notes).toBe('Second attempt');
        expect(report.analysisDataRef).toBe('blob://analysis');
      });

      it('should support all confidence levels', () => {
        const levels: ConfidenceLevel[] = ['high', 'medium', 'low'];

        for (const level of levels) {
          const report = createDiagnosisReport({
            workItemId: 'wi-test',
            rootCause: 'Test cause',
            confidence: level,
            evidence,
            recommendedActions: actions,
          });
          expect(report.confidence).toBe(level);
        }
      });
    });
  });

  describe('Serialization and Deserialization', () => {
    let report: DiagnosisReport;

    beforeEach(() => {
      const evidence = [
        createDiagnosticEvidence({
          source: 'events',
          blobRef: 'blob://ev1',
          description: 'Event evidence',
          confidence: 0.9,
        }),
        createDiagnosticEvidence({
          source: 'state',
          blobRef: 'blob://state1',
          description: 'State evidence',
        }),
      ];

      const actions = [
        createRecommendedAction({
          action: 'Add section',
          riskTier: 'L1',
          description: 'Add missing section',
          estimatedEffort: 10,
        }),
        createRecommendedAction({
          action: 'Fix formatting',
          riskTier: 'L2',
          description: 'Fix markdown',
        }),
      ];

      report = createDiagnosisReport({
        workItemId: 'wi-123',
        rootCause: 'Missing requirements',
        confidence: 'high',
        evidence,
        recommendedActions: actions,
        iteration: 1,
        notes: 'First diagnosis',
      });
    });

    it('should serialize report to JSON string', () => {
      const json = serializeDiagnosisReport(report);

      expect(typeof json).toBe('string');
      expect(json).toContain('"schema_version":"1.0"');
      expect(json).toContain(report.reportId);
      expect(json).toContain(report.workItemId);
    });

    it('should deserialize JSON string back to report', () => {
      const json = serializeDiagnosisReport(report);
      const deserialized = deserializeDiagnosisReport(json);

      expect(deserialized.schema_version).toBe('1.0');
      expect(deserialized.reportId).toBe(report.reportId);
      expect(deserialized.workItemId).toBe(report.workItemId);
      expect(deserialized.rootCause).toBe(report.rootCause);
      expect(deserialized.confidence).toBe(report.confidence);
      expect(deserialized.evidence.length).toBe(report.evidence.length);
      expect(deserialized.recommendedActions.length).toBe(report.recommendedActions.length);
    });

    it('should preserve all fields in round-trip serialization', () => {
      const json = serializeDiagnosisReport(report);
      const deserialized = deserializeDiagnosisReport(json);

      expect(deserialized).toEqual(report);
    });

    it('should throw error on invalid JSON', () => {
      expect(() => deserializeDiagnosisReport('invalid json')).toThrow();
    });

    it('should throw error on missing schema_version', () => {
      const json = JSON.stringify({
        reportId: 'test',
        workItemId: 'wi-123',
        rootCause: 'Test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
        generatedAt: Date.now(),
      });

      expect(() => deserializeDiagnosisReport(json)).toThrow('schema_version');
    });

    it('should throw error on wrong schema_version', () => {
      const json = JSON.stringify({
        schema_version: '2.0',
        reportId: 'test',
        workItemId: 'wi-123',
        rootCause: 'Test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
        generatedAt: Date.now(),
      });

      expect(() => deserializeDiagnosisReport(json)).toThrow('schema_version');
    });

    it('should throw error on missing required fields', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        reportId: 'test',
        // Missing workItemId
        rootCause: 'Test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
        generatedAt: Date.now(),
      });

      expect(() => deserializeDiagnosisReport(json)).toThrow('workItemId');
    });

    it('should throw error on invalid confidence level', () => {
      const json = JSON.stringify({
        schema_version: '1.0',
        reportId: 'test',
        workItemId: 'wi-123',
        rootCause: 'Test',
        confidence: 'invalid',
        evidence: [],
        recommendedActions: [],
        generatedAt: Date.now(),
      });

      expect(() => deserializeDiagnosisReport(json)).toThrow('confidence');
    });
  });

  describe('Validation', () => {
    let validReport: DiagnosisReport;

    beforeEach(() => {
      const evidence = [
        createDiagnosticEvidence({
          source: 'events',
          blobRef: 'blob://ev1',
          description: 'Event evidence',
        }),
      ];

      const actions = [
        createRecommendedAction({
          action: 'Add section',
          riskTier: 'L1',
          description: 'Add missing section',
        }),
      ];

      validReport = createDiagnosisReport({
        workItemId: 'wi-123',
        rootCause: 'Missing requirements',
        confidence: 'high',
        evidence,
        recommendedActions: actions,
      });
    });

    it('should validate a correct report', () => {
      const errors = validateDiagnosisReport(validReport);
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid schema_version', () => {
      const report = { ...validReport, schema_version: '2.0' as any };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('schema_version'))).toBe(true);
    });

    it('should detect empty reportId', () => {
      const report = { ...validReport, reportId: '' };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('reportId'))).toBe(true);
    });

    it('should detect empty workItemId', () => {
      const report = { ...validReport, workItemId: '' };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('workItemId'))).toBe(true);
    });

    it('should detect empty rootCause', () => {
      const report = { ...validReport, rootCause: '' };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('rootCause'))).toBe(true);
    });

    it('should detect invalid confidence level', () => {
      const report = { ...validReport, confidence: 'invalid' as any };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('confidence'))).toBe(true);
    });

    it('should detect empty evidence array', () => {
      const report = { ...validReport, evidence: [] };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('evidence'))).toBe(true);
    });

    it('should detect empty recommendedActions array', () => {
      const report = { ...validReport, recommendedActions: [] };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('recommendedActions'))).toBe(true);
    });

    it('should detect invalid evidence confidence', () => {
      const report = {
        ...validReport,
        evidence: [
          {
            ...validReport.evidence[0],
            confidence: 1.5,
          },
        ],
      };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('confidence'))).toBe(true);
    });

    it('should detect invalid risk tier', () => {
      const report = {
        ...validReport,
        recommendedActions: [
          {
            ...validReport.recommendedActions[0],
            riskTier: 'L4' as any,
          },
        ],
      };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('riskTier'))).toBe(true);
    });

    it('should detect invalid iteration', () => {
      const report = { ...validReport, iteration: 5 };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('iteration'))).toBe(true);
    });

    it('should detect invalid generatedAt', () => {
      const report = { ...validReport, generatedAt: -1 };
      const errors = validateDiagnosisReport(report);
      expect(errors.some((e) => e.includes('generatedAt'))).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    let report: DiagnosisReport;

    beforeEach(() => {
      const evidence = [
        createDiagnosticEvidence({
          source: 'events',
          blobRef: 'blob://ev1',
          description: 'Event evidence',
        }),
      ];

      const actions = [
        createRecommendedAction({
          action: 'L1 Action 1',
          riskTier: 'L1',
          description: 'First L1 action',
        }),
        createRecommendedAction({
          action: 'L1 Action 2',
          riskTier: 'L1',
          description: 'Second L1 action',
        }),
        createRecommendedAction({
          action: 'L2 Action',
          riskTier: 'L2',
          description: 'L2 action',
        }),
        createRecommendedAction({
          action: 'L3 Action',
          riskTier: 'L3',
          description: 'L3 action',
        }),
      ];

      report = createDiagnosisReport({
        workItemId: 'wi-123',
        rootCause: 'Test cause',
        confidence: 'high',
        evidence,
        recommendedActions: actions,
      });
    });

    describe('getActionsByRiskTier', () => {
      it('should return all L1 actions', () => {
        const l1Actions = getActionsByRiskTier(report, 'L1');
        expect(l1Actions).toHaveLength(2);
        expect(l1Actions.every((a) => a.riskTier === 'L1')).toBe(true);
      });

      it('should return all L2 actions', () => {
        const l2Actions = getActionsByRiskTier(report, 'L2');
        expect(l2Actions).toHaveLength(1);
        expect(l2Actions[0].riskTier).toBe('L2');
      });

      it('should return all L3 actions', () => {
        const l3Actions = getActionsByRiskTier(report, 'L3');
        expect(l3Actions).toHaveLength(1);
        expect(l3Actions[0].riskTier).toBe('L3');
      });

      it('should return empty array for tier with no actions', () => {
        const reportNoL3 = {
          ...report,
          recommendedActions: report.recommendedActions.filter((a) => a.riskTier !== 'L3'),
        };
        const l3Actions = getActionsByRiskTier(reportNoL3, 'L3');
        expect(l3Actions).toHaveLength(0);
      });
    });

    describe('getDiagnosisReportSummary', () => {
      it('should return correct total evidence count', () => {
        const summary = getDiagnosisReportSummary(report);
        expect(summary.totalEvidence).toBe(1);
      });

      it('should return correct total actions count', () => {
        const summary = getDiagnosisReportSummary(report);
        expect(summary.totalActions).toBe(4);
      });

      it('should return correct actions by tier', () => {
        const summary = getDiagnosisReportSummary(report);
        expect(summary.actionsByTier.L1).toBe(2);
        expect(summary.actionsByTier.L2).toBe(1);
        expect(summary.actionsByTier.L3).toBe(1);
      });

      it('should calculate average evidence confidence', () => {
        const evidence = [
          createDiagnosticEvidence({
            source: 'events',
            blobRef: 'blob://ev1',
            description: 'Evidence 1',
            confidence: 0.8,
          }),
          createDiagnosticEvidence({
            source: 'state',
            blobRef: 'blob://ev2',
            description: 'Evidence 2',
            confidence: 0.6,
          }),
        ];

        const reportWithConfidence = createDiagnosisReport({
          workItemId: 'wi-123',
          rootCause: 'Test',
          confidence: 'high',
          evidence,
          recommendedActions: report.recommendedActions,
        });

        const summary = getDiagnosisReportSummary(reportWithConfidence);
        expect(summary.averageEvidenceConfidence).toBe(0.7);
      });

      it('should handle evidence without confidence', () => {
        const summary = getDiagnosisReportSummary(report);
        expect(summary.averageEvidenceConfidence).toBe(0);
      });
    });
  });

  describe('Property-Based Tests', () => {
    it('Property 8: Serialization Round-trip - should preserve all data', () => {
      fc.assert(
        fc.property(
          fc.record({
            workItemId: fc.string({ minLength: 1 }),
            rootCause: fc.string({ minLength: 1 }),
            confidence: fc.constantFrom<ConfidenceLevel>('high', 'medium', 'low'),
            iteration: fc.option(fc.integer({ min: 1, max: 3 })),
            notes: fc.option(fc.string()),
          }),
          (params) => {
            const evidence = [
              createDiagnosticEvidence({
                source: 'events',
                blobRef: 'blob://test',
                description: 'Test evidence',
              }),
            ];

            const actions = [
              createRecommendedAction({
                action: 'Test action',
                riskTier: 'L1',
                description: 'Test description',
              }),
            ];

            const original = createDiagnosisReport({
              workItemId: params.workItemId,
              rootCause: params.rootCause,
              confidence: params.confidence,
              evidence,
              recommendedActions: actions,
              iteration: params.iteration ?? undefined,
              notes: params.notes ?? undefined,
            });

            const json = serializeDiagnosisReport(original);
            const deserialized = deserializeDiagnosisReport(json);

            return (
              deserialized.reportId === original.reportId &&
              deserialized.workItemId === original.workItemId &&
              deserialized.rootCause === original.rootCause &&
              deserialized.confidence === original.confidence &&
              deserialized.iteration === original.iteration &&
              deserialized.notes === original.notes &&
              deserialized.evidence.length === original.evidence.length &&
              deserialized.recommendedActions.length === original.recommendedActions.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate all generated reports', () => {
      fc.assert(
        fc.property(
          fc.record({
            workItemId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            rootCause: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            confidence: fc.constantFrom<ConfidenceLevel>('high', 'medium', 'low'),
          }),
          (params) => {
            const evidence = [
              createDiagnosticEvidence({
                source: 'events',
                blobRef: 'blob://test',
                description: 'Test evidence',
              }),
            ];

            const actions = [
              createRecommendedAction({
                action: 'Test action',
                riskTier: 'L1',
                description: 'Test description',
              }),
            ];

            const report = createDiagnosisReport({
              workItemId: params.workItemId,
              rootCause: params.rootCause,
              confidence: params.confidence,
              evidence,
              recommendedActions: actions,
            });

            const errors = validateDiagnosisReport(report);
            return errors.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
