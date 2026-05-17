/**
 * Progress indicator demonstration command.
 * 
 * Demonstrates:
 * - Spinner for async operations (interactive mode only)
 * - Progress bars for long operations
 * - Job progress tracking for `--wait` mode
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ModeSwitch } from '../mode';
import { ProgressIndicatorFactory } from '../progress/ProgressIndicator';
import { ProgressBar } from '../progress/ProgressBar';
import { createJobProgress } from '../progress/JobProgress';

/**
 * Progress demo command handler.
 */
export async function handleProgressDemo(argv: string[]): Promise<void> {
  const args = yargs(hideBin(argv))
    .command('progress', 'Demonstrate progress indicators')
    .option('demo', {
      type: 'string',
      choices: ['spinner', 'bar', 'job'],
      description: 'Which demo to run',
      default: 'spinner',
    })
    .option('steps', {
      type: 'number',
      description: 'Number of steps for progress bar',
      default: 10,
    })
    .option('duration', {
      type: 'number',
      description: 'Duration in milliseconds',
      default: 3000,
    })
    .parseSync();

  const modeSwitch = new ModeSwitch(argv);
  const mode = modeSwitch.mode;
  const demo = args.demo as 'spinner' | 'bar' | 'job';

  if (demo === 'spinner') {
    await runSpinnerDemo(mode, args.duration);
  } else if (demo === 'bar') {
    await runProgressBarDemo(mode, args.steps, args.duration);
  } else if (demo === 'job') {
    await runJobProgressDemo(mode, args.duration);
  }
}

/**
 * Run spinner demo.
 */
async function runSpinnerDemo(mode: 'human' | 'json', duration: number): Promise<void> {
  if (mode === 'json') {
    console.log(JSON.stringify({
      type: 'spinner_demo',
      message: 'Spinner demo suppressed in JSON mode',
      duration,
    }));
    return;
  }

  const spinner = ProgressIndicatorFactory.create(mode, 'spinner', 'Starting spinner demo...');
  spinner.start();

  // Simulate async work
  await sleep(duration / 3);
  spinner.update('Processing step 1...');

  await sleep(duration / 3);
  spinner.update('Processing step 2...');

  await sleep(duration / 3);
  spinner.succeed('Spinner demo completed successfully!');
}

/**
 * Run progress bar demo.
 */
async function runProgressBarDemo(
  mode: 'human' | 'json',
  steps: number,
  duration: number
): Promise<void> {
  if (mode === 'json') {
    console.log(JSON.stringify({
      type: 'progress_bar_demo',
      message: 'Progress bar demo suppressed in JSON mode',
      steps,
      duration,
    }));
    return;
  }

  const progressBar = new ProgressBar('Progress bar demo', {
    total: steps,
    width: 30,
    showPercentage: true,
    showElapsed: true,
    showRemaining: true,
  });
  
  progressBar.start();

  const stepDuration = duration / steps;
  
  for (let i = 0; i < steps; i++) {
    await sleep(stepDuration);
    progressBar.update(i + 1, `Processing step ${i + 1}/${steps}...`);
  }

  progressBar.succeed('Progress bar demo completed!');
}

/**
 * Run job progress demo.
 */
async function runJobProgressDemo(mode: 'human' | 'json', duration: number): Promise<void> {
  const jobId = `demo-job-${Date.now()}`;
  const progress = createJobProgress(mode, jobId);

  // Simulate job status updates
  const statuses = [
    { status: 'pending', message: 'Job pending' },
    { status: 'running', message: 'Job running' },
    { status: 'running', message: 'Processing data' },
    { status: 'running', message: 'Generating output' },
    { status: 'completed', message: 'Job completed', result: { output: 'demo result' } },
  ];

  const stepDuration = duration / (statuses.length - 1);

  for (let i = 0; i < statuses.length; i++) {
    await sleep(stepDuration);
    
    const status = statuses[i];
    progress.update({
      jobId,
      status: status.status as any,
      command: 'demo',
      result: status.result,
      createdAt: Date.now() - duration,
      updatedAt: Date.now(),
    });

    if (status.status === 'completed') {
      progress.complete({
        jobId,
        status: 'completed',
        command: 'demo',
        result: status.result,
        createdAt: Date.now() - duration,
        updatedAt: Date.now(),
      });
      break;
    }
  }
}

/**
 * Sleep for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Register progress demo command.
 */
export function registerProgressCommand(yargsInstance: yargs.Argv): yargs.Argv {
  return yargsInstance.command(
    'progress',
    'Demonstrate progress indicators',
    (yargs) => {
      return yargs
        .option('demo', {
          type: 'string',
          choices: ['spinner', 'bar', 'job'],
          description: 'Which demo to run',
          default: 'spinner',
        })
        .option('steps', {
          type: 'number',
          description: 'Number of steps for progress bar',
          default: 10,
        })
        .option('duration', {
          type: 'number',
          description: 'Duration in milliseconds',
          default: 3000,
        });
    },
    async (argv) => {
      await handleProgressDemo(process.argv);
    }
  );
}