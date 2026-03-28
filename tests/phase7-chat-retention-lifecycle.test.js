'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CHAT_RETENTION_POLICY } = require('../config/constants');
const { buildChatLifecycleSnapshot, DIRECT_MESSAGE_EDIT_WINDOW_MS } = require('../utils/chatLifecycle');
const { buildResetScheduleSnapshot } = require('../utils/statsCenter');
const { buildPlatformControlSnapshot } = require('../utils/platformControl');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('chat lifecycle snapshot varsayılan retention ve edit penceresini üretir', () => {
  const snapshot = buildChatLifecycleSnapshot(CHAT_RETENTION_POLICY);
  assert.equal(snapshot.lobbyDays, 7);
  assert.equal(snapshot.directDays, 14);
  assert.equal(snapshot.summaryLabel, 'Global 7 Gün · DM 14 Gün');
  assert.equal(snapshot.directEditWindowMs, DIRECT_MESSAGE_EDIT_WINDOW_MS);
  assert.equal(snapshot.deleteMode, 'soft_delete_then_retention_cleanup');
});

test('reset ve platform snapshot direct fallback için 14 günü korur', () => {
  const reset = buildResetScheduleSnapshot(new Date('2026-03-28T00:00:00Z'), { chatRetention: { lobbyDays: 7 } });
  assert.equal(reset.chatRetention.directDays, 14);
  const platform = buildPlatformControlSnapshot({ chatRetention: { lobbyDays: 7 }, generatedAt: 1 });
  assert.equal(platform.chatRetention.directDays, 14);
});

test('chat routes ve cron runtime retention/lifecycle katmanını içerir', () => {
  const chatRoutes = read('routes/chat.routes.js');
  const crons = read('crons/tasks.js');
  const script = read('script.js');
  assert.match(chatRoutes, /router\.get\('\/chat\/policy'/);
  assert.match(chatRoutes, /lifecycle: buildChatLifecycleSnapshot\(policy\)/);
  assert.match(chatRoutes, /DIRECT_MESSAGE_EDIT_WINDOW_MS/);
  assert.match(crons, /getChatRetentionPolicyConfig/);
  assert.match(crons, /runtimeChatPolicy/);
  assert.match(script, /const directDays = Number\(policy\?\.directDays \|\| 14\) \|\| 14;/);
});
