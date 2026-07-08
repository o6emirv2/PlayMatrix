const { TtlStore } = require('../core/runtimeStore');
const queues = new TtlStore({ ttlMs: 2 * 60 * 1000, max: 2000 });
function getQueue(game) { return queues.get(game) || []; }
function setQueue(game, queue) { queues.set(game, queue, 2 * 60 * 1000); return queue; }
function removeUserEverywhere(uid) { for (const [game, queue] of queues.entries()) setQueue(game, queue.filter(x => x.uid !== uid)); }
module.exports = { getQueue, setQueue, removeUserEverywhere };
