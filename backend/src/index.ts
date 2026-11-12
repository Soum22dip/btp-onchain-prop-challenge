// =============================================================================
// Setl8 Backend — Entry Point
// =============================================================================

import { startServer } from './server.js';
import { logger } from './lib/logger.js';

startServer().catch((err: unknown) => {
  logger.error({ err }, '[startup] Fatal error');
  process.exit(1);
});
