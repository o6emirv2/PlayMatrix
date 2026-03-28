'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [
  ['utils/inviteCenter.js', /buildInviteCooldownSnapshot/],
  ['routes/party.routes.js', /diagnostics: buildPartyInviteSnapshot/],
  ['routes/socialcenter.routes.js', /partyOutgoingInvites:/],
  ['script.js', /Gönderilen Parti Davetleri/],
  ['sockets/index.js', /INVITE_RATE_LIMIT/]
];
for (const [file, pattern] of checks) {
  const src = read(file);
  if (!pattern.test(src)) throw new Error(`verify failed: ${file}`);
}
console.log('phase10 invite/party visibility verify ok');
