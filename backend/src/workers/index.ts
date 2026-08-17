import { config } from '../config';
import { logger } from '../utils/logger';

export interface Job {
  name: string;
  run(): Promise<void>;
}

/**
 * Background worker registry. When REDIS is enabled these jobs can be
 * scheduled on a queue; otherwise they are no-ops.
 */
const jobs: Job[] = [];

export function registerWorker(job: Job): void {
  jobs.push(job);
}

export async function startWorkers(): Promise<void> {
  if (!config.redisEnabled) {
    logger.info('Workers skipped (REDIS_ENABLED=false)');
    return;
  }
  logger.info(`Starting ${jobs.length} background worker(s)`);
  // Placeholder for a real queue integration (e.g. BullMQ) once Redis is available.
  await Promise.all(jobs.map((job) => job.run()));
}

export function getWorkers(): Job[] {
  return jobs;
}