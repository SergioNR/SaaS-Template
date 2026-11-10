import { logError, logInfo, logWarn } from '../config/loggerFunctions.js';
import { runWithAdvisoryLockInDb } from '../models/advisoryLockModel.js';
import { isTransientDatabaseError } from '../utils/prismaErrors.js';
import { isShuttingDown } from '../utils/processLifecycle.js';

//* A database restart fails every tick of every job (the lock itself cannot
//* be taken) and heals by the next one - only an outage that survives 3
//* consecutive ticks of the same job pages a human. A constant on purpose:
//* make it an env var only if a fork needs another value
export const TRANSIENT_FAILURE_ALERT_THRESHOLD = 3;

//* Per process and per job - the count cannot live in the database it is
//* about. Several replicas may therefore each alert once for a long outage,
//* like the per-process Telegram dedupe
const consecutiveTransientFailures = new Map();

//* Exported for the specs
export const resetCronTransientFailureCounts = () => consecutiveTransientFailures.clear();

//* Every replica schedules the same jobs - the advisory lock makes exactly
//* one of them run each tick (the others skip it). Never throws: errors are
//* logError-ed like any other cron failure, except transient database
//* connectivity errors, which warn until they repeat
export const runExclusiveCronTick = async (jobName, lockKey, task) => {
  try {
    const { acquired } = await runWithAdvisoryLockInDb(lockKey, task);

    //* Both outcomes prove the database answered - a skipped tick resets the
    //* count too, otherwise a replica that stops winning the lock would keep
    //* a stale count forever
    consecutiveTransientFailures.delete(jobName);

    if (!acquired) {
      logInfo(`Cron job ${jobName} skipped - another replica holds its lock`);
    }
  } catch (error) {
    //* A tick abandoned by the shutdown drain fails once the database closes
    //* under it - expected during a deploy, so it must not page anyone
    if (isShuttingDown()) {
      logWarn(`Cron job ${jobName} failed during shutdown`, error, { jobName: jobName });
      return;
    }

    if (!isTransientDatabaseError(error)) {
      logError(`Error in cron job ${jobName}:`, error);
      return;
    }

    const count = (consecutiveTransientFailures.get(jobName) ?? 0) + 1;
    consecutiveTransientFailures.set(jobName, count);

    const context = {
      jobName: jobName,
      code: error?.code ?? error?.cause?.code ?? null,
      consecutiveFailures: count,
    };

    //* Exactly the threshold-th failure alerts; later ones keep warning, so a
    //* long outage pages once per job per process until a tick succeeds
    if (count === TRANSIENT_FAILURE_ALERT_THRESHOLD) {
      logError(`Error in cron job ${jobName}: database unreachable on ${count} consecutive ticks`, error, context);
    } else {
      logWarn(`Transient database error in cron job ${jobName}`, error, context);
    }
  }
};
