/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Path Service
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import { describe, it, expect } from 'vitest';
import { PathService } from '@/v11/runtime/PathService';

describe('PathService', () => {
  const ps = new PathService('/project');

  describe('Project spec paths', () => {
    it('should generate specDir path', () => {
      expect(ps.specDir()).toBe('/project/.specforge');
    });

    it('should generate projectDir path', () => {
      expect(ps.projectDir()).toBe('/project/.specforge/project');
    });

    it('should generate specManifestPath', () => {
      expect(ps.specManifestPath()).toBe('/project/.specforge/project/spec_manifest.json');
    });

    it('should generate extensionRegistryPath', () => {
      expect(ps.extensionRegistryPath()).toBe('/project/.specforge/project/extension_registry.json');
    });

    it('should generate requirementsIndexPath', () => {
      expect(ps.requirementsIndexPath()).toBe('/project/.specforge/project/requirements_index.md');
    });

    it('should generate designIndexPath', () => {
      expect(ps.designIndexPath()).toBe('/project/.specforge/project/design_index.md');
    });

    it('should generate architecturePath', () => {
      expect(ps.architecturePath()).toBe('/project/.specforge/project/architecture.md');
    });

    it('should generate glossaryPath', () => {
      expect(ps.glossaryPath()).toBe('/project/.specforge/project/glossary.md');
    });

    it('should generate decisionsPath', () => {
      expect(ps.decisionsPath()).toBe('/project/.specforge/project/decisions.md');
    });

    it('should generate traceMatrixPath', () => {
      expect(ps.traceMatrixPath()).toBe('/project/.specforge/project/trace_matrix.md');
    });

    it('should generate modulesDir', () => {
      expect(ps.modulesDir()).toBe('/project/.specforge/project/modules');
    });

    it('should generate moduleDir with name', () => {
      expect(ps.moduleDir('AUTH')).toBe('/project/.specforge/project/modules/AUTH');
    });

    it('should generate moduleJsonPath', () => {
      expect(ps.moduleJsonPath('AUTH')).toBe('/project/.specforge/project/modules/AUTH/module.json');
    });

    it('should generate moduleRequirementsPath', () => {
      expect(ps.moduleRequirementsPath('AUTH')).toBe('/project/.specforge/project/modules/AUTH/requirements.md');
    });

    it('should generate moduleDesignPath', () => {
      expect(ps.moduleDesignPath('AUTH')).toBe('/project/.specforge/project/modules/AUTH/design.md');
    });
  });

  describe('Work item paths', () => {
    it('should generate workItemsDir', () => {
      expect(ps.workItemsDir()).toBe('/project/.specforge/work-items');
    });

    it('should generate workItemDir', () => {
      expect(ps.workItemDir('WI-0001')).toBe('/project/.specforge/work-items/WI-0001');
    });

    it('should generate workItemMetadataPath', () => {
      expect(ps.workItemMetadataPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/work_item.json');
    });

    it('should generate candidatesDir', () => {
      expect(ps.candidatesDir('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/candidates');
    });

    it('should generate candidatePath', () => {
      expect(ps.candidatePath('WI-0001', 'requirements.md')).toBe('/project/.specforge/work-items/WI-0001/candidates/requirements.md');
    });

    it('should generate candidateManifestPath', () => {
      expect(ps.candidateManifestPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/candidate_manifest.json');
    });

    it('should generate gatesDir', () => {
      expect(ps.gatesDir('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/gates');
    });

    it('should generate gatePath', () => {
      expect(ps.gatePath('WI-0001', 'entry_gate')).toBe('/project/.specforge/work-items/WI-0001/gates/entry_gate.json');
    });

    it('should generate gateSummaryPath', () => {
      expect(ps.gateSummaryPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/gate_summary.md');
    });

    it('should generate userDecisionPath', () => {
      expect(ps.userDecisionPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/user_decision.json');
    });

    it('should generate mergeReportPath', () => {
      expect(ps.mergeReportPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/merge_report.md');
    });

    it('should generate verificationReportPath', () => {
      expect(ps.verificationReportPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/verification_report.md');
    });

    it('should generate evidenceDir', () => {
      expect(ps.evidenceDir('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/evidence');
    });

    it('should generate evidenceManifestPath', () => {
      expect(ps.evidenceManifestPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/evidence/evidence_manifest.json');
    });

    it('should generate extensionRequestPath', () => {
      expect(ps.extensionRequestPath('WI-0001')).toBe('/project/.specforge/work-items/WI-0001/extension_request.json');
    });
  });

  describe('Runtime paths', () => {
    it('should generate runtimeDir', () => {
      expect(ps.runtimeDir()).toBe('/project/.specforge/runtime');
    });

    it('should generate runtimeStatePath', () => {
      expect(ps.runtimeStatePath()).toBe('/project/.specforge/runtime/state.json');
    });

    it('should generate runtimeEventsPath', () => {
      expect(ps.runtimeEventsPath()).toBe('/project/.specforge/runtime/events.jsonl');
    });

    it('should generate runtimeCheckpointPath', () => {
      expect(ps.runtimeCheckpointPath('cp-001')).toBe('/project/.specforge/runtime/checkpoints/cp-001');
    });

    it('should generate runtimeLogsDir', () => {
      expect(ps.runtimeLogsDir()).toBe('/project/.specforge/runtime/logs');
    });

    it('should generate runtimeWalPath', () => {
      expect(ps.runtimeWalPath()).toBe('/project/.specforge/runtime/wal.jsonl');
    });
  });

  describe('Path helpers', () => {
    it('should detect legacy spec paths', () => {
      expect(ps.isLegacySpecPath('.specforge/specs/some/file.md')).toBe(true);
      expect(ps.isLegacySpecPath('specs/some/file.md')).toBe(false);
      expect(ps.isLegacySpecPath('.specforge/project/specs.md')).toBe(false);
    });

    it('should detect project spec paths', () => {
      expect(ps.isProjectSpecPath('.specforge/project/requirements.md')).toBe(true);
      expect(ps.isProjectSpecPath('project/requirements.md')).toBe(false);
      expect(ps.isProjectSpecPath('.specforge/work-items/WI-0001')).toBe(false);
    });

    it('should detect work item paths', () => {
      expect(ps.isWorkItemPath('.specforge/work-items/WI-0001')).toBe(true);
      expect(ps.isWorkItemPath('work-items/WI-0001')).toBe(false);
      expect(ps.isWorkItemPath('.specforge/project/req.md')).toBe(false);
    });
  });

  describe('Paths use POSIX forward slashes', () => {
    it('should never contain backslashes', () => {
      const allPaths = [
        ps.specDir(),
        ps.projectDir(),
        ps.specManifestPath(),
        ps.workItemsDir(),
        ps.workItemDir('WI-0001'),
        ps.runtimeDir(),
        ps.runtimeStatePath(),
        ps.candidatePath('WI-0001', 'test.md'),
        ps.gatePath('WI-0001', 'entry_gate'),
      ];

      for (const p of allPaths) {
        expect(p).not.toContain('\\');
      }
    });
  });
});
