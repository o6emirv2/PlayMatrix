// routes/mines.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Kendi oluşturduğumuz modülleri içeri aktarıyoruz
const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { safeFloat, safeNum, nowMs } = require('../utils/helpers');
const { awardRpFromSpend } = require('../utils/rpSystem');

const colMines = () => db.collection('mines_sessions');
const colUsers = () => db.collection('users');

// ---------------------------------------------------------
// MINES MOTORU YARDIMCI FONKSİYONLARI
// ---------------------------------------------------------

// STABİL ÇARPAN FORMÜLÜ (%99 RTP - Kesin Matematik)
function calculateMinesMult(mines, opened) {
    if(opened === 0) return 1.00; 
    if(25 - mines - opened < 0) return 0;
    let prob = 1; 
    for(let i=0; i<opened; i++) prob *= (25 - mines - i) / (25 - i);
    return safeFloat((1 / prob) * 0.99);
}

function createMinesBoard(minesCount) {
    let board = Array(25).fill(0); let placed = 0;
    while(placed < minesCount) { 
        let r = crypto.randomInt(0, 25); 
        if(board[r] === 0) { board[r] = 1; placed++; } 
    }
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(serverSeed + ":" + board.join(',')).digest('hex');
    return { board, serverSeed, hash };
}

// ---------------------------------------------------------
// API UÇ NOKTALARI (ENDPOINTS)
// ---------------------------------------------------------

// GET /api/mines/state
router.get('/state', verifyAuth, async (req, res) => {
    try {
        const snap = await colMines().doc(req.user.uid).get();
        if (!snap.exists) return res.json({ ok: true, state: null });
        const data = snap.data();
        res.json({ 
            ok: true, 
            state: { 
                status: data.status, 
                bet: safeFloat(data.bet), 
                minesCount: data.minesCount, 
                opened: data.opened, 
                multiplier: safeFloat(data.multiplier), 
                hash: data.hash, 
                serverSeed: (data.status === 'busted' || data.status === 'cashed_out') ? data.serverSeed : undefined 
            }
        });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/mines/start
router.post('/start', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; 
        const bet = safeFloat(req.body.bet); 
        const minesCount = safeNum(req.body.minesCount, 3);
        let rpEarned = 0;
        
        if (isNaN(bet) || bet < 1 || bet > 10000000) throw new Error('Bahis tutarı 1 ile 10.000.000 MC arasında olmalıdır.');
        if(minesCount < 1 || minesCount > 24) throw new Error('Geçersiz mayın sayısı.');
        
        const session = await db.runTransaction(async (tx) => {
            const existing = await tx.get(colMines().doc(uid));
            
            // Eğer aktif bitmemiş bir oyunu varsa uyar, 5 dakikayı geçtiyse sil
            if (existing.exists && existing.data().status === 'playing') {
                if (nowMs() - safeNum(existing.data().updatedAt, 0) > 300000) {
                    const staleRefund = safeFloat(existing.data().bet);
                    if (staleRefund > 0) tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(staleRefund) });
                    tx.delete(colMines().doc(uid)); 
                } else {
                    throw new Error('Zaten devam eden bir oyununuz var. Lütfen tamamlayın.');
                }
            }
            
            const uSnap = await tx.get(colUsers().doc(uid));
            if(safeFloat(uSnap.data()?.balance) < bet) throw new Error('Bakiye yetersiz.');
            
            tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-bet) });
            // RP (MC harcama)
            rpEarned += awardRpFromSpend(tx, colUsers().doc(uid), uSnap.data()||{}, bet, 'MİNES_BET');
            const boardData = createMinesBoard(minesCount);
            
            const newSession = { 
                uid, status: 'playing', bet, minesCount, board: boardData.board, 
                serverSeed: boardData.serverSeed, hash: boardData.hash, 
                opened: [], multiplier: 1.00, updatedAt: nowMs() 
            };
            tx.set(colMines().doc(uid), newSession); return newSession;
        });
        
        // io objesi server.js tarafında yönetileceği için RP bildirimini global üzerinden dinleyeceğiz
        // Şimdilik route bazında io req.app.get('io') ile alınabilir, entegrasyonu ana dosyada yapacağız.
        const io = req.app.get('io');
        if (io && rpEarned > 0) io.to(`user_${uid}`).emit('user:rp_earned', { earned: rpEarned });
        
        res.json({ ok: true, state: { status: session.status, bet: session.bet, minesCount: session.minesCount, opened: session.opened, multiplier: session.multiplier, hash: session.hash } });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/mines/action
router.post('/action', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const action = req.body.action;
        const result = await db.runTransaction(async (tx) => {
            const sSnap = await tx.get(colMines().doc(uid));
            if (!sSnap.exists || sSnap.data().status !== 'playing') throw new Error('Aktif bir oyun bulunamadı.');
            const s = sSnap.data();
            
            if (action === 'cashout') {
                if (s.opened.length === 0) throw new Error('Henüz taş açmadınız.');
                
                // KÜSURAT HATASI FİX! String'e dönüşme ihtimali yok.
                const winAmount = safeFloat(s.bet * s.multiplier);
                tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(winAmount) });
                s.status = 'cashed_out'; s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                
                return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash, serverSeed: s.serverSeed }, winAmount, board: s.board };
            } 
            else if (action === 'click') {
                const index = safeNum(req.body.index, -1);
                if (index < 0 || index > 24) throw new Error('Geçersiz kutu.');
                if (s.opened.includes(index)) throw new Error('Bu taş zaten açık.');
                
                if (s.board[index] === 1) {
                    s.status = 'busted'; s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                    return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash, serverSeed: s.serverSeed }, board: s.board };
                } else {
                    s.opened.push(index); 
                    s.multiplier = calculateMinesMult(s.minesCount, s.opened.length);
                    
                    // Son elmas bulunduysa anında çekim
                    if (s.opened.length === (25 - s.minesCount)) {
                        const winAmount = safeFloat(s.bet * s.multiplier);
                        tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(winAmount) });
                        s.status = 'cashed_out'; s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                        return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash, serverSeed: s.serverSeed }, winAmount, board: s.board };
                    }
                    
                    s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                    return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash } };
                }
            } else { throw new Error('Geçersiz işlem.'); }
        });
        
        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;