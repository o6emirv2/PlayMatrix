'use strict';

const fs = require('fs');
const path = require('path');

function mustInclude(file, snippets = []) {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  snippets.forEach((snippet) => {
    if (!source.includes(snippet)) {
      throw new Error(`${file} içinde eksik ifade: ${snippet}`);
    }
  });
}

mustInclude('routes/chat.routes.js', [
  "router.get('/chat/policy'",
  'buildChatLifecycleSnapshot',
  'DIRECT_MESSAGE_EDIT_WINDOW_MS',
  'lifecycle: buildChatLifecycleSnapshot(policy)'
]);

mustInclude('crons/tasks.js', [
  'getChatRetentionPolicyConfig',
  'runtimeChatPolicy',
  'directRetentionDays'
]);

mustInclude('utils/chatLifecycle.js', [
  'DIRECT_MESSAGE_EDIT_WINDOW_HOURS',
  'soft_delete_then_retention_cleanup',
  'scheduled_cron_cleanup'
]);

console.log('FAZ 7 verify geçti');
