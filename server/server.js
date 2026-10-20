const app = require('./app');
const pool = require('./modules/pool');

// App Set //
const PORT = process.env.PORT || 5000;
// Heroku sends SIGTERM and waits 30s before SIGKILL
const SHUTDOWN_TIMEOUT_MS =
  Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 25000;

/** Listen * */
const server = app.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`);
});

// Graceful shutdown: stop accepting connections, let in-flight requests
// finish, then close the database pool.
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    console.error(`Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (serverErr) => {
    if (serverErr) {
      console.error('Error closing HTTP server:', serverErr);
    }
    try {
      await pool.end();
    } catch (poolErr) {
      console.error('Error closing database pool:', poolErr);
    }
    process.exit(serverErr ? 1 : 0);
  });
  // Drop keep-alive connections that are not mid-request
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
