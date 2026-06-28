const express = require('express'); const { requireAuth } = require('../core/security'); const { initFirebaseAdmin } = require('../config/firebaseAdmin'); const { runOnce } = require('../core/idempotencyService');
const router = express.Router();
async function atomicBalance(uid, amount, reason, idempotencyKey) { const { db, admin } = initFirebaseAdmin(); return runOnce({ key:idempotencyKey, db, execute: async()=>{ if (db) await db.collection('users').doc(uid).set({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: Date.now() }, { merge:true }); return { amount, reason }; }}); }
router.post('/economy/reward', requireAuth, async (req,res)=>{ const amount = Math.max(0, Math.floor(Number(req.body.amount)||0)); const reason = String(req.body.reason||'reward').slice(0,80); const key = `${req.user.uid}:${reason}:${String(req.body.rewardId||Date.now())}`; res.json(await atomicBalance(req.user.uid, amount, reason, key)); });
module.exports = router;
