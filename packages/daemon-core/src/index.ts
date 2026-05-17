/**
 * Daemon Core entry point
 * 
 * This module initializes and starts the Daemon Core process.
 */

import { Daemon } from './daemon/Daemon';

async function main(): Promise<void> {
  const daemon = new Daemon();
  
  try {
    await daemon.start();
    console.log('Daemon Core started successfully');
  } catch (error) {
    console.error('Failed to start Daemon Core:', error);
    process.exit(1);
  }
}

// Start the daemon
main();
