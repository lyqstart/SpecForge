/** D23 Runtime owner. No workflow transitions and no business/code writes. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ToolInvocationVerifier,
  TrustedToolInvocationProof,
} from '@specforge/types/trusted-tool-invocation';
import type { ToolDeps, ToolInvokeRequest } from '../tools/ToolDispatcher';
import { captureVerificationAuthority, type VerificationTaskSelector } from './authority-snapshot';
import { collectNodeCommandInputs, compileNodeCommand } from './node-command-contract';
import {
  VerificationOwnerStore,
  assertVerificationPath,
  canonicalVerificationJson as json,
  readVerificationFile,
  verificationId as hash,
} from './owner-store';
import { captureVerificationSource, readFrozenVerificationInputs } from './source-snapshot';
import {
  captureFilesystemSource,
  verificationSourceMode,
  filesystemSourceReader,
  readFilesystemInputs,
} from './filesystem-source';
import { loadVerificationAssets } from './verification-assets';
import {
  VerificationNativeExecutor,
  nativeConfigPath,
  nativeRunRoot,
  requestVerificationCancellation,
  writeVerificationPrivate,
  type NativeExecutionFacts,
} from './native-executor';
import { VerificationInvocationLease } from './invocation-lease';
import {
  verificationRejectionDiagnostic,
  tagVerificationRejection,
  verificationPublicRejection,
} from './rejection-diagnostic';
import {
  validateVerificationPlan,
  validateVerificationAttempt,
  validateVerificationReceipt,
  validateVerificationInvocationLease,
  validateTrustedInvocationProof,
  verificationRecord as record,
  verificationRequire as requireFact,
  verificationHash,
  sameVerificationPath,
} from './verification-schema';
import {
  VERIFICATION_PLAN_CONTRACT,
  VERIFICATION_RECEIPT_CONTRACT,
  VERIFICATION_PROFILE,
  VERIFICATION_BUDGET,
  type VerificationPlan,
  type VerificationAttempt,
  type VerificationExecutionReceipt,
  type VerificationAssets,
} from './verification-plan';

type Context = ToolInvokeRequest['context'];
type Dependencies = Pick<ToolDeps, 'projectManager' | 'stateManager'>;
const ownId = (proof: TrustedToolInvocationProof) =>
  hash(json([proof.sessionId, proof.messageId, proof.callId]));
const errorCode = (error: unknown) =>
  error instanceof Error && /^VERIFICATION_[A-Z_]+$/.test(error.message)
    ? error.message
    : 'VERIFICATION_OPERATION_FAILED';

export class VerificationRuntime {
  readonly native: VerificationNativeExecutor;
  private readonly activeAttempts = new Map<string, VerificationAttempt>();
  private readonly activeOperations = new Set<Promise<unknown>>();
  private stopping = false;
  constructor(
    readonly deps: Dependencies,
    readonly runtime: ToolInvocationVerifier,
    readonly store = new VerificationOwnerStore(),
    readonly readAssets: () => Promise<VerificationAssets> = loadVerificationAssets
  ) {
    this.native = new VerificationNativeExecutor(store.root);
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    await Promise.all(
      [...this.activeAttempts.values()].map(attempt =>
        requestVerificationCancellation(this.store.root, attempt)
      )
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.activeOperations]),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(Error('VERIFICATION_SHUTDOWN_UNPROVED')), 30000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private project(context: Context): string {
    const root = context?.directory;
    requireFact(typeof root === 'string' && path.isAbsolute(root), 'PROJECT_CONTEXT_REQUIRED');
    return path.resolve(root);
  }
  private async owner(
    tool: 'sf_verification_plan' | 'sf_verification_run',
    args: Record<string, unknown>,
    context: Context
  ): Promise<TrustedToolInvocationProof> {
    const directory = this.project(context);
    requireFact(
      typeof context?.sessionID === 'string' && typeof context?.messageID === 'string',
      'ACTUAL_INVOCATION_REQUIRED'
    );
    const proof = await this.runtime.verifyToolInvocation({
      tool,
      args,
      directory,
      sessionId: context.sessionID,
      messageId: context.messageID,
    });
    validateTrustedInvocationProof(
      proof,
      tool === 'sf_verification_plan' ? 'sf-orchestrator' : 'sf-verifier'
    );
    requireFact(
      proof.tool === tool &&
        proof.sessionId === context.sessionID &&
        proof.messageId === context.messageID &&
        sameVerificationPath(proof.directory, directory) &&
        proof.inputSha256 === hash(json(args)) &&
        Date.now() - proof.startedAt <= 300000 &&
        Date.now() >= proof.startedAt,
      'ACTUAL_INVOCATION_MISMATCH'
    );
    return proof;
  }
  private async claim(
    proof: TrustedToolInvocationProof,
    operation: string,
    detail: Record<string, unknown> = {}
  ): Promise<string> {
    const id = ownId(proof);
    requireFact(!(await this.store.has('invocation', id)), 'INVOCATION_ALREADY_USED');
    await this.store.put(
      'invocation',
      { contract: 'verification-invocation/v1', proof, operation, ...detail },
      id
    );
    return id;
  }
  private async assets(): Promise<VerificationAssets> {
    const value = await this.readAssets();
    requireFact(
      sameVerificationPath(process.execPath, value.daemonPath),
      'RUNNING_DAEMON_ASSET_MISMATCH'
    );
    return value;
  }
  private selector(plan: VerificationPlan): VerificationTaskSelector {
    return {
      workItemId: plan.workItemId,
      taskId: plan.authority.taskId,
      verificationType: plan.authority.verificationType,
      commandIndex: plan.authority.commandIndex,
    };
  }
  async getPlan(id: string): Promise<VerificationPlan> {
    verificationHash(id);
    const value = await this.store.get('plan', id);
    validateVerificationPlan(value);
    return value;
  }
  async getAttempt(id: string): Promise<VerificationAttempt> {
    verificationHash(id);
    const value = await this.store.get('attempt', id);
    validateVerificationAttempt(value);
    return value;
  }
  async consume(input: {
    receiptId: string;
    projectRoot: string;
    workItemId: string;
    taskId: string;
    verificationType: string;
    commandIndex: number;
    command: string;
    purpose: 'implementation' | 'formal';
  }): Promise<VerificationExecutionReceipt> {
    verificationHash(input.receiptId);
    const value = await this.store.get('receipt', input.receiptId);
    validateVerificationReceipt(value);
    const receipt = value;
    const plan = await this.getPlan(receipt.planId),
      attempt = await this.getAttempt(receipt.reservationId);
    const lease = await this.store.get('lease', receipt.leaseId);
    validateVerificationInvocationLease(lease);
    requireFact(
      lease.terminal === 'completed' &&
        lease.planId === receipt.planId &&
        lease.attemptId === receipt.attemptId &&
        lease.reservationId === receipt.reservationId &&
        json(lease.owner) === json(receipt.owner) &&
        lease.startedAt === receipt.startedAt &&
        Date.parse(lease.finishedAt) <= Date.parse(receipt.finishedAt),
      'INVOCATION_LEASE_NOT_ACCEPTABLE'
    );
    this.sameSubject(plan, input.projectRoot, input.workItemId);
    requireFact(
      receipt.projectRoot === plan.projectRoot &&
        receipt.workItemId === plan.workItemId &&
        receipt.purpose === input.purpose &&
        plan.authority.purpose === input.purpose &&
        plan.authority.taskId === input.taskId &&
        plan.authority.verificationType === input.verificationType &&
        plan.authority.commandIndex === input.commandIndex &&
        plan.command.original === input.command,
      'RECEIPT_SUBJECT_MISMATCH'
    );
    requireFact(
      receipt.outcome === 'passed' &&
        receipt.failure === null &&
        receipt.sourceIdentity === plan.source.identity &&
        receipt.authorityIdentity === plan.authority.identity &&
        json(receipt.assets) === json(plan.assets) &&
        json(receipt.budget) === json(plan.budget) &&
        receipt.profile === plan.profile &&
        attempt.planId === receipt.planId &&
        attempt.attemptId === receipt.attemptId &&
        attempt.projectRoot === plan.projectRoot &&
        attempt.workItemId === plan.workItemId,
      'RECEIPT_NOT_ACCEPTABLE'
    );
    requireFact(
      Date.parse(plan.createdAt) <= Date.parse(attempt.createdAt) &&
        Date.parse(attempt.createdAt) <= Date.parse(receipt.startedAt) &&
        Date.parse(receipt.finishedAt) < Date.parse(plan.expiresAt) &&
        Date.parse(receipt.finishedAt) <= Date.now() &&
        Date.parse(plan.owner.observedAt) <= Date.parse(plan.createdAt) &&
        Date.parse(receipt.owner.observedAt) <= Date.parse(receipt.startedAt),
      'RECEIPT_LIFETIME_INVALID'
    );
    const preparation = record(await this.store.get('invocation', ownId(plan.owner)), [
      'contract',
      'proof',
      'operation',
      'plan',
      'planId',
    ]);
    requireFact(
      preparation.contract === 'verification-invocation/v1' &&
        preparation.operation === 'prepare-plan' &&
        preparation.planId === receipt.planId &&
        json(preparation.plan) === json(plan) &&
        json(preparation.proof) === json(plan.owner),
      'PLAN_INVOCATION_INVALID'
    );
    const reservation = record(await this.store.get('invocation', ownId(attempt.owner)), [
      'contract',
      'proof',
      'operation',
      'attempt',
    ]);
    requireFact(
      reservation.contract === 'verification-invocation/v1' &&
        reservation.operation === 'prepare-attempt' &&
        json(reservation.attempt) === json(attempt) &&
        json(reservation.proof) === json(attempt.owner),
      'ATTEMPT_INVOCATION_INVALID'
    );
    const invocation = record(await this.store.get('invocation', ownId(receipt.owner)), [
      'contract',
      'proof',
      'operation',
      'reservationId',
    ]);
    requireFact(
      invocation.contract === 'verification-invocation/v1' &&
        invocation.operation === 'run-attempt' &&
        invocation.reservationId === receipt.reservationId &&
        json(invocation.proof) === json(receipt.owner),
      'EXECUTION_INVOCATION_INVALID'
    );
    const start = record(await this.store.get('start', hash(attempt.attemptId)), [
      'contract',
      'reservationId',
      'attemptId',
      'planId',
      'owner',
      'startedAt',
    ]);
    requireFact(
      start.contract === 'verification-start/v1' &&
        start.reservationId === receipt.reservationId &&
        start.attemptId === receipt.attemptId &&
        start.planId === receipt.planId &&
        start.startedAt === receipt.startedAt &&
        json(start.owner) === json(receipt.owner),
      'EXECUTION_START_INVALID'
    );
    requireFact(
      hash(await readVerificationFile(nativeConfigPath(this.store.root, attempt), 4194304)) ===
        attempt.nativeConfigSha256,
      'NATIVE_CONFIG_DRIFT'
    );
    const root = nativeRunRoot(this.store.root, attempt);
    for (const [file, expected, limit] of [
      ['stdout.bin', receipt.stdoutSha256, 1048576],
      ['stderr.bin', receipt.stderrSha256, 1048576],
      ['receipt.json', receipt.nativeReceiptSha256, 65536],
      ['events.jsonl', receipt.nativeEventsSha256, 16777216],
    ] as const) {
      requireFact(
        hash(await readVerificationFile(path.join(root, file), limit)) === expected,
        'EXECUTION_RAW_EVIDENCE_CHANGED'
      );
    }
    const inspectionRaw = await readVerificationFile(
      path.join(this.store.root, 'inspections', receipt.inspectionSha256 + '.json'),
      1048576
    );
    requireFact(hash(inspectionRaw) === receipt.inspectionSha256, 'INSPECTION_EVIDENCE_CHANGED');
    const inspection = record(JSON.parse(inspectionRaw.toString('utf8')), [
      'contract',
      'utc',
      'plan_id',
      'attempt_id',
      'config_sha256',
      'events_sha256',
      'root_created',
      'profile_present',
      'storage_present',
      'job_absent',
      'processes',
      'processes_ended',
      'cleanup_proved',
      'recovery_requested',
      'application_passed',
    ]);
    requireFact(
      inspection.contract === 'verification-native-inspection/v1' &&
        inspection.plan_id === receipt.planId &&
        inspection.attempt_id === receipt.attemptId &&
        inspection.config_sha256 === attempt.nativeConfigSha256 &&
        inspection.events_sha256 === receipt.nativeEventsSha256 &&
        inspection.cleanup_proved === true &&
        inspection.processes_ended === true &&
        inspection.profile_present === false &&
        inspection.storage_present === false &&
        inspection.application_passed === false &&
        typeof inspection.utc === 'string' &&
        Date.parse(inspection.utc) >= Date.parse(receipt.startedAt) &&
        Date.parse(inspection.utc) <= Date.parse(receipt.finishedAt),
      'INSPECTION_BINDING_INVALID'
    );
    await this.assertFresh(receipt.planId, plan, true);
    return receipt;
  }
  private sameSubject(plan: VerificationPlan, root: string, workItemId: unknown): void {
    requireFact(
      sameVerificationPath(plan.projectRoot, root) && plan.workItemId === workItemId,
      'SUBJECT_MISMATCH'
    );
  }

  /** Every consumer calls this; post-stage validation preserves immutable authority and checks current state separately. */
  async assertFresh(planId: string, plan: VerificationPlan, consume = false): Promise<void> {
    validateVerificationPlan(plan);
    requireFact(hash(json(plan)) === planId, 'PLAN_CONTENT_ID_INVALID');
    requireFact(!(await this.store.has('revocation', planId)), 'VERIFICATION_PERMISSION_REVOKED');
    if (!consume)
      requireFact(
        Date.now() >= Date.parse(plan.createdAt) && Date.now() < Date.parse(plan.expiresAt),
        'PLAN_EXPIRED'
      );
    const authority = await captureVerificationAuthority({
      ...this.selector(plan),
      projectRoot: plan.projectRoot,
      deps: this.deps,
      ...(consume ? { consumePurpose: plan.authority.purpose } : {}),
    });
    requireFact(
      consume
        ? authority.basisIdentity === plan.authority.basisIdentity
        : authority.identity === plan.authority.identity,
      'AUTHORITY_CHANGED'
    );
    const mode = await verificationSourceMode(plan.projectRoot, authority);
    requireFact(
      (plan.contract === 'verification-plan/v2') === (mode === 'filesystem'),
      'SOURCE_MODE_CHANGED'
    );
    const source =
      mode === 'filesystem'
        ? await captureFilesystemSource(
            plan.projectRoot,
            authority,
            plan.source.files.map(f => f.path),
            this.store.root,
            await this.assets()
          )
        : await captureVerificationSource(
            plan.projectRoot,
            plan.source.files.map(f => f.path)
          );
    requireFact(source.identity === plan.source.identity, 'SOURCE_CHANGED');
    requireFact(json(await this.assets()) === json(plan.assets), 'ASSETS_CHANGED');
    const inputs = await this.readSourceInputs(plan);
    const selected = await collectNodeCommandInputs(
      plan.projectRoot,
      plan.command.original,
      'availablePaths' in source ? source.availablePaths : source.trackedPaths,
      mode === 'filesystem'
        ? filesystemSourceReader(plan.projectRoot, this.store.root, plan.assets)
        : undefined
    );
    requireFact(
      json(selected.inputPaths) === json(plan.source.files.map(f => f.path).sort()),
      'INPUT_GRAPH_CHANGED'
    );
    requireFact(
      json(compileNodeCommand(plan.command.original, selected.sources)) === json(plan.command),
      'COMMAND_PROOF_CHANGED'
    );
    // Read the frozen input bytes too; authenticated plan data cannot excuse a changed private copy.
    await this.checkFrozen(planId, inputs);
  }

  private async readSourceInputs(plan: VerificationPlan): Promise<Map<string, Buffer>> {
    return plan.contract === 'verification-plan/v2'
      ? readFilesystemInputs(plan.source, this.store.root, plan.assets)
      : readFrozenVerificationInputs(plan.source);
  }

  private async listFrozen(directory: string): Promise<string[]> {
    await assertVerificationPath(directory);
    const names: string[] = [];
    const walk = async (current: string): Promise<void> => {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        await assertVerificationPath(full);
        if (entry.isDirectory()) await walk(full);
        else {
          requireFact(entry.isFile(), 'FROZEN_INPUT_KIND_INVALID');
          names.push(path.relative(directory, full).replace(/\\/g, '/'));
        }
        requireFact(names.length <= 2048, 'FROZEN_INPUT_COUNT');
      }
    };
    await walk(directory);
    return names.sort();
  }
  private async checkFrozen(id: string, inputs: Map<string, Buffer>): Promise<void> {
    const root = path.join(this.store.root, 'input', id);
    requireFact(
      json(await this.listFrozen(root)) === json([...inputs.keys()].sort()),
      'FROZEN_INPUT_SET_CHANGED'
    );
    for (const [name, bytes] of inputs)
      requireFact(
        (await readVerificationFile(path.join(root, name))).equals(bytes),
        'FROZEN_INPUT_CHANGED'
      );
  }
  private async freeze(id: string, inputs: Map<string, Buffer>, recover: boolean): Promise<void> {
    const root = path.join(this.store.root, 'input', id);
    await assertVerificationPath(root, true);
    await fs.mkdir(path.dirname(root), { recursive: true, mode: 0o700 });
    try {
      await fs.mkdir(root, { mode: 0o700 });
    } catch (error) {
      if (!recover || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (recover)
      for (const name of await this.listFrozen(root))
        requireFact(inputs.has(name), 'PREPARATION_EXTRA_INPUT');
    for (const [name, bytes] of inputs) {
      const file = path.join(root, name);
      try {
        await writeVerificationPrivate(file, bytes);
      } catch (error) {
        if (
          !recover ||
          (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
          !(await readVerificationFile(file)).equals(bytes)
        )
          throw error;
      }
    }
    await this.checkFrozen(id, inputs);
  }

  async plan(args: Record<string, unknown>, context: Context): Promise<Record<string, unknown>> {
    let diagnosticStage = 'project_context';
    try {
      const action = args.action,
        root = this.project(context);
      diagnosticStage = 'invocation_owner';
      const proof = await this.owner('sf_verification_plan', args, context);
      diagnosticStage = 'request_schema';
      if (action === 'create') {
        requireFact(!this.stopping, 'DAEMON_STOPPING');
        record(args, ['action', 'work_item_id', 'task_id', 'verification_type', 'command_index']);
        diagnosticStage = 'authority';
        const authority = await captureVerificationAuthority({
          projectRoot: root,
          deps: this.deps,
          workItemId: args.work_item_id as string,
          taskId: args.task_id as string,
          verificationType: args.verification_type as string,
          commandIndex: args.command_index as number,
        });
        diagnosticStage = 'source_inventory';
        const mode = await verificationSourceMode(root, authority);
        const filesystemAssets = mode === 'filesystem' ? await this.assets() : null;
        const inventory = filesystemAssets
          ? await captureFilesystemSource(root, authority, [], this.store.root, filesystemAssets)
          : await captureVerificationSource(root, []);
        diagnosticStage = 'input_graph';
        const selected = await collectNodeCommandInputs(
          root,
          authority.command,
          'availablePaths' in inventory ? inventory.availablePaths : inventory.trackedPaths,
          filesystemAssets
            ? filesystemSourceReader(root, this.store.root, filesystemAssets)
            : undefined
        );
        diagnosticStage = 'command_proof';
        const command = compileNodeCommand(authority.command, selected.sources);
        diagnosticStage = 'source_inputs';
        const sourceBinding = filesystemAssets
          ? {
              contract: 'verification-plan/v2' as const,
              source: await captureFilesystemSource(
                root,
                authority,
                selected.inputPaths,
                this.store.root,
                filesystemAssets
              ),
            }
          : {
              contract: VERIFICATION_PLAN_CONTRACT,
              source: await captureVerificationSource(root, selected.inputPaths),
            };
        const createdAt = new Date().toISOString();
        diagnosticStage = 'fixed_assets';
        const plan: VerificationPlan = {
          ...sourceBinding,
          createdAt,
          expiresAt: new Date(Date.parse(createdAt) + 600000).toISOString(),
          projectRoot: root,
          workItemId: authority.workItemId,
          authority,
          command,
          assets: await this.assets(),
          profile: VERIFICATION_PROFILE,
          budget: VERIFICATION_BUDGET,
          permission: {
            kind: 'independent-readonly-verification/v1',
            grantee: 'sf-verifier',
            codeWriteGranted: false,
          },
          owner: proof,
        };
        diagnosticStage = 'validate_and_read_inputs';
        validateVerificationPlan(plan);
        const id = hash(json(plan)),
          inputs = await this.readSourceInputs(plan);
        for (const [name, identity] of Object.entries(command.semanticProof.inputHashes))
          requireFact(hash(inputs.get(name)!) === identity, 'INPUT_CHANGED_DURING_PLANNING');
        diagnosticStage = 'claim_invocation';
        const preparation = await this.claim(proof, 'prepare-plan', { plan, planId: id });
        try {
          diagnosticStage = 'freeze_or_publish';
          await this.freeze(id, inputs, false);
          await this.assertFresh(id, plan);
          requireFact((await this.store.put('plan', plan)) === id, 'PLAN_PUBLISH_IDENTITY');
        } catch (error) {
          tagVerificationRejection(error, diagnosticStage);
          return {
            success: false,
            error: errorCode(error),
            diagnostic: verificationPublicRejection(error),
            preparation_id: preparation,
            plan_id: id,
            application_started: false,
          };
        }
        return {
          success: true,
          plan_id: id,
          preparation_id: preparation,
          expires_at: plan.expiresAt,
          purpose: authority.purpose,
          original_command: command.original,
          actual_argv: command.argv,
          profile: plan.profile,
          code_write_granted: false,
        };
      }
      if (action === 'recover') {
        diagnosticStage = 'recovery';
        requireFact(!this.stopping, 'DAEMON_STOPPING');
        record(args, ['action', 'work_item_id', 'preparation_id']);
        verificationHash(args.preparation_id);
        const prior = record(await this.store.get('invocation', args.preparation_id), [
          'contract',
          'proof',
          'operation',
          'plan',
          'planId',
        ]);
        requireFact(
          prior.contract === 'verification-invocation/v1' && prior.operation === 'prepare-plan',
          'PREPARATION_INVALID'
        );
        validateVerificationPlan(prior.plan);
        verificationHash(prior.planId);
        const plan = prior.plan;
        this.sameSubject(plan, root, args.work_item_id);
        requireFact(hash(json(plan)) === prior.planId, 'PREPARATION_PLAN_INVALID');
        await this.claim(proof, 'recover-plan', {
          preparationId: args.preparation_id,
          planId: prior.planId,
        });
        const inputs = await this.readSourceInputs(plan);
        await this.freeze(prior.planId, inputs, true);
        await this.assertFresh(prior.planId, plan);
        if (await this.store.has('plan', prior.planId))
          requireFact(
            json(await this.getPlan(prior.planId)) === json(plan),
            'PUBLISHED_PLAN_DRIFT'
          );
        else await this.store.put('plan', plan);
        return { success: true, plan_id: prior.planId, application_started: false };
      }
      if (action === 'revoke') {
        diagnosticStage = 'revocation';
        record(args, ['action', 'work_item_id', 'plan_id']);
        verificationHash(args.plan_id);
        const plan = await this.getPlan(args.plan_id);
        this.sameSubject(plan, root, args.work_item_id);
        await this.claim(proof, 'revoke-plan', { planId: args.plan_id });
        if (!(await this.store.has('revocation', args.plan_id)))
          await this.store.put(
            'revocation',
            {
              contract: 'verification-revocation/v1',
              planId: args.plan_id,
              owner: proof,
              revokedAt: new Date().toISOString(),
            },
            args.plan_id
          );
        for (const attempt of this.activeAttempts.values())
          if (attempt.planId === args.plan_id)
            await requestVerificationCancellation(this.store.root, attempt);
        return {
          success: true,
          plan_id: args.plan_id,
          verification_permission_revoked: true,
          code_write_granted: false,
        };
      }
      throw new Error('VERIFICATION_PLAN_ACTION_INVALID');
    } catch (error) {
      tagVerificationRejection(error, diagnosticStage);
      const message = error instanceof Error ? error.message : '';
      if (!/^(?:VERIFICATION|TOOL_INVOCATION|NODE_COMMAND)_[A-Z_]+$/.test(message))
        console.error(
          JSON.stringify({ ...verificationRejectionDiagnostic(error), stage: diagnosticStage })
        );
      throw error;
    }
  }

  async run(
    args: Record<string, unknown>,
    context: Context,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const root = this.project(context),
      proof = await this.owner('sf_verification_run', args, context);
    if (args.action === 'prepare') {
      requireFact(!this.stopping, 'DAEMON_STOPPING');
      record(args, ['action', 'work_item_id', 'plan_id']);
      verificationHash(args.plan_id);
      const plan = await this.getPlan(args.plan_id);
      this.sameSubject(plan, root, args.work_item_id);
      await this.assertFresh(args.plan_id, plan);
      const attemptId = randomUUID().replace(/-/g, ''),
        createdAt = new Date().toISOString();
      const nativeConfig = {
        contract: 'verification-native-plan/v1',
        plan_id: args.plan_id,
        attempt_id: attemptId,
        owner_root: this.store.root,
        attempt_root: path.join(this.store.root, 'runs', attemptId),
        node_path: plan.assets.nodePath,
        node_sha256: plan.assets.nodeSha256,
        daemon_path: plan.assets.daemonPath,
        daemon_sha256: plan.assets.daemonSha256,
        kind: plan.command.kind,
        entry: plan.command.entry,
        inline_source: plan.command.inlineSource,
        argv: plan.command.argv,
        files: plan.source.files.map(f => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
        profile: plan.profile,
        wall_ms: plan.budget.wallMs,
        memory_bytes: plan.budget.memoryBytes,
        process_limit: plan.budget.processes,
        output_bytes: plan.budget.stdoutBytes,
      };
      const raw = json(nativeConfig) + '\n';
      const attempt: VerificationAttempt = {
        contract: 'verification-attempt/v1',
        planId: args.plan_id,
        attemptId,
        createdAt,
        projectRoot: root,
        workItemId: plan.workItemId,
        owner: proof,
        nativeConfigSha256: hash(raw),
        initialAttemptAbsent: true,
      };
      validateVerificationAttempt(attempt);
      await this.claim(proof, 'prepare-attempt', { attempt });
      await writeVerificationPrivate(nativeConfigPath(this.store.root, attempt), raw);
      const id = await this.store.put('attempt', attempt);
      return {
        success: true,
        attempt_record_id: id,
        attempt_id: attemptId,
        plan_id: attempt.planId,
        application_started: false,
      };
    }
    requireFact(['run', 'cancel', 'recover'].includes(String(args.action)), 'RUN_ACTION_INVALID');
    record(args, ['action', 'work_item_id', 'attempt_record_id']);
    verificationHash(args.attempt_record_id);
    const reservationId = args.attempt_record_id,
      attempt = await this.getAttempt(reservationId),
      plan = await this.getPlan(attempt.planId);
    this.sameSubject(plan, root, args.work_item_id);
    requireFact(
      attempt.projectRoot === plan.projectRoot && attempt.workItemId === plan.workItemId,
      'ATTEMPT_PLAN_MISMATCH'
    );
    if (args.action === 'cancel') {
      await this.claim(proof, 'cancel-attempt', { reservationId });
      await requestVerificationCancellation(this.store.root, attempt);
      return {
        success: true,
        attempt_record_id: reservationId,
        cancellation_requested: true,
        application_passed: false,
      };
    }
    if (args.action === 'recover') {
      requireFact(json(await this.assets()) === json(plan.assets), 'RECOVERY_ASSETS_CHANGED');
      await this.claim(proof, 'recover-attempt', { reservationId });
      // Close the pre-mutex startup race too: a delayed old launcher must observe cancellation before Main.
      await requestVerificationCancellation(this.store.root, attempt);
      requireFact(!this.activeAttempts.has(attempt.attemptId), 'ATTEMPT_STILL_ACTIVE');
      const inspection = await this.native.inspect(plan, attempt, true);
      const recoveryId = await this.store.put('recovery', {
        contract: 'verification-recovery/v1',
        reservationId,
        planId: attempt.planId,
        attemptId: attempt.attemptId,
        owner: proof,
        utc: new Date().toISOString(),
        inspection,
        applicationPassed: false,
      });
      return {
        success: true,
        recovery_id: recoveryId,
        attempt_record_id: reservationId,
        cleanup_proved: inspection.cleanupProved,
        application_passed: false,
      };
    }
    const operation = this.executePrepared(plan, attempt, reservationId, proof, root, signal);
    this.activeOperations.add(operation);
    try {
      return await operation;
    } finally {
      this.activeOperations.delete(operation);
    }
  }

  private async executePrepared(
    plan: VerificationPlan,
    attempt: VerificationAttempt,
    reservationId: string,
    proof: TrustedToolInvocationProof,
    root: string,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    requireFact(!this.stopping, 'DAEMON_STOPPING');
    this.activeAttempts.set(attempt.attemptId, attempt);
    try {
      await this.assertFresh(attempt.planId, plan);
      requireFact(!signal?.aborted, 'REQUEST_ALREADY_CANCELLED');
      requireFact(!this.stopping, 'DAEMON_STOPPING');
      await this.claim(proof, 'run-attempt', { reservationId });
      const startedAt = new Date().toISOString();
      await this.store.put(
        'start',
        {
          contract: 'verification-start/v1',
          reservationId,
          attemptId: attempt.attemptId,
          planId: attempt.planId,
          owner: proof,
          startedAt,
        },
        hash(attempt.attemptId)
      );
      let facts: NativeExecutionFacts = {
        processStarted: false,
        processResumed: false,
        exitCode: null,
        launcherExitCode: null,
        jobEnded: false,
        cleanupProved: false,
        outputComplete: false,
        stdoutSha256: hash(''),
        stderrSha256: hash(''),
        nativeReceiptSha256: null,
        nativeEventsSha256: null,
        inspectionSha256: null,
        outcome: 'not_executed',
        failure: 'RUNTIME_INVOCATION_LEASE_LOST',
      };
      await this.assertFresh(attempt.planId, plan);
      requireFact(!this.stopping, 'DAEMON_STOPPING');
      const lease = new VerificationInvocationLease({
        planId: attempt.planId,
        attemptId: attempt.attemptId,
        reservationId,
        owner: proof,
        startedAt,
        signal,
        verify: () =>
          this.owner(
            'sf_verification_run',
            { action: 'run', work_item_id: plan.workItemId, attempt_record_id: reservationId },
            { directory: root, sessionID: proof.sessionId, messageID: proof.messageId }
          ),
      });
      let leaseId: string | undefined;
      try {
        if (await lease.start()) facts = await this.native.execute(plan, attempt, lease.signal);
        if (facts.outcome === 'passed') {
          try {
            await this.assertFresh(attempt.planId, plan);
          } catch (error) {
            facts.outcome = 'failed';
            facts.failure = errorCode(error);
          }
        }
      } finally {
        const observation = await lease.finish();
        validateVerificationInvocationLease(observation);
        if (observation.terminal !== 'completed' && facts.outcome === 'passed') {
          facts.outcome = 'cancelled';
          facts.failure = 'RUNTIME_INVOCATION_LEASE_LOST';
        }
        leaseId = await this.store.put('lease', observation);
      }
      requireFact(typeof leaseId === 'string', 'INVOCATION_LEASE_REQUIRED');
      const receipt: VerificationExecutionReceipt = {
        contract: VERIFICATION_RECEIPT_CONTRACT,
        planId: attempt.planId,
        attemptId: attempt.attemptId,
        projectRoot: root,
        workItemId: plan.workItemId,
        purpose: plan.authority.purpose,
        startedAt,
        finishedAt: new Date().toISOString(),
        owner: proof,
        sourceIdentity: plan.source.identity,
        authorityIdentity: plan.authority.identity,
        assets: plan.assets,
        profile: plan.profile,
        budget: plan.budget,
        reservationId,
        leaseId,
        ...facts,
      };
      validateVerificationReceipt(receipt);
      const id = await this.store.put('receipt', receipt);
      let stdout = '',
        stderr = '';
      if (receipt.nativeReceiptSha256 !== null) {
        stdout = (
          await readVerificationFile(
            path.join(nativeRunRoot(this.store.root, attempt), 'stdout.bin'),
            1048576
          )
        ).toString('utf8');
        stderr = (
          await readVerificationFile(
            path.join(nativeRunRoot(this.store.root, attempt), 'stderr.bin'),
            1048576
          )
        ).toString('utf8');
      }
      return {
        success: receipt.outcome === 'passed',
        receipt_id: id,
        attempt_record_id: reservationId,
        attempt_id: attempt.attemptId,
        plan_id: attempt.planId,
        outcome: receipt.outcome,
        exit_code: receipt.exitCode,
        cleanup_proved: receipt.cleanupProved,
        failure: receipt.failure,
        stdout: stdout.slice(0, 20000),
        stderr: stderr.slice(0, 20000),
        output_preview_truncated: stdout.length > 20000 || stderr.length > 20000,
        output_complete: receipt.outputComplete,
      };
    } finally {
      this.activeAttempts.delete(attempt.attemptId);
    }
  }
}
