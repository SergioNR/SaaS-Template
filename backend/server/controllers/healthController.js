import { checkDatabaseConnectionInDb } from '../models/healthModel.js';
import { logWarn } from '../config/loggerFunctions.js';
import { isShuttingDown } from '../utils/processLifecycle.js';

//* Liveness + readiness in one: the process answers and the database is
//* reachable. A 503 lets the orchestrator stop routing traffic to this
//* replica (and restart it) while the database is away
export const getHealth = async (req, res) => {
  //* A draining replica reports unhealthy so no new traffic is routed to it
  //* while in-flight requests and background work finish
  if (isShuttingDown()) {
    return res.status(503).json({
      status: 'unavailable',
    });
  }

  try {
    await checkDatabaseConnectionInDb();
  } catch (error) {
    logWarn('Health check failed - database unreachable', error);

    return res.status(503).json({
      status: 'unavailable',
    });
  }

  return res.status(200).json({
    status: 'ok',
  });
};
