#!/usr/bin/env bun

import { Daemon } from './daemon/Daemon';
import { getCodeVersion } from '@specforge/version-unification';

export type SpecforgedCommand =
  | { command: 'version' }
  | { command: 'start'; foreground: boolean };

export function parseSpecforgedArgs(args: readonly string[]): SpecforgedCommand {
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    return { command: 'version' };
  }
  if (args[0] === 'start') {
    const unsupported = args.slice(1).filter((arg) => arg !== '--foreground');
    if (unsupported.length === 0) {
      return { command: 'start', foreground: args.includes('--foreground') };
    }
  }
  throw new Error(`UNSUPPORTED_SPECFORGED_COMMAND: ${args.join(' ') || '<empty>'}`);
}

export async function runSpecforged(args: readonly string[]): Promise<void> {
  const command = parseSpecforgedArgs(args);
  if (command.command === 'version') {
    console.log(`specforged ${getCodeVersion()}`);
    return;
  }

  const daemon = new Daemon();
  const stop = async (): Promise<void> => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await daemon.stop();
  };
  const onSignal = (): void => {
    void stop().catch((error) => {
      console.error('specforged shutdown failed:', error);
      process.exitCode = 1;
    });
  };

  await daemon.start();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}

if (import.meta.main) {
  runSpecforged(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
