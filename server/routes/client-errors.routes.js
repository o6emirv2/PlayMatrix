const express = require('express');

function createClientErrorsRouter(captureClientError) {
  if (typeof captureClientError !== 'function') throw new TypeError('captureClientError handler is required');
  const router = express.Router();
  router.post('/client/error', captureClientError);
  router.post('/client-errors', captureClientError);
  return router;
}

module.exports = createClientErrorsRouter;
