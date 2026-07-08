const crypto = require('crypto');
const { getQueue, setQueue, removeUserEverywhere } = require('./matchmakingStore');
function joinQueue({ game, uid, socketId = '', meta = {} }) {
  removeUserEverywhere(uid);
  const queue = getQueue(game).filter(x => x.uid !== uid);
  const opponentIndex = queue.findIndex(x => x.uid !== uid);
  if (opponentIndex >= 0) {
    const [opponent] = queue.splice(opponentIndex, 1);
    setQueue(game, queue);
    const roomId = `${game}_${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    return { matched: true, roomId, players: [opponent, { uid, socketId, meta, joinedAt: Date.now() }] };
  }
  queue.push({ uid, socketId, meta, joinedAt: Date.now() }); setQueue(game, queue);
  return { matched: false, queued: true };
}
function leaveQueue(uid) { removeUserEverywhere(uid); return { ok: true }; }
module.exports = { joinQueue, leaveQueue };
