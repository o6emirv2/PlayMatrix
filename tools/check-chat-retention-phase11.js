#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`[FAZ11] ${message}`);
};
const readTree = (dir, ext) => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return '';
  const chunks = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(ext)) chunks.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(abs);
  return chunks.join('\n');
};

const constants = read('config/constants.js');
const routes = read('routes/chat.routes.js');
const sockets = read('sockets/index.js');
const crons = read('crons/tasks.js');
const clientJs = [read('script.js'), readTree('public/js', '.js')].join('\n');
const clientCss = [read('style.css'), readTree('public/css', '.css')].join('\n');

assert(/LOBBY_CHAT_RETENTION_DAYS[\s\S]*\|\| 7\)/.test(constants), 'Global sohbet varsayılan saklama süresi 7 gün olmalı.');
assert(/DIRECT_CHAT_RETENTION_DAYS[\s\S]*\|\| 14\)/.test(constants), 'DM varsayılan saklama süresi 14 gün olmalı.');
assert(constants.includes('Saklama süresi dolduğu için temizlendi'), 'Retention temizleme etiketi eksik.');
assert(constants.includes('Silinen mesajların içeriği boş gösterilir'), 'Silinen mesaj içeriği açıklaması eksik.');
assert(routes.includes('lifecycle.deleted ? \'\' : cleanStr(data.text'), 'DM normalize mesajı silinmiş içerikte boş metin döndürmeli.');
assert(routes.includes('if (lifecycle.deleted || status === \'deleted\' || !text) return;'), 'DM arama silinmiş mesajları filtrelemeli.');
assert(routes.includes('await assertDmAllowed(uid, targetUid);'), 'Hedefli DM araması ilişki/izin kontrolünden geçmeli.');
assert(sockets.includes('message: deletedAt > 0 ? \'\' : cleanStr(message.message'), 'Global socket payload silinmiş mesaj metnini boş döndürmeli.');
assert(sockets.includes('const text = deletedAt > 0 ? \'\' : cleanStr(message.text'), 'DM socket payload silinmiş mesaj metnini boş döndürmeli.');
assert(sockets.includes('policy: CHAT_RETENTION_POLICY'), 'Socket history payload saklama politikasını iletmeli.');
assert(crons.includes('collectionGroup(\'messages\')'), 'DM retention sadece inaktif konuşmalara değil mesaj yaşına göre çalışmalı.');
assert(crons.includes('CHAT_RETENTION_POLICY.deleteModes.retention'), 'Cron retention deletionMode sabitini kullanmalı.');
assert(crons.includes('cron_chat_retention_cleanup_completed'), 'Cron başarı logu eksik.');
assert(crons.includes("colJobs().doc('chat_retention_cleanup')"), 'Cron sonucu admin/operasyon kaydına yazılmalı.');
assert(clientJs.includes('buildChatPolicyNotice'), 'Kullanıcı tarafında saklama politikası görünür notice eksik.');
assert(clientJs.includes('DM 14 Gün'), 'Client fallback DM 14 gün olmalı.');
assert(clientCss.includes('.ps-retention-notice'), 'Retention notice CSS eksik.');

console.log('FAZ 11 chat retention kontrolleri başarılı.');
if (!process.exitCode) process.exit(0);
