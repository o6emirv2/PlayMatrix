'use strict';

const fs = require('fs');
const os = require('os');
const { nowMs, safeNum } = require('./helpers');
const { APP_LOG_PATH } = require('./logger');

function toMb(value = 0) {
  return Number((Number(value || 0) / (1024 * 1024)).toFixed(2));
}

function summarizeMemory(memoryUsage = process.memoryUsage()) {
  return {
    rss: safeNum(memoryUsage.rss, 0),
    heapTotal: safeNum(memoryUsage.heapTotal, 0),
    heapUsed: safeNum(memoryUsage.heapUsed, 0),
    external: safeNum(memoryUsage.external, 0),
    arrayBuffers: safeNum(memoryUsage.arrayBuffers, 0),
    rssMb: toMb(memoryUsage.rss),
    heapTotalMb: toMb(memoryUsage.heapTotal),
    heapUsedMb: toMb(memoryUsage.heapUsed),
    externalMb: toMb(memoryUsage.external)
  };
}

function tailLogFile(filePath = APP_LOG_PATH, maxLines = 40) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(200, Math.floor(maxLines))));
  } catch (_) {
    return [];
  }
}

function fileStats(filePath = APP_LOG_PATH) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { exists: false, path: filePath, size: 0, sizeKb: 0 };
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      path: filePath,
      size: stat.size,
      sizeKb: Number((stat.size / 1024).toFixed(2)),
      mtimeMs: stat.mtimeMs,
      birthtimeMs: stat.birthtimeMs
    };
  } catch (_) {
    return { exists: false, path: filePath, size: 0, sizeKb: 0 };
  }
}

function summarizeErrorRows(rows = []) {
  const normalized = Array.isArray(rows) ? rows : [];
  const counts = { total: normalized.length, fatal: 0, error: 0, warn: 0, other: 0 };
  normalized.forEach((row) => {
    const severity = String(row?.severity || row?.level || '').toLowerCase();
    if (severity === 'fatal') counts.fatal += 1;
    else if (severity === 'error') counts.error += 1;
    else if (severity === 'warn' || severity === 'warning') counts.warn += 1;
    else counts.other += 1;
  });
  return counts;
}

function buildOpsHealthSnapshot(options = {}) {
  const featureFlags = options.featureFlags && typeof options.featureFlags === 'object' ? options.featureFlags : {};
  const recentErrors = Array.isArray(options.recentErrors) ? options.recentErrors : [];
  const logsPath = options.logPath || APP_LOG_PATH;
  const cpus = typeof os.cpus === 'function' ? (os.cpus() || []) : [];
  const loadavg = typeof os.loadavg === 'function' ? os.loadavg() : [0, 0, 0];

  return {
    ok: true,
    timestamp: nowMs(),
    process: {
      pid: process.pid,
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      cwd: process.cwd(),
      platform: process.platform,
      arch: process.arch,
      memory: summarizeMemory(options.memoryUsage || process.memoryUsage())
    },
    host: {
      hostname: typeof os.hostname === 'function' ? os.hostname() : '',
      release: typeof os.release === 'function' ? os.release() : '',
      totalMemMb: toMb(typeof os.totalmem === 'function' ? os.totalmem() : 0),
      freeMemMb: toMb(typeof os.freemem === 'function' ? os.freemem() : 0),
      loadavg: loadavg.map((n) => Number(Number(n || 0).toFixed(2))),
      cpuCount: cpus.length
    },
    featureFlags,
    recentErrors,
    errorSummary: summarizeErrorRows(recentErrors),
    logs: {
      stats: fileStats(logsPath),
      tail: tailLogFile(logsPath, safeNum(options.tailLines, 20))
    }
  };
}

module.exports = {
  summarizeMemory,
  tailLogFile,
  fileStats,
  summarizeErrorRows,
  buildOpsHealthSnapshot
};
