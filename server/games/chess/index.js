const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../../core/security');
const { debitBalance, creditBalance, readBalance } = require('../../core/economyService');
const { runtimeStore } = require('../../core/runtimeStore');
const { initFirebaseAdmin } = require('../../config/firebaseAdmin');
const { getProgression, normalizeXpBigInt } = require('../../core/progressionService');
const { recordRecentActivity } = require('../../core/recentActivityService');
let addAdminLog = null;
try { ({ addAdminLog } = require('../../admin/adminRuntimeLogStore')); } catch (_) { addAdminLog = null; }
const { authenticateSocketRequest } = require('../../core/userSessionService');

const router = express.Router();
const rooms = new Map();
const queue = new Map();
let ioRef = null;
const botTimers = new Map();
const chessRuntimeIssueDedupe = new Map();

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FREE_TIME_MS = 10 * 60 * 1000;
const RECONNECT_GRACE_MS = Number(process.env.CHESS_DISCONNECT_GRACE_MS || 90000);
const QUEUE_TTL_MS = Number(process.env.MATCH_QUEUE_TTL_MS || 120000);
const ROOM_PRIMARY_MS = 60 * 60 * 1000;
const ROOM_EXTENSION_MS = 30 * 60 * 1000;
const ROOM_IDLE_EMPTY_MS = 5 * 60 * 1000;
const ROOM_EXTENSION_RESPONSE_MS = 60 * 1000;
const FREE_DAILY_WIN_LIMIT = 10;
const FREE_OPPONENT_DAILY_WIN_LIMIT = 3;
const FREE_WIN_REWARD_MC = 5000;
const BET_XP_PER_1000_MC = 50;
const MIN_DRAW_OFFER_MOVES = 20;
const BOT_PROFILE = Object.freeze({ uidPrefix: 'bot_', name: 'PlayMatrix', username: 'PlayMatrix', avatar: '/public/assets/images/logo.png', selectedFrame: 100, frameUrl: '/public/assets/frames/frame-18.png' });
const BOT_MOVE_DELAY_MS = Math.max(3000, Math.trunc(Number(process.env.CHESS_BOT_MOVE_DELAY_MS || 3000) || 3000));
const MIN_BET = 1000;
const MAX_BET = 1000000;
const files = 'abcdefgh';
const now = () => Date.now();
const uidOf = (req) => String(req.user?.uid || '');
const isWhite = (p) => p && p === p.toUpperCase();
const colorOf = (p) => isWhite(p) ? 'w' : 'b';
const opposite = (c) => c === 'w' ? 'b' : 'w';
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const squareToPos = (sq) => ({ row: 8 - Number(sq[1]), col: files.indexOf(sq[0]) });
const posToSquare = (row, col) => `${files[col]}${8 - row}`;
const cloneBoard = (board) => board.map((row) => row.slice());
const hashPlayerKey = (roomId, uid) => crypto.createHash('sha256').update(`${roomId}:${uid}`).digest('hex').slice(0, 12);

function createHttpError(statusCode, error) {
  const err = new Error(error);
  err.statusCode = statusCode;
  return err;
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((error) => {
    if (error && error.statusCode && error.statusCode < 500) {
      return res.status(error.statusCode).json({ ok: false, error: error.message || 'REQUEST_REJECTED' });
    }
    error.pmGameContext = { game: 'chess', method: req.method, path: req.originalUrl || req.url };
    return next(error);
  });
}
function safeStr(value, max = 80) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}
function reportChessIssue(scope, details = {}) {
  const status = Number(details.status || 0) || 0;
  if (status > 0 && status < 500) return null;
  const dedupeKey = `${String(scope || '')}:${String(details.path || '')}:${String(details.error || details.message || '')}:${status}`.slice(0, 360);
  const last = chessRuntimeIssueDedupe.get(dedupeKey) || 0;
  if (Date.now() - last < 60_000) return null;
  chessRuntimeIssueDedupe.set(dedupeKey, Date.now());
  const row = { id: `chess_${Date.now()}_${Math.random().toString(36).slice(2)}`, game: 'chess', scope: String(scope || 'chess.unknown'), area: details.area || 'Satranç Backend', error: String(details.error || details.message || scope || 'Satranç olayı').slice(0, 500), message: String(details.error || details.message || scope || 'Satranç olayı').slice(0, 500), reason: details.reason || (details.status ? `HTTP ${details.status} / ${scope}` : 'Satranç backend işleminde hata yakalandı.'), solution: details.solution || 'Satranç backend route, socket veya oda state akışı kontrol edilmeli.', details, createdAt: Date.now(), severity: details.severity || 'error' };
  runtimeStore.errors.set(row.id, row, 24 * 3600000);
  try {
    if (typeof addAdminLog === 'function') addAdminLog('chess.runtime.error', { level: row.severity, source: 'chess', category: row.scope, code: String(details.code || row.scope || 'CHESS_RUNTIME').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80), message: row.error, safeContext: { method: details.method || '', path: details.path || '', status: details.status || 0, roomId: details.roomId || '' }, timestamp: row.createdAt });
  } catch (_) {}
  const method = row.severity === 'info' ? 'info' : row.severity === 'warning' ? 'warn' : 'error';
  console[method]('[game:issue:chess]', JSON.stringify({ scope: row.scope, message: row.message, roomId: details.roomId || '', status: details.status || '', severity: row.severity }));
  return row;
}

function istanbulDateKey(ts = now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts));
    const bag = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${bag.year}-${bag.month}-${bag.day}`;
  } catch (_) {
    return new Date(ts + 3 * 3600000).toJSON().slice(0, 10);
  }
}
function makeLifecycle(createdAt = now()) {
  return {
    createdAt,
    primaryDeadlineAt: createdAt + ROOM_PRIMARY_MS,
    extensionDeadlineAt: 0,
    finalDeadlineAt: 0,
    extensionState: 'none',
    promptAt: 0,
    promptExpiresAt: 0,
    responses: {},
    decidedAt: 0,
    notice: ''
  };
}
function isHumanPlayer(p) { return p && !p.isBot && !String(p.uid || '').startsWith(BOT_PROFILE.uidPrefix); }
function markMeaningfulAction(r) { if (r) { r.lastGameActionAt = now(); r.lastMoveAt = now(); } }
function liveHumanPlayers(r) { return (r?.players || []).filter(isHumanPlayer); }
function displayNameFromProfile(profile = {}, fallbackUid = '') {
  const raw = profile.username || profile.displayName || profile.fullName || profile.name || '';
  if (raw && !String(raw).includes('@')) return safeStr(raw, 40);
  return `Oyuncu-${String(fallbackUid || '').slice(0, 5) || 'PM'}`;
}
function validateBetAmount(value, mode = '') {
  const amount = Math.trunc(Number(value) || 0);
  if (String(mode || '').toLowerCase() === 'bot') return 0;
  if (amount <= 0) return 0;
  if (amount < MIN_BET) throw createHttpError(400, 'BET_MIN_1000_MC');
  if (amount > MAX_BET) throw createHttpError(400, 'BET_MAX_1000000_MC');
  return amount;
}
function normalizeMode(rawMode, betAmount) {
  const m = String(rawMode || '').toLowerCase();
  if (m === 'bot') return 'bot';
  if (m === 'private') return 'private';
  if (betAmount > 0 || m === 'bet' || m === 'ranked') return 'bet';
  return 'free';
}
function parseFen(fen = INITIAL_FEN) {
  const parts = String(fen || INITIAL_FEN).trim().split(/\s+/);
  const rows = (parts[0] || INITIAL_FEN.split(' ')[0]).split('/');
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r += 1) {
    let c = 0;
    for (const ch of rows[r] || '8') {
      if (/\d/.test(ch)) c += Number(ch);
      else if ('prnbqkPRNBQK'.includes(ch) && c < 8) board[r][c++] = ch;
    }
  }
  return {
    board,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: parts[2] && parts[2] !== '-' ? parts[2] : '',
    enPassant: /^[a-h][1-8]$/.test(parts[3] || '') ? parts[3] : '-',
    halfmove: Math.max(0, Number(parts[4]) || 0),
    fullmove: Math.max(1, Number(parts[5]) || 1)
  };
}
function boardToFen(state) {
  const rows = state.board.map((row) => {
    let out = '';
    let empty = 0;
    for (const piece of row) {
      if (!piece) empty += 1;
      else {
        if (empty) out += String(empty);
        empty = 0;
        out += piece;
      }
    }
    if (empty) out += String(empty);
    return out;
  });
  return `${rows.join('/')} ${state.turn} ${state.castling || '-'} ${state.enPassant || '-'} ${state.halfmove || 0} ${state.fullmove || 1}`;
}
function findKing(board, color) {
  const king = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (board[r][c] === king) return { row: r, col: c };
  return null;
}
function isSquareAttacked(state, row, col, byColor) {
  const b = state.board;
  const pawn = byColor === 'w' ? 'P' : 'p';
  const pawnRow = byColor === 'w' ? row + 1 : row - 1;
  for (const dc of [-1, 1]) if (inBounds(pawnRow, col + dc) && b[pawnRow][col + dc] === pawn) return true;
  const knight = byColor === 'w' ? 'N' : 'n';
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (inBounds(row+dr,col+dc) && b[row+dr][col+dc] === knight) return true;
  const bishop = byColor === 'w' ? 'B' : 'b';
  const rook = byColor === 'w' ? 'R' : 'r';
  const queen = byColor === 'w' ? 'Q' : 'q';
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = row + dr, c = col + dc;
    while (inBounds(r,c)) {
      const p = b[r][c];
      if (p) { if (p === bishop || p === queen) return true; break; }
      r += dr; c += dc;
    }
  }
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = row + dr, c = col + dc;
    while (inBounds(r,c)) {
      const p = b[r][c];
      if (p) { if (p === rook || p === queen) return true; break; }
      r += dr; c += dc;
    }
  }
  const king = byColor === 'w' ? 'K' : 'k';
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if ((dr || dc) && inBounds(row+dr,col+dc) && b[row+dr][col+dc] === king) return true;
  return false;
}
function isInCheck(state, color) {
  const king = findKing(state.board, color);
  return king ? isSquareAttacked(state, king.row, king.col, opposite(color)) : true;
}
function pushMove(moves, state, fromRow, fromCol, toRow, toCol, extras = {}) {
  if (!inBounds(toRow,toCol)) return;
  const piece = state.board[fromRow][fromCol];
  const target = state.board[toRow][toCol];
  if (target && colorOf(target) === colorOf(piece)) return;
  moves.push({ from: posToSquare(fromRow, fromCol), to: posToSquare(toRow, toCol), piece, captured: target || '', ...extras });
}
function generatePseudoMoves(state, color, { includeCastling = true } = {}) {
  const moves = [];
  const b = state.board;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = b[r][c];
      if (!piece || colorOf(piece) !== color) continue;
      const type = piece.toLowerCase();
      if (type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoteRow = color === 'w' ? 0 : 7;
        const one = r + dir;
        if (inBounds(one,c) && !b[one][c]) {
          pushMove(moves, state, r,c,one,c, one === promoteRow ? { promotion: 'q' } : {});
          const two = r + dir * 2;
          if (r === startRow && inBounds(two,c) && !b[two][c]) pushMove(moves, state, r,c,two,c, { doublePawn: true });
        }
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc;
          if (!inBounds(tr,tc)) continue;
          const target = b[tr][tc];
          if (target && colorOf(target) !== color) pushMove(moves, state, r,c,tr,tc, tr === promoteRow ? { promotion: 'q' } : {});
          if (state.enPassant && state.enPassant !== '-' && posToSquare(tr, tc) === state.enPassant) pushMove(moves, state, r,c,tr,tc, { enPassant: true, captured: color === 'w' ? 'p' : 'P' });
        }
      } else if (type === 'n') {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) pushMove(moves, state, r,c,r+dr,c+dc);
      } else if (['b','r','q'].includes(type)) {
        const dirs = type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
          let tr = r + dr, tc = c + dc;
          while (inBounds(tr,tc)) {
            const target = b[tr][tc];
            if (!target) pushMove(moves, state, r,c,tr,tc);
            else { if (colorOf(target) !== color) pushMove(moves, state, r,c,tr,tc); break; }
            tr += dr; tc += dc;
          }
        }
      } else if (type === 'k') {
        for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if (dr || dc) pushMove(moves, state, r,c,r+dr,c+dc);
        if (includeCastling && !isInCheck(state, color)) {
          if (color === 'w' && r === 7 && c === 4) {
            if (state.castling.includes('K') && !b[7][5] && !b[7][6] && b[7][7] === 'R' && !isSquareAttacked(state,7,5,'b') && !isSquareAttacked(state,7,6,'b')) pushMove(moves, state, r,c,7,6, { castle: 'K' });
            if (state.castling.includes('Q') && !b[7][3] && !b[7][2] && !b[7][1] && b[7][0] === 'R' && !isSquareAttacked(state,7,3,'b') && !isSquareAttacked(state,7,2,'b')) pushMove(moves, state, r,c,7,2, { castle: 'Q' });
          }
          if (color === 'b' && r === 0 && c === 4) {
            if (state.castling.includes('k') && !b[0][5] && !b[0][6] && b[0][7] === 'r' && !isSquareAttacked(state,0,5,'w') && !isSquareAttacked(state,0,6,'w')) pushMove(moves, state, r,c,0,6, { castle: 'k' });
            if (state.castling.includes('q') && !b[0][3] && !b[0][2] && !b[0][1] && b[0][0] === 'r' && !isSquareAttacked(state,0,3,'w') && !isSquareAttacked(state,0,2,'w')) pushMove(moves, state, r,c,0,2, { castle: 'q' });
          }
        }
      }
    }
  }
  return moves;
}
function stripCastling(castling, chars) {
  let next = castling || '';
  for (const ch of chars) next = next.replace(ch, '');
  return next;
}
function applyMove(state, move) {
  const next = { ...state, board: cloneBoard(state.board) };
  const { row: fr, col: fc } = squareToPos(move.from);
  const { row: tr, col: tc } = squareToPos(move.to);
  const piece = next.board[fr][fc];
  const target = next.board[tr][tc];
  const color = colorOf(piece);
  next.board[fr][fc] = null;
  if (move.enPassant) next.board[color === 'w' ? tr + 1 : tr - 1][tc] = null;
  let placed = piece;
  if (piece.toLowerCase() === 'p' && (tr === 0 || tr === 7)) placed = color === 'w' ? String(move.promotion || 'q').toUpperCase() : String(move.promotion || 'q').toLowerCase();
  next.board[tr][tc] = placed;
  if (move.castle) {
    if (move.castle === 'K') { next.board[7][7] = null; next.board[7][5] = 'R'; }
    if (move.castle === 'Q') { next.board[7][0] = null; next.board[7][3] = 'R'; }
    if (move.castle === 'k') { next.board[0][7] = null; next.board[0][5] = 'r'; }
    if (move.castle === 'q') { next.board[0][0] = null; next.board[0][3] = 'r'; }
  }
  if (piece === 'K') next.castling = stripCastling(next.castling, 'KQ');
  if (piece === 'k') next.castling = stripCastling(next.castling, 'kq');
  if (piece === 'R' && fr === 7 && fc === 0) next.castling = stripCastling(next.castling, 'Q');
  if (piece === 'R' && fr === 7 && fc === 7) next.castling = stripCastling(next.castling, 'K');
  if (piece === 'r' && fr === 0 && fc === 0) next.castling = stripCastling(next.castling, 'q');
  if (piece === 'r' && fr === 0 && fc === 7) next.castling = stripCastling(next.castling, 'k');
  if (target === 'R' && tr === 7 && tc === 0) next.castling = stripCastling(next.castling, 'Q');
  if (target === 'R' && tr === 7 && tc === 7) next.castling = stripCastling(next.castling, 'K');
  if (target === 'r' && tr === 0 && tc === 0) next.castling = stripCastling(next.castling, 'q');
  if (target === 'r' && tr === 0 && tc === 7) next.castling = stripCastling(next.castling, 'k');
  next.enPassant = '-';
  if (piece.toLowerCase() === 'p' && Math.abs(tr - fr) === 2) next.enPassant = posToSquare((tr + fr) / 2, fc);
  next.halfmove = (piece.toLowerCase() === 'p' || target || move.enPassant) ? 0 : (Number(next.halfmove) || 0) + 1;
  if (state.turn === 'b') next.fullmove = (Number(next.fullmove) || 1) + 1;
  next.turn = opposite(state.turn);
  return next;
}
function legalMoves(state, color) {
  return generatePseudoMoves(state, color).filter((m) => {
    const next = applyMove(state, m);
    return !isInCheck(next, color);
  });
}
function findLegalMove(state, from, to, promotion = 'q') {
  const color = state.turn;
  const safePromotion = String(promotion || 'q').toLowerCase()[0] || 'q';
  return legalMoves(state, color).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === safePromotion || safePromotion)) || null;
}
function maybeFinishByBoard(r, movedByColor) {
  const state = parseFen(r.fen);
  const side = state.turn;
  const moves = legalMoves(state, side);
  const check = isInCheck(state, side);
  r.check = check ? side : '';
  if (moves.length === 0) {
    r.status = 'finished';
    r.result = check ? 'checkmate' : 'stalemate';
    r.winnerColor = check ? movedByColor : 'draw';
    const winner = check ? r.players.find((p) => p.color === movedByColor) : null;
    r.winnerUid = winner?.uid || '';
    return true;
  }
  if ((state.halfmove || 0) >= 100) {
    r.status = 'finished';
    r.result = 'fifty-move-draw';
    r.winnerColor = 'draw';
    return true;
  }
  return false;
}
async function readProfile(uid) {
  const { db } = initFirebaseAdmin();
  if (!db || !uid) return { uid, username: `Oyuncu-${String(uid).slice(0,5)}`, avatar: '', selectedFrame: 0, accountXp: 0 };
  const snap = await db.collection('users').doc(uid).get().catch(() => null);
  const data = snap?.exists ? (snap.data() || {}) : {};
  return { uid, ...data };
}
async function buildPlayer(req, color) {
  const uid = uidOf(req);
  const profile = await readProfile(uid);
  const name = displayNameFromProfile(profile, uid);
  return {
    uid,
    name,
    username: name,
    avatar: safeStr(profile.avatar || profile.photoURL || '', 300),
    selectedFrame: Math.max(0, Math.trunc(Number(profile.selectedFrame || profile.frame || 0) || 0)),
    frameUrl: safeStr(profile.marketFrameUrl || profile.frameUrl || '', 1000),
    marketFrameUrl: safeStr(profile.marketFrameUrl || profile.frameUrl || '', 1000),
    profileBadgeId: safeStr(profile.profileBadgeId || '', 200),
    profileBadgeUrl: safeStr(profile.profileBadgeUrl || '', 1000),
    nameEffectId: safeStr(profile.nameEffectId || '', 200),
    nameEffectClass: safeStr(profile.nameEffectClass || '', 200),
    gameTableThemeId: safeStr(profile.gameTableThemeId || '', 200),
    gameTableThemeUrl: safeStr(profile.gameTableThemeUrl || '', 1000),
    color,
    timeLeftMs: FREE_TIME_MS,
    connected: true,
    joinedAt: now(),
    lastSeenAt: now(),
    disconnectedAt: 0
  };
}
function publicPlayer(p, r, viewerUid = '') {
  if (!p) return null;
  return {
    uid: viewerUid === p.uid ? p.uid : '',
    playerKey: hashPlayerKey(r.id, p.uid),
    username: p.username || p.name || 'Oyuncu',
    name: p.username || p.name || 'Oyuncu',
    avatar: p.avatar || '',
    selectedFrame: Number(p.selectedFrame || 0) || 0,
    frameUrl: p.frameUrl || p.marketFrameUrl || '',
    marketFrameUrl: p.marketFrameUrl || p.frameUrl || '',
    profileBadgeId: p.profileBadgeId || '',
    profileBadgeUrl: p.profileBadgeUrl || '',
    nameEffectId: p.nameEffectId || '',
    nameEffectClass: p.nameEffectClass || '',
    gameTableThemeId: p.gameTableThemeId || '',
    gameTableThemeUrl: p.gameTableThemeUrl || '',
    color: p.color,
    connected: !!p.connected,
    timeLeftMs: Math.max(0, Math.trunc(Number(p.timeLeftMs) || 0)),
    isMe: viewerUid === p.uid
  };
}
function resultSummaryFor(r, viewerUid = '') {
  if (r.status !== 'finished') return null;
  if (r.settlementFailed) {
    return {
      gameType: 'chess', resultCode: r.result || 'finished', outcome: 'pending', settledAt: r.finishedAt || r.updatedAt || now(),
      title: 'İŞLEM TAMAMLANAMADI',
      message: 'Oyun sonucu şu anda güvenli şekilde tamamlanamadı. Lütfen tekrar dene.',
      xpAwarded: 0,
      freeReward: null,
      balance: null,
      progression: null,
      settlementFailed: true
    };
  }
  const me = r.players.find((p) => p.uid === viewerUid);
  const won = !!me && r.winnerUid === me.uid;
  const draw = r.winnerColor === 'draw' || r.result === 'draw' || r.result === 'stalemate' || r.result === 'fifty-move-draw';
  const xp = r.xpAwards?.[viewerUid]?.xpAwarded || 0;
  const balance = r.settlement?.[viewerUid]?.balance;
  const freeReward = r.freeRewards?.[viewerUid] || null;
  const outcome = draw ? 'draw' : won ? 'win' : 'loss';
  let message = '';
  if (r.result === 'player-exit') message = won ? 'Rakip oyundan ayrıldı. Oda kapatıldı ve sonuç işlendi.' : 'Oyundan ayrıldın. Oda kapatıldı ve rakibe bildirildi.';
  else if (r.result === 'inactivity-timeout') message = won ? 'Rakip 5 dakika hamle yapmadığı için oyun kapatıldı ve sonuç işlendi.' : '5 dakika hamle yapılmadığı için oyun kapatıldı.';
  else if (r.mode === 'bot') message = 'Bot oyunu eğlence modudur. MC, XP ve level ödülü verilmez.';
  else if (draw && r.mode === 'bet') message = `Bahisli Satranç berabere bitti. Bahsin yarısı iade edildi. Beraberlikte XP verilmez.`;
  else if (draw) message = 'Satranç berabere bitti. Bu sonuçta ödül verilmez.';
  else if (r.mode === 'free' && won) {
    if (freeReward?.rewarded) message = `Bahissiz Satranç galibiyeti: +${FREE_WIN_REWARD_MC.toLocaleString('tr-TR')} MC. Günlük hak: ${freeReward.used}/${FREE_DAILY_WIN_LIMIT}.`;
    else message = freeReward?.reason === 'DAILY_LIMIT' ? 'Bahissiz Satranç galibiyeti işlendi. Günlük 10 ödül hakkı dolduğu için MC verilmedi.' : 'Bahissiz Satranç sonucu işlendi.';
  } else if (r.mode === 'bet') {
    message = won
      ? `Bahisli Satranç galibiyeti işlendi. Pot: ${Number(r.pot || 0).toLocaleString('tr-TR')} MC. +${xp.toLocaleString('tr-TR')} XP.`
      : `Bahisli Satranç kaybı işlendi. Kazanç yok. Kullanılan bahis için +${xp.toLocaleString('tr-TR')} XP.`;
  } else {
    message = won ? 'Satranç galibiyeti işlendi.' : 'Satranç maçı kayıp olarak işlendi.';
  }
  return {
    gameType: 'chess', resultCode: r.result || 'finished', outcome, settledAt: r.finishedAt || r.updatedAt || now(),
    title: draw ? 'BERABERE' : won ? 'KAZANDIN!' : 'KAYBETTİN',
    message,
    xpAwarded: xp,
    freeReward,
    balance,
    progression: r.xpAwards?.[viewerUid]?.progression || null
  };
}
function publicRoom(r, viewerUid = '') {
  const host = publicPlayer(r.players[0], r, viewerUid) || { username: 'Bilinmeyen', name: 'Bilinmeyen', color: 'w' };
  const guest = publicPlayer(r.players[1], r, viewerUid) || null;
  const lifecycle = r.lifecycle || makeLifecycle(r.createdAt || now());
  const extensionPrompt = r.status === 'playing' && lifecycle.extensionState === 'pending'
    ? {
        active: true,
        promptAt: lifecycle.promptAt || 0,
        promptExpiresAt: lifecycle.promptExpiresAt || 0,
        message: '60 dakika süre doldu. Son 30 dakika kaldı. 30 dakika sonra oda kapanacaktır. Bu bir bilgilendirme mesajıdır. Oyuna devam edilsin mi?',
        myResponse: lifecycle.responses?.[viewerUid] || '',
        responses: liveHumanPlayers(r).map((p) => ({ playerKey: hashPlayerKey(r.id, p.uid), username: p.username || p.name || 'Oyuncu', responded: !!lifecycle.responses?.[p.uid], accepted: lifecycle.responses?.[p.uid] === 'accept' }))
      }
    : null;
  return {
    id: r.id, roomId: r.id, status: r.status, mode: r.mode, bet: r.bet, pot: r.pot,
    botRoom: r.mode === 'bot', joinDisabled: r.mode === 'bot' || r.status !== 'waiting', joinDisabledReason: r.mode === 'bot' ? 'BOT_ROOM_NOT_JOINABLE' : r.status !== 'waiting' ? 'ROOM_NOT_WAITING' : '', botThinkingUntil: r.botThinkingUntil || 0,
    host, guest,
    hostName: host.username, guestName: guest?.username || 'Bilinmeyen',
    hostUid: host.uid || '', guestUid: guest?.uid || '',
    players: r.players.map((p) => publicPlayer(p, r, viewerUid)),
    turn: r.turn, fen: r.fen, moves: r.moves, winnerUid: viewerUid === r.winnerUid ? r.winnerUid : '', winnerColor: r.winnerColor || '', winner: r.winnerColor || '', result: r.result || '', resultSummary: resultSummaryFor(r, viewerUid), drawOfferBy: r.drawOfferBy && r.drawOfferBy !== viewerUid ? 'opponent' : r.drawOfferBy === viewerUid ? 'me' : '', drawMinMoves: MIN_DRAW_OFFER_MOVES, drawMoveCount: Array.isArray(r.moves) ? r.moves.length : 0, drawAvailable: Array.isArray(r.moves) && r.moves.length >= MIN_DRAW_OFFER_MOVES, check: r.check || '', stateVersion: r.stateVersion, createdAt: r.createdAt, updatedAt: r.updatedAt, finishedAt: r.finishedAt || 0,
    lifecycle: { primaryDeadlineAt: lifecycle.primaryDeadlineAt || 0, extensionDeadlineAt: lifecycle.extensionDeadlineAt || 0, finalDeadlineAt: lifecycle.finalDeadlineAt || 0, extensionState: lifecycle.extensionState || 'none', notice: lifecycle.notice || '' },
    settlementFailed: !!r.settlementFailed, settlementError: r.settlementFailed ? 'SETTLEMENT_FAILED' : '',
    extensionPrompt
  };
}
function activeRoomFor(uid) {
  return [...rooms.values()].find((r) => r.status !== 'finished' && r.players.some((p) => p.uid === uid));
}
function findOpen({ uid, mode = 'free', bet = 0 } = {}) {
  return [...rooms.values()].find((r) => r.status === 'waiting' && r.mode !== 'private' && r.mode !== 'bot' && r.mode === mode && Number(r.bet || 0) === Number(bet || 0) && r.players.length < 2 && !r.players.some((p) => p.uid === uid));
}
function touchRoom(r) { r.updatedAt = now(); }
function syncClock(r) {
  if (!r || r.status !== 'playing') return false;
  const t = now();
  if (!r.clock) r.clock = { lastTurnAt: t };
  const current = r.players.find((p) => p.color === r.turn);
  if (!current) return false;
  const elapsed = Math.max(0, t - (r.clock.lastTurnAt || t));
  if (elapsed > 0) {
    current.timeLeftMs = Math.max(0, Math.trunc(Number(current.timeLeftMs || 0) - elapsed));
    r.clock.lastTurnAt = t;
  }
  if (current.timeLeftMs <= 0) {
    const winner = r.players.find((p) => p.uid !== current.uid);
    r.status = 'finished';
    r.result = 'timeout';
    r.winnerUid = winner?.uid || '';
    r.winnerColor = winner?.color || '';
    r.finishedAt = t;
    r.stateVersion += 1;
    return true;
  }
  return false;
}
async function chargePlayer(req, r) {
  if (!r.bet) return { ok: true, balance: await readBalance(uidOf(req)).catch(() => 0) };
  return debitBalance({ uid: uidOf(req), amount: r.bet, reason: 'chess-bet', idempotencyKey: `chess:bet:${r.id}:${uidOf(req)}`, metadata: { roomId: r.id, mode: r.mode } });
}
async function applyXpAndStats({ uid, xp, outcome, roomId, mode, bet }) {
  if (!uid || !xp) return { ok: true, xpAwarded: 0, progression: getProgression(0) };
  const key = `chess:xp:${roomId}:${uid}`;
  const memoryKey = `idem:${key}`;
  if (runtimeStore.temporary.get(memoryKey)) return runtimeStore.temporary.get(memoryKey);
  const { db } = initFirebaseAdmin();
  if (!db) {
    const xpKey = `xp:${uid}`;
    const statsKey = `gameStats:${uid}`;
    const current = normalizeXpBigInt(runtimeStore.temporary.get(xpKey) || 0);
    const before = getProgression(current);
    const safeXp = before.isMaxLevel ? 0 : Math.max(0, Math.trunc(xp));
    const next = current + BigInt(safeXp);
    const progression = getProgression(next);
    const previousStats = runtimeStore.temporary.get(statsKey) || {};
    const previousChess = previousStats.chess && typeof previousStats.chess === 'object' ? previousStats.chess : {};
    const previousTotal = previousStats.total && typeof previousStats.total === 'object' ? previousStats.total : {};
    const patchChess = {
      ...previousChess,
      rounds: Number(previousChess.rounds || 0) + 1,
      wins: Number(previousChess.wins || 0) + (outcome === 'win' ? 1 : 0),
      losses: Number(previousChess.losses || 0) + (outcome === 'loss' ? 1 : 0),
      draws: Number(previousChess.draws || 0) + (outcome === 'draw' ? 1 : 0)
    };
    patchChess.winRatePct = patchChess.rounds ? Math.round((patchChess.wins / patchChess.rounds) * 1000) / 10 : 0;
    const patchTotal = {
      ...previousTotal,
      rounds: Number(previousTotal.rounds || 0) + 1,
      wins: Number(previousTotal.wins || 0) + (outcome === 'win' ? 1 : 0),
      losses: Number(previousTotal.losses || 0) + (outcome === 'loss' ? 1 : 0),
      draws: Number(previousTotal.draws || 0) + (outcome === 'draw' ? 1 : 0)
    };
    patchTotal.winRatePct = patchTotal.rounds ? Math.round((patchTotal.wins / patchTotal.rounds) * 1000) / 10 : 0;
    runtimeStore.temporary.set(xpKey, next.toString(), 30 * 86400000);
    runtimeStore.temporary.set(statsKey, { ...previousStats, chess: patchChess, total: patchTotal }, 30 * 86400000);
    const out = { ok: true, firestore: false, xpAwarded: safeXp, xpLocked: before.isMaxLevel, xpReason: before.isMaxLevel ? 'MAX_LEVEL_REACHED' : '', progression };
    runtimeStore.temporary.set(memoryKey, out, 24 * 3600000);
    return out;
  }
  const userRef = db.collection('users').doc(uid);
  const idemRef = db.collection('idempotency').doc(key);
  let output = null;
  await db.runTransaction(async (tx) => {
    const idem = await tx.get(idemRef);
    if (idem.exists) { output = idem.data().result; return; }
    const snap = await tx.get(userRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const current = normalizeXpBigInt(data.xp ?? data.accountXp ?? 0);
    const before = getProgression(current);
    const safeXp = before.isMaxLevel ? 0 : Math.max(0, Math.trunc(xp));
    const next = current + BigInt(safeXp);
    const progression = getProgression(next);
    const gameStats = data.gameStats && typeof data.gameStats === 'object' ? data.gameStats : {};
    const chess = gameStats.chess && typeof gameStats.chess === 'object' ? gameStats.chess : {};
    const total = gameStats.total && typeof gameStats.total === 'object' ? gameStats.total : {};
    const patchChess = {
      ...chess,
      rounds: Number(chess.rounds || 0) + 1,
      wins: Number(chess.wins || 0) + (outcome === 'win' ? 1 : 0),
      losses: Number(chess.losses || 0) + (outcome === 'loss' ? 1 : 0),
      draws: Number(chess.draws || 0) + (outcome === 'draw' ? 1 : 0)
    };
    patchChess.winRatePct = patchChess.rounds ? Math.round((patchChess.wins / patchChess.rounds) * 1000) / 10 : 0;
    const patchTotal = {
      ...total,
      rounds: Number(total.rounds || 0) + 1,
      wins: Number(total.wins || 0) + (outcome === 'win' ? 1 : 0),
      losses: Number(total.losses || 0) + (outcome === 'loss' ? 1 : 0),
      draws: Number(total.draws || 0) + (outcome === 'draw' ? 1 : 0)
    };
    patchTotal.winRatePct = patchTotal.rounds ? Math.round((patchTotal.wins / patchTotal.rounds) * 1000) / 10 : 0;
    output = { ok: true, xpAwarded: safeXp, xpLocked: before.isMaxLevel, xpReason: before.isMaxLevel ? 'MAX_LEVEL_REACHED' : '', progression };
    tx.set(userRef, { xp: progression.xp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression, gameStats: { ...gameStats, chess: patchChess, total: patchTotal }, monthlyActiveScore: Number(data.monthlyActiveScore || 0) + 1, updatedAt: now() }, { merge: true });
    tx.set(idemRef, { key, type: 'chess-xp', uid, roomId, mode, bet, outcome, createdAt: now(), result: output }, { merge: false });
  });
  runtimeStore.temporary.set(memoryKey, output, 24 * 3600000);
  return output;
}
async function awardFreeWinReward({ uid, roomId, opponentUid = '' }) {
  if (!uid || !roomId) return { ok: false, rewarded: false, reason: 'INVALID_REQUEST', amount: 0, used: 0, limit: FREE_DAILY_WIN_LIMIT };
  const dateKey = istanbulDateKey();
  const amount = FREE_WIN_REWARD_MC;
  const safeOpponentUid = String(opponentUid || '').trim();
  const opponentHash = safeOpponentUid ? crypto.createHash('sha256').update(`${dateKey}:${uid}:${safeOpponentUid}`).digest('hex').slice(0, 24) : '';
  const { db } = initFirebaseAdmin();
  if (!db) {
    const claimKey = `chess:free-win:${dateKey}:${roomId}:${uid}`;
    if (runtimeStore.temporary.get(claimKey)) return runtimeStore.temporary.get(claimKey);
    const countKey = `chess:free-win-count:${dateKey}:${uid}`;
    const opponentKey = opponentHash ? `chess:free-win-opponent:${dateKey}:${uid}:${opponentHash}` : '';
    const usedBefore = Number(runtimeStore.temporary.get(countKey) || 0);
    const opponentUsedBefore = opponentKey ? Number(runtimeStore.temporary.get(opponentKey) || 0) : 0;
    if (usedBefore >= FREE_DAILY_WIN_LIMIT) return { ok: true, rewarded: false, reason: 'DAILY_LIMIT', amount: 0, used: usedBefore, limit: FREE_DAILY_WIN_LIMIT };
    if (opponentKey && opponentUsedBefore >= FREE_OPPONENT_DAILY_WIN_LIMIT) return { ok: true, rewarded: false, reason: 'SAME_OPPONENT_LIMIT', amount: 0, used: usedBefore, opponentUsed: opponentUsedBefore, opponentLimit: FREE_OPPONENT_DAILY_WIN_LIMIT, limit: FREE_DAILY_WIN_LIMIT };
    const credit = await creditBalance({ uid, amount, reason: 'chess-free-win-reward', idempotencyKey: claimKey, metadata: { roomId, dateKey, opponentHash } }).catch((error) => ({ ok: false, error: error.message }));
    const out = { ok: !!credit.ok, rewarded: !!credit.ok, amount: credit.ok ? amount : 0, balance: credit.balance, used: usedBefore + (credit.ok ? 1 : 0), opponentUsed: opponentUsedBefore + (credit.ok && opponentKey ? 1 : 0), opponentLimit: FREE_OPPONENT_DAILY_WIN_LIMIT, limit: FREE_DAILY_WIN_LIMIT, dateKey };
    if (credit.ok) {
      runtimeStore.temporary.set(countKey, usedBefore + 1, 36 * 3600000);
      if (opponentKey) runtimeStore.temporary.set(opponentKey, opponentUsedBefore + 1, 36 * 3600000);
    }
    runtimeStore.temporary.set(claimKey, out, 36 * 3600000);
    return out;
  }
  const claimRef = db.collection('idempotency').doc(`chess:free-win:${dateKey}:${roomId}:${uid}`);
  const counterRef = db.collection('rewardCounters').doc(`chessFreeWin_${dateKey}_${uid}`);
  const opponentCounterRef = opponentHash ? db.collection('rewardCounters').doc(`chessFreeWinOpponent_${dateKey}_${uid}_${opponentHash}`) : null;
  let preflight = null;
  await db.runTransaction(async (tx) => {
    const reads = [tx.get(claimRef), tx.get(counterRef)];
    if (opponentCounterRef) reads.push(tx.get(opponentCounterRef));
    const [claim, counter, opponentCounter] = await Promise.all(reads);
    if (claim.exists) {
      const stored = claim.data() || {};
      preflight = stored.result || { ok: true, pending: stored.status === 'pending', reason: stored.status || 'CLAIM_EXISTS' };
      return;
    }
    const data = counter.exists ? counter.data() : {};
    const used = Math.max(0, Number(data.used || 0));
    const reserved = Math.max(0, Number(data.reserved || 0));
    const oppData = opponentCounter?.exists ? opponentCounter.data() : {};
    const opponentUsed = Math.max(0, Number(oppData.used || 0));
    const opponentReserved = Math.max(0, Number(oppData.reserved || 0));
    if (used >= FREE_DAILY_WIN_LIMIT || used + reserved >= FREE_DAILY_WIN_LIMIT) {
      preflight = { ok: true, rewarded: false, reason: 'DAILY_LIMIT', amount: 0, used, limit: FREE_DAILY_WIN_LIMIT, dateKey };
      tx.set(claimRef, { key: claimRef.id, type: 'chess-free-win', uid, roomId, dateKey, status: 'limited', createdAt: now(), result: preflight }, { merge: false });
      return;
    }
    if (opponentCounterRef && (opponentUsed >= FREE_OPPONENT_DAILY_WIN_LIMIT || opponentUsed + opponentReserved >= FREE_OPPONENT_DAILY_WIN_LIMIT)) {
      preflight = { ok: true, rewarded: false, reason: 'SAME_OPPONENT_LIMIT', amount: 0, used, opponentUsed, opponentLimit: FREE_OPPONENT_DAILY_WIN_LIMIT, limit: FREE_DAILY_WIN_LIMIT, dateKey };
      tx.set(claimRef, { key: claimRef.id, type: 'chess-free-win', uid, roomId, opponentHash, dateKey, status: 'opponent-limited', createdAt: now(), result: preflight }, { merge: false });
      return;
    }
    preflight = { ok: true, proceedCredit: true, usedBefore: used, reservedBefore: reserved, opponentUsedBefore: opponentUsed, opponentReservedBefore: opponentReserved };
    tx.set(counterRef, { uid, dateKey, used, reserved: reserved + 1, updatedAt: now() }, { merge: true });
    if (opponentCounterRef) tx.set(opponentCounterRef, { uid, opponentHash, dateKey, used: opponentUsed, reserved: opponentReserved + 1, updatedAt: now() }, { merge: true });
    tx.set(claimRef, { key: claimRef.id, type: 'chess-free-win', uid, roomId, opponentHash, dateKey, status: 'pending', createdAt: now() }, { merge: false });
  });
  if (preflight && !preflight.proceedCredit) return preflight;
  const credit = await creditBalance({ uid, amount, reason: 'chess-free-win-reward', idempotencyKey: `chess:free-win-credit:${dateKey}:${roomId}:${uid}`, metadata: { roomId, dateKey, opponentHash } }).catch((error) => ({ ok: false, error: error.message }));
  let out = null;
  await db.runTransaction(async (tx) => {
    const reads = [tx.get(claimRef), tx.get(counterRef)];
    if (opponentCounterRef) reads.push(tx.get(opponentCounterRef));
    const [claim, counter, opponentCounter] = await Promise.all(reads);
    const stored = claim.exists ? claim.data() : {};
    if (stored?.result && stored.status !== 'pending') { out = stored.result; return; }
    const data = counter.exists ? counter.data() : {};
    const used = Math.max(0, Number(data.used || preflight?.usedBefore || 0));
    const reserved = Math.max(0, Number(data.reserved || 0));
    const oppData = opponentCounter?.exists ? opponentCounter.data() : {};
    const opponentUsed = Math.max(0, Number(oppData.used || preflight?.opponentUsedBefore || 0));
    const opponentReserved = Math.max(0, Number(oppData.reserved || 0));
    out = { ok: !!credit.ok, rewarded: !!credit.ok, reason: credit.ok ? 'REWARDED' : 'CREDIT_FAILED', amount: credit.ok ? amount : 0, balance: credit.balance, used: used + (credit.ok ? 1 : 0), opponentUsed: opponentUsed + (credit.ok && opponentCounterRef ? 1 : 0), opponentLimit: FREE_OPPONENT_DAILY_WIN_LIMIT, limit: FREE_DAILY_WIN_LIMIT, dateKey };
    tx.set(counterRef, { uid, dateKey, used: out.used, reserved: Math.max(0, reserved - 1), updatedAt: now() }, { merge: true });
    if (opponentCounterRef) tx.set(opponentCounterRef, { uid, opponentHash, dateKey, used: out.opponentUsed, reserved: Math.max(0, opponentReserved - 1), updatedAt: now() }, { merge: true });
    tx.set(claimRef, { key: claimRef.id, type: 'chess-free-win', uid, roomId, opponentHash, dateKey, status: 'final', finalizedAt: now(), result: out }, { merge: true });
  });
  return out || { ok: false, rewarded: false, reason: 'REWARD_FINALIZE_FAILED', amount: 0, used: Number(preflight?.usedBefore || 0), limit: FREE_DAILY_WIN_LIMIT, dateKey };
}

function markChessSettlementFailure(r, reason = '', error = null) {
  if (!r) return;
  r.settlementFailed = true;
  r.settlementError = 'SETTLEMENT_FAILED';
  r.settled = false;
  reportChessIssue('settlement.failed', {
    error: error?.message || String(error || 'SETTLEMENT_FAILED'),
    status: 500,
    roomId: r.id,
    reason,
    severity: 'error',
    code: 'CHESS_SETTLEMENT_FAILED'
  });
}

function markChessSettlementWarning(r, scope = '', details = {}) {
  if (!r) return;
  r.settlementWarnings = Array.isArray(r.settlementWarnings) ? r.settlementWarnings : [];
  r.settlementWarnings.push({ scope, at: now(), message: safeStr(details.error || details.message || scope || 'warning', 160) });
  reportChessIssue(scope || 'settlement.warning', { ...details, roomId: r.id, severity: 'warning' });
}

function hasCriticalChessSettlementFailure(r) {
  const failedSettlement = Object.values(r?.settlement || {}).some((entry) => entry && entry.ok === false);
  const failedFreeReward = Object.values(r?.freeRewards || {}).some((entry) => entry && entry.ok === false && entry.reason !== 'DAILY_LIMIT' && entry.reason !== 'SAME_OPPONENT_LIMIT');
  return failedSettlement || failedFreeReward;
}

async function applyChessEconomySettlement(r) {
  r.settlement = r.settlement || {};
  r.xpAwards = r.xpAwards || {};
  r.freeRewards = r.freeRewards || {};
  const humans = liveHumanPlayers(r);
  const isBetReal = r.bet > 0 && r.mode === 'bet' && humans.length === 2;
  const isFreeReal = r.mode === 'free' && humans.length === 2;
  const draw = r.winnerColor === 'draw' || ['draw','stalemate','fifty-move-draw'].includes(r.result);
  if (isBetReal) {
    if (draw) {
      for (const p of humans) {
        const credit = await creditBalance({ uid: p.uid, amount: Math.floor(r.bet / 2), reason: 'chess-draw-half-refund', idempotencyKey: `chess:draw:${r.id}:${p.uid}`, metadata: { roomId: r.id, result: r.result, xpAwarded: 0 } }).catch((error) => ({ ok: false, error: error.message }));
        r.settlement[p.uid] = credit;
      }
    } else if (r.winnerUid) {
      const credit = await creditBalance({ uid: r.winnerUid, amount: r.pot, reason: 'chess-win', idempotencyKey: `chess:win:${r.id}:${r.winnerUid}`, metadata: { roomId: r.id, result: r.result } }).catch((error) => ({ ok: false, error: error.message }));
      r.settlement[r.winnerUid] = credit;
    }
    if (!draw) {
      const xp = Math.max(BET_XP_PER_1000_MC, Math.floor(r.bet / 1000) * BET_XP_PER_1000_MC);
      for (const p of humans) {
        const outcome = p.uid === r.winnerUid ? 'win' : 'loss';
        r.xpAwards[p.uid] = await applyXpAndStats({ uid: p.uid, xp, outcome, roomId: r.id, mode: r.mode, bet: r.bet }).catch((error) => ({ ok: false, xpAwarded: 0, error: error.message }));
        if (r.xpAwards[p.uid]?.ok === false) markChessSettlementWarning(r, 'settlement.xp.warning', { error: r.xpAwards[p.uid]?.error || 'XP_AWARD_FAILED' });
      }
    }
  } else if (isFreeReal && !draw && r.winnerUid) {
    const opponent = humans.find((p) => p.uid !== r.winnerUid);
    r.freeRewards[r.winnerUid] = await awardFreeWinReward({ uid: r.winnerUid, roomId: r.id, opponentUid: opponent?.uid || '' }).catch((error) => ({ ok: false, rewarded: false, error: error.message, amount: 0 }));
  }
  if (hasCriticalChessSettlementFailure(r)) {
    const err = new Error('SETTLEMENT_FAILED');
    err.details = { settlement: r.settlement, freeRewards: r.freeRewards };
    throw err;
  }
  return { humans, draw };
}

function applyChessSettlementSideEffects(r, reason = '', humans = liveHumanPlayers(r), draw = false) {
  for (const p of humans) {
    try {
      const outcome = draw ? 'draw' : p.uid === r.winnerUid ? 'win' : 'loss';
      const mc = Number(r.settlement?.[p.uid]?.amount || r.settlement?.[p.uid]?.credit || r.freeRewards?.[p.uid]?.amount || 0) || 0;
      const xp = Number(r.xpAwards?.[p.uid]?.xpAwarded || 0) || 0;
      recordRecentActivity({ id: `chess:${r.id}:${p.uid}`, source: 'chess', game: 'chess', title: draw ? 'Satranç Beraberlik' : isBotMode(r) ? 'Satranç Botlu Maç' : 'Satranç Sonucu', username: p.username || p.name || 'Oyuncu', uid: p.uid, amount: mc, xp, outcome, rewardLabel: draw ? 'Beraberlik sonucu' : outcome === 'win' ? 'Satranç galibiyeti' : 'Satranç sonucu' });
    } catch (error) {
      markChessSettlementWarning(r, 'settlement.activity.warning', { error: error?.message || 'RECENT_ACTIVITY_FAILED' });
    }
  }
  try { console.info('[chess:settle]', JSON.stringify({ roomId: r.id, reason, result: r.result, winnerColor: r.winnerColor || '', mode: r.mode, bet: r.bet, pot: r.pot })); } catch (_) {}
  try { emitRoom(r); } catch (error) { markChessSettlementWarning(r, 'settlement.emit-room.warning', { error: error?.message || 'EMIT_ROOM_FAILED' }); }
  try { emitLobby(); } catch (error) { markChessSettlementWarning(r, 'settlement.emit-lobby.warning', { error: error?.message || 'EMIT_LOBBY_FAILED' }); }
}

async function settleRoom(r, reason = '') {
  if (!r) return { room: r, settlementOk: false, settlementFailed: true, settlementError: 'ROOM_MISSING' };
  if (r.settled) return { room: r, settlementOk: !r.settlementFailed, settlementFailed: !!r.settlementFailed, settlementError: r.settlementError || '' };
  if (r.status !== 'finished') return { room: r, settlementOk: true, skipped: true };
  r.settled = true;
  r.settlementFailed = false;
  r.settlementError = '';
  r.finishedAt = r.finishedAt || now();
  r.settlement = r.settlement || {};
  r.xpAwards = r.xpAwards || {};
  r.freeRewards = r.freeRewards || {};
  let sideEffectInput = { humans: liveHumanPlayers(r), draw: r.winnerColor === 'draw' || ['draw','stalemate','fifty-move-draw'].includes(r.result) };
  try {
    sideEffectInput = await applyChessEconomySettlement(r);
  } catch (error) {
    markChessSettlementFailure(r, reason, error);
    return { room: r, settlementOk: false, settlementFailed: true, settlementError: r.settlementError || 'SETTLEMENT_FAILED' };
  }
  applyChessSettlementSideEffects(r, reason, sideEffectInput.humans, sideEffectInput.draw);
  return { room: r, settlementOk: true, settlementFailed: false, settlementError: '' };
}
async function finishRoom(r, { result, winnerUid = '', winnerColor = '', reason = '' } = {}) {
  if (!r) return { room: r, settlementOk: false, settlementFailed: true, settlementError: 'ROOM_MISSING' };
  if (r.status === 'finished') return settleRoom(r, reason || r.result || 'finished');
  r.status = 'finished';
  r.result = result || 'finished';
  r.winnerUid = winnerUid || '';
  r.winnerColor = winnerColor || (winnerUid ? r.players.find((p) => p.uid === winnerUid)?.color || '' : 'draw');
  r.finishedAt = now();
  r.stateVersion += 1;
  touchRoom(r);
  return settleRoom(r, reason || result);
}
async function ensureChessBalanceBeforeRoomCreate(uid, bet, mode) {
  if (mode !== 'bet' || !bet) return { ok: true };
  const balance = await readBalance(uid).catch(() => 0);
  if (Number(balance || 0) < Number(bet || 0)) return { ok: false, status: 409, error: 'INSUFFICIENT_BALANCE', balance };
  return { ok: true, balance };
}

async function createRoomFor(req, opts = {}) {
  const owner = uidOf(req);
  const betAmount = validateBetAmount(opts.bet, opts.mode);
  const mode = normalizeMode(opts.mode, betAmount);
  const existing = activeRoomFor(owner);
  if (existing) {
    existing._lastExistingRequest = { existing: true, requestedMode: mode, requestedBet: betAmount, existingMode: existing.mode, existingBet: existing.bet };
    touchRoom(existing);
    return existing;
  }
  const balanceCheck = await ensureChessBalanceBeforeRoomCreate(owner, betAmount, mode);
  if (!balanceCheck.ok) throw createHttpError(balanceCheck.status || 409, balanceCheck.error || 'INSUFFICIENT_BALANCE');
  const ts = now();
  const player = await buildPlayer(req, 'w');
  const r = { id: `ch_${ts}_${crypto.randomBytes(12).toString('hex')}`, status: mode === 'bot' ? 'playing' : 'waiting', mode, bet: mode === 'bot' ? 0 : betAmount, pot: mode === 'bot' ? 0 : betAmount, fen: INITIAL_FEN, turn: 'w', moves: [], moveIds: {}, stateVersion: 1, drawOfferBy: '', check: '', createdAt: ts, updatedAt: ts, finishedAt: 0, players: [player], clock: { lastTurnAt: ts }, settlement: {}, xpAwards: {}, freeRewards: {}, lifecycle: makeLifecycle(ts), lastGameActionAt: ts, lastMoveAt: 0, botThinkingUntil: 0 };
  if (mode === 'bot') {
    r.players.push({ uid: `${BOT_PROFILE.uidPrefix}${r.id}`, name: BOT_PROFILE.name, username: BOT_PROFILE.username, avatar: BOT_PROFILE.avatar, selectedFrame: BOT_PROFILE.selectedFrame, frameUrl: BOT_PROFILE.frameUrl, marketFrameUrl: BOT_PROFILE.frameUrl, profileBadgeId: '', profileBadgeUrl: '', nameEffectId: '', nameEffectClass: '', gameTableThemeId: '', gameTableThemeUrl: '', color: 'b', timeLeftMs: FREE_TIME_MS, connected: true, joinedAt: ts, lastSeenAt: ts, isBot: true });
  }
  rooms.set(r.id, r);
  return r;
}
function emitRoom(r) {
  if (!ioRef || !r) return;
  for (const p of r.players) if (p.uid && !p.isBot) ioRef.to(`chess:user:${p.uid}`).emit('chess:room', publicRoom(r, p.uid));
}
function emitLobby() {
  if (!ioRef) return;
  ioRef.to('chess:lobby').emit('chess:lobby', { ok: true, at: now() });
}
async function refundWaitingBet(r, uid, reason = 'chess-room-refund') {
  if (!r?.bet || !uid) return null;
  return creditBalance({ uid, amount: r.bet, reason, idempotencyKey: `${reason}:${r.id}:${uid}`, metadata: { roomId: r.id, mode: r.mode } }).catch((error) => ({ ok: false, error: error.message }));
}
async function cancelAndDeleteRoom(r, reason = 'room-cancelled') {
  if (!r) return false;
  for (const p of liveHumanPlayers(r)) await refundWaitingBet(r, p.uid, reason).catch(() => null);
  r.status = 'finished';
  r.result = reason;
  r.winnerColor = 'draw';
  r.finishedAt = now();
  r.lifecycle = r.lifecycle || makeLifecycle(r.createdAt || now());
  r.lifecycle.notice = reason;
  emitRoom(r);
  rooms.delete(r.id);
  emitLobby();
  return true;
}
async function enforceRoomLifecycle(r, context = '') {
  if (!r || r.status !== 'playing') return false;
  const t = now();
  r.lifecycle = r.lifecycle || makeLifecycle(r.createdAt || t);
  const humans = liveHumanPlayers(r);
  if (humans.length >= 1 && !r.moves.length && t - (r.lastGameActionAt || r.createdAt || t) >= ROOM_IDLE_EMPTY_MS) {
    await cancelAndDeleteRoom(r, 'inactivity-no-move');
    return true;
  }
  if (humans.length >= 2 && r.moves.length && t - (r.lastMoveAt || r.lastGameActionAt || r.createdAt || t) >= ROOM_IDLE_EMPTY_MS) {
    const inactive = r.players.find((p) => p.color === r.turn && isHumanPlayer(p));
    const winner = humans.find((p) => p.uid !== inactive?.uid) || null;
    await finishRoom(r, { result: 'inactivity-timeout', winnerUid: winner?.uid || '', winnerColor: winner?.color || 'draw', reason: 'inactivity-timeout' });
    return true;
  }
  const life = r.lifecycle;
  if (life.extensionState === 'none' && t >= life.primaryDeadlineAt && humans.length >= 2 && r.moves.length) {
    life.extensionState = 'pending';
    life.promptAt = t;
    life.promptExpiresAt = t + ROOM_EXTENSION_RESPONSE_MS;
    life.responses = {};
    life.notice = 'extension-pending';
    r.stateVersion += 1;
    emitRoom(r);
    return false;
  }
  if (life.extensionState === 'pending') {
    const values = humans.map((p) => life.responses?.[p.uid] || '');
    if (values.includes('reject')) {
      await finishRoom(r, { result: 'extension-rejected', winnerColor: 'draw', reason: 'extension-rejected' });
      return true;
    }
    if (humans.length >= 2 && values.every((v) => v === 'accept')) {
      life.extensionState = 'accepted';
      life.decidedAt = t;
      life.extensionDeadlineAt = t + ROOM_EXTENSION_MS;
      life.finalDeadlineAt = life.extensionDeadlineAt;
      life.notice = 'extension-accepted';
      r.stateVersion += 1;
      emitRoom(r);
      return false;
    }
    if (t >= life.promptExpiresAt) {
      await finishRoom(r, { result: 'extension-no-response', winnerColor: 'draw', reason: 'extension-no-response' });
      return true;
    }
  }
  if (life.extensionState === 'accepted' && life.finalDeadlineAt && t >= life.finalDeadlineAt) {
    await finishRoom(r, { result: 'room-time-limit', winnerColor: 'draw', reason: 'room-time-limit' });
    return true;
  }
  return false;
}
async function processExtensionResponse({ uid, roomId, accept }) {
  const r = rooms.get(String(roomId || ''));
  if (!r) throw createHttpError(404, 'ROOM_NOT_FOUND');
  const player = r.players.find((p) => p.uid === uid);
  if (!player) throw createHttpError(403, 'NOT_IN_ROOM');
  r.lifecycle = r.lifecycle || makeLifecycle(r.createdAt || now());
  if (r.lifecycle.extensionState !== 'pending') return { ok: true, room: publicRoom(r, uid), ignored: true };
  r.lifecycle.responses = r.lifecycle.responses || {};
  r.lifecycle.responses[uid] = accept ? 'accept' : 'reject';
  r.stateVersion += 1;
  touchRoom(r);
  await enforceRoomLifecycle(r, 'extension-response');
  return { ok: true, room: rooms.has(r.id) ? publicRoom(r, uid) : null };
}
async function processChessMove({ user, body }) {
  const viewerUid = String(user?.uid || '');
  const r = rooms.get(String(body.roomId || ''));
  if (!r) throw createHttpError(404, 'ROOM_NOT_FOUND');
  if (await enforceRoomLifecycle(r, 'before-move')) throw createHttpError(409, 'ROOM_FINISHED');
  if (syncClock(r) && r.status === 'finished') { await settleRoom(r, 'timeout-before-move'); throw createHttpError(409, 'ROOM_FINISHED'); }
  if (r.status !== 'playing') throw createHttpError(409, 'ROOM_NOT_PLAYING');
  const player = r.players.find((p) => p.uid === viewerUid);
  if (!player) throw createHttpError(403, 'NOT_IN_ROOM');
  if (player.color !== r.turn) throw createHttpError(409, 'NOT_YOUR_TURN');
  const clientMoveId = safeStr(body.clientMoveId || '', 140);
  if (clientMoveId && r.moveIds[clientMoveId]) return { ok: true, duplicate: true, room: publicRoom(r, viewerUid) };
  const expected = Number(body.expectedStateVersion || 0) || 0;
  if (expected && expected !== r.stateVersion) throw Object.assign(createHttpError(409, 'STATE_VERSION_MISMATCH'), { room: publicRoom(r, viewerUid) });
  const from = String(body.from || '');
  const to = String(body.to || '');
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || from === to) throw createHttpError(400, 'INVALID_MOVE_FORMAT');
  const state = parseFen(r.fen);
  const legal = findLegalMove(state, from, to, body.promotion || 'q');
  if (!legal) throw Object.assign(createHttpError(400, 'ILLEGAL_MOVE'), { room: publicRoom(r, viewerUid) });
  const next = applyMove(state, legal);
  r.fen = boardToFen(next);
  r.turn = next.turn;
  r.moves.push({ from, to, promotion: legal.promotion || '', by: viewerUid, color: player.color, fen: r.fen, at: now(), flags: legal.castle ? 'castle' : legal.enPassant ? 'ep' : legal.captured ? 'capture' : '' });
  if (clientMoveId) r.moveIds[clientMoveId] = true;
  r.drawOfferBy = '';
  r.check = '';
  r.stateVersion += 1;
  r.clock = { lastTurnAt: now() };
  markMeaningfulAction(r);
  maybeFinishByBoard(r, player.color);
  if (r.status === 'finished') await settleRoom(r, 'board-result');
  touchRoom(r);
  emitRoom(r);
  emitLobby();
  if (r.status === 'playing') scheduleBotMoveIfNeeded(r);
  return { ok: true, room: publicRoom(r, viewerUid) };
}

async function joinRoomFor(req, r) {
  const playerUid = uidOf(req);
  if (!r) throw createHttpError(404, 'ROOM_NOT_FOUND');
  if (r.status === 'finished') throw createHttpError(409, 'ROOM_FINISHED');
  if (r.mode === 'bot' && !r.players.some((p) => p.uid === playerUid)) throw createHttpError(409, 'BOT_ROOM_NOT_JOINABLE');
  if (r.players.some((p) => p.uid === playerUid)) { const p = r.players.find((x) => x.uid === playerUid); p.connected = true; p.lastSeenAt = now(); p.disconnectedAt = 0; return { room: r, charged: { ok: true, balance: await readBalance(playerUid).catch(() => 0) } }; }
  if (r.players.length >= 2 || r.status !== 'waiting') throw createHttpError(409, 'ROOM_FULL');
  const active = activeRoomFor(playerUid);
  if (active && active.id !== r.id) throw createHttpError(409, 'ALREADY_IN_ACTIVE_CHESS_ROOM');
  const reqAsPlayer = await buildPlayer(req, 'b');
  const charged = await chargePlayer(req, r);
  if (!charged.ok) throw createHttpError(409, charged.error || 'BET_CHARGE_FAILED');
  r.players.push(reqAsPlayer);
  r.pot += r.bet;
  r.status = 'playing';
  r.clock = { lastTurnAt: now() };
  r.stateVersion += 1;
  touchRoom(r);
  emitRoom(r);
  emitLobby();
  return { room: r, charged };
}
function scheduleBotMoveIfNeeded(r) {
  if (!r || r.mode !== 'bot' || r.status !== 'playing' || r.turn !== 'b') return;
  if (botTimers.has(r.id)) return;
  r.botThinkingUntil = Date.now() + BOT_MOVE_DELAY_MS;
  r.stateVersion += 1;
  emitRoom(r);
  const timer = setTimeout(async () => {
    botTimers.delete(r.id);
    try { await makeBotMoveIfNeeded(r); } catch (error) { reportChessIssue('bot.move.error', { roomId: r.id, error: error.message, severity: 'error' }); }
  }, BOT_MOVE_DELAY_MS);
  timer.unref?.();
  botTimers.set(r.id, timer);
}
async function makeBotMoveIfNeeded(r) {
  if (!r || r.mode !== 'bot' || r.status !== 'playing' || r.turn !== 'b') return;
  r.botThinkingUntil = 0;
  const state = parseFen(r.fen);
  const moves = legalMoves(state, 'b');
  if (!moves.length) return;
  const capture = moves.find((m) => m.captured);
  const checkMoves = moves.filter((m) => isInCheck(applyMove(state, m), 'w'));
  const chosen = checkMoves[0] || capture || moves[Math.floor(Math.random() * moves.length)];
  const next = applyMove(state, chosen);
  r.fen = boardToFen(next);
  r.turn = next.turn;
  r.moves.push({ from: chosen.from, to: chosen.to, promotion: chosen.promotion || '', by: 'bot', color: 'b', fen: r.fen, at: now(), flags: chosen.castle ? 'castle' : chosen.enPassant ? 'ep' : chosen.captured ? 'capture' : '' });
  r.stateVersion += 1;
  markMeaningfulAction(r);
  maybeFinishByBoard(r, 'b');
  if (r.status === 'finished') await settleRoom(r, 'bot-board');
  touchRoom(r);
  emitRoom(r);
}

router.get('/lobby', requireAuth, asyncRoute(async (req, res) => {
  const viewerUid = uidOf(req);
  for (const r of rooms.values()) syncClock(r);
  const visible = [...rooms.values()].filter((r) => r.status !== 'finished' && r.mode !== 'private' && r.mode !== 'bot').map((r) => publicRoom(r, viewerUid));
  res.json({ ok: true, rooms: visible });
}));
router.get('/profile', requireAuth, asyncRoute(async (req, res) => {
  const uid = uidOf(req);
  const profile = await readProfile(uid);
  const balance = await readBalance(uid);
  const progression = getProgression(profile.xp ?? profile.accountXp ?? 0);
  const active = activeRoomFor(uid);
  res.json({ ok: true, user: { ...profile, balance, xp: progression.currentXp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression }, activeRoom: active ? publicRoom(active, uid) : null });
}));
router.post('/create', requireAuth, asyncRoute(async (req, res) => {
  const r = await createRoomFor(req, { bet: req.body?.bet || 0, mode: req.body?.mode || '' });
  let charged = { ok: true, balance: await readBalance(uidOf(req)).catch(() => 0) };
  if (r.players[0]?.uid === uidOf(req) && r.bet && !r.hostCharged) {
    charged = await chargePlayer(req, r);
    if (!charged.ok) { rooms.delete(r.id); return res.status(409).json(charged); }
    r.hostCharged = true;
  }
  touchRoom(r);
  emitLobby();
  const existingMeta = r._lastExistingRequest && r.players.some((p) => p.uid === uidOf(req)) ? r._lastExistingRequest : null;
  if (r._lastExistingRequest) delete r._lastExistingRequest;
  res.json({ ok: true, room: publicRoom(r, uidOf(req)), balance: charged.balance, ...(existingMeta || {}) });
}));
router.post('/join', requireAuth, asyncRoute(async (req, res) => {
  const viewerUid = uidOf(req);
  let r = null;
  if (req.body?.roomId) r = rooms.get(String(req.body.roomId));
  else {
    const betAmount = validateBetAmount(req.body?.bet || 0, req.body?.mode || 'free');
    const mode = normalizeMode(req.body?.mode || '', betAmount);
    r = findOpen({ uid: viewerUid, mode, bet: betAmount });
    if (!r) {
      r = await createRoomFor(req, { bet: betAmount, mode });
      let charged = { ok: true, balance: await readBalance(viewerUid).catch(() => 0) };
      if (r.bet && !r.hostCharged) { charged = await chargePlayer(req, r); if (!charged.ok) { rooms.delete(r.id); return res.status(409).json(charged); } r.hostCharged = true; }
      emitLobby();
      return res.json({ ok: true, room: publicRoom(r, viewerUid), balance: charged.balance, queued: true });
    }
  }
  const { room, charged } = await joinRoomFor(req, r);
  res.json({ ok: true, room: publicRoom(room, viewerUid), balance: charged.balance });
}));
router.get('/state/:roomId', requireAuth, asyncRoute(async (req, res) => {
  const r = rooms.get(String(req.params.roomId));
  if (!r) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  const viewerUid = uidOf(req);
  if (!r.players.some((p) => p.uid === viewerUid)) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  if (await enforceRoomLifecycle(r, 'state')) return res.status(404).json({ ok: false, error: 'ROOM_CLOSED' });
  if (syncClock(r) && r.status === 'finished') await settleRoom(r, 'timeout-state');
  res.json({ ok: true, room: publicRoom(r, viewerUid) });
}));
router.post('/ping', requireAuth, asyncRoute(async (req, res) => {
  const r = rooms.get(String(req.body.roomId));
  if (!r) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  const player = r.players.find((p) => p.uid === uidOf(req));
  if (!player) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  player.connected = true; player.lastSeenAt = now(); player.disconnectedAt = 0;
  if (await enforceRoomLifecycle(r, 'ping')) return res.json({ ok: true, room: null });
  if (syncClock(r) && r.status === 'finished') await settleRoom(r, 'timeout-ping');
  touchRoom(r);
  res.json({ ok: true, room: publicRoom(r, uidOf(req)) });
}));
router.post('/move', requireAuth, asyncRoute(async (req, res) => {
  try {
    const result = await processChessMove({ user: req.user, body: req.body || {} });
    res.json(result);
  } catch (error) {
    if (error.room && error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message, room: error.room });
    throw error;
  }
}));
router.post('/extend', requireAuth, asyncRoute(async (req, res) => {
  const result = await processExtensionResponse({ uid: uidOf(req), roomId: req.body?.roomId, accept: !!req.body?.accept });
  res.json(result);
}));
router.post('/resign', requireAuth, asyncRoute(async (req, res) => {
  const r = rooms.get(String(req.body.roomId));
  if (!r) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  const player = r.players.find((p) => p.uid === uidOf(req));
  if (!player) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  if (r.status === 'finished') return res.json({ ok: true, room: publicRoom(r, uidOf(req)) });
  const winner = r.players.find((p) => p.uid !== player.uid);
  if (!winner?.uid) return res.status(409).json({ ok: false, error: 'OPPONENT_NOT_AVAILABLE', room: publicRoom(r, uidOf(req)) });
  const settlement = await finishRoom(r, { result: 'resign', winnerUid: winner.uid, winnerColor: winner.color || '', reason: 'resign' });
  if (settlement?.settlementFailed) return res.status(409).json({ ok: false, error: 'SETTLEMENT_FAILED', room: publicRoom(r, uidOf(req)) });
  res.json({ ok: true, room: publicRoom(r, uidOf(req)), balance: r.settlement?.[winner?.uid]?.balance });
}));
router.post('/draw', requireAuth, asyncRoute(async (req, res) => {
  const r = rooms.get(String(req.body.roomId));
  if (!r) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  const player = r.players.find((p) => p.uid === uidOf(req));
  if (!player) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  if (r.status !== 'playing') return res.status(409).json({ ok: false, error: 'ROOM_NOT_PLAYING' });
  if (r.mode === 'bot') return res.status(409).json({ ok: false, error: 'DRAW_DISABLED_FOR_BOT' });
  const drawMoveCount = Array.isArray(r.moves) ? r.moves.length : 0;
  if (drawMoveCount < MIN_DRAW_OFFER_MOVES) return res.status(409).json({ ok: false, error: 'DRAW_REQUIRES_20_MOVES', minMoves: MIN_DRAW_OFFER_MOVES, moveCount: drawMoveCount, room: publicRoom(r, uidOf(req)) });
  if (r.drawOfferBy && r.drawOfferBy !== player.uid) {
    const settlement = await finishRoom(r, { result: 'draw', winnerColor: 'draw', reason: 'draw-accepted' });
    if (settlement?.settlementFailed) return res.status(409).json({ ok: false, error: 'SETTLEMENT_FAILED', room: publicRoom(r, uidOf(req)) });
    return res.json({ ok: true, room: publicRoom(r, uidOf(req)) });
  }
  r.drawOfferBy = player.uid;
  r.stateVersion += 1;
  touchRoom(r);
  emitRoom(r);
  res.json({ ok: true, offered: true, room: publicRoom(r, uidOf(req)) });
}));
router.post('/leave', requireAuth, asyncRoute(async (req, res) => {
  const r = rooms.get(String(req.body.roomId));
  if (!r) return res.json({ ok: true });
  const player = r.players.find((p) => p.uid === uidOf(req));
  if (!player) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  const reason = String(req.body.reason || '').toLowerCase();
  if (r.status === 'waiting') {
    if (r.bet && player.uid === r.players[0]?.uid) await creditBalance({ uid: player.uid, amount: r.bet, reason: 'chess-waiting-room-refund', idempotencyKey: `chess:waiting-refund:${r.id}:${player.uid}` }).catch(() => null);
    rooms.delete(r.id); emitLobby(); return res.json({ ok: true, room: null });
  }
  if (r.status === 'playing' && reason === 'unload') {
    player.connected = false; player.disconnectedAt = now(); touchRoom(r); emitRoom(r); return res.json({ ok: true, room: publicRoom(r, player.uid), reconnectGraceMs: RECONNECT_GRACE_MS });
  }
  if (r.status === 'playing') {
    r.lifecycle = r.lifecycle || makeLifecycle(r.createdAt || now());
    r.lifecycle.notice = reason === 'player-exit' ? 'player-exit' : 'leave';
    const winner = r.players.find((p) => p.uid !== player.uid);
    const settlement = await finishRoom(r, { result: reason === 'player-exit' ? 'player-exit' : 'leave', winnerUid: winner?.uid || '', winnerColor: winner?.color || '', reason: reason === 'player-exit' ? 'player-exit' : 'leave' });
    if (settlement?.settlementFailed) return res.status(409).json({ ok: false, error: 'SETTLEMENT_FAILED', room: publicRoom(r, player.uid) });
  }
  res.json({ ok: true, room: publicRoom(r, player.uid) });
}));
async function authenticateChessSocket(socket) {
  try {
    if (socket.data?.chessUid) return true;
    const session = await authenticateSocketRequest(socket);
    if (!session?.uid) {
      socket.emit('chess:auth_error', { ok:false, error: session?.code || 'AUTH_REQUIRED' });
      return false;
    }
    socket.data.chessUid = String(session.uid);
    socket.data.chessEmail = String(session.email || '');
    socket.data.pmSessionId = String(session.sid || '');
    return true;
  } catch (_) {
    socket.data.chessUid = '';
    socket.emit('chess:auth_error', { ok:false, error:'AUTH_INVALID' });
    return false;
  }
}
function installSocket(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    socket.on('chess:lobby:subscribe', async () => { if (await authenticateChessSocket(socket)) socket.join('chess:lobby'); });
    socket.on('chess:join', async (roomId, ack) => {
      try {
        if (!(await authenticateChessSocket(socket))) { ack?.({ ok:false, error:'AUTH_REQUIRED' }); return; }
        const r = rooms.get(String(roomId || ''));
        if (!r || !r.players.some((p) => p.uid === socket.data.chessUid)) { ack?.({ ok:false, error:'NOT_IN_ROOM' }); return; }
        socket.join(`chess:${r.id}`);
        socket.join(`chess:user:${socket.data.chessUid}`);
        ack?.({ ok:true, room: publicRoom(r, socket.data.chessUid) });
      } catch (error) { ack?.({ ok:false, error:error.message || 'SOCKET_JOIN_FAILED' }); }
    });
    socket.on('chess:subscribe-user', async (_uid, ack) => { if (await authenticateChessSocket(socket)) { socket.join(`chess:user:${socket.data.chessUid}`); ack?.({ ok:true }); } else ack?.({ ok:false, error:'AUTH_REQUIRED' }); });
    socket.on('chess:move', async (payload, ack) => {
      try {
        if (!(await authenticateChessSocket(socket))) { ack?.({ ok:false, error:'AUTH_REQUIRED' }); return; }
        const result = await processChessMove({ user: { uid: socket.data.chessUid, email: socket.data.chessEmail }, body: payload || {} });
        ack?.(result);
      } catch (error) {
        ack?.({ ok:false, error:error.message || 'MOVE_FAILED', room:error.room || null });
      }
    });
    socket.on('chess:extend', async (payload, ack) => {
      try {
        if (!(await authenticateChessSocket(socket))) { ack?.({ ok:false, error:'AUTH_REQUIRED' }); return; }
        const result = await processExtensionResponse({ uid: socket.data.chessUid, roomId: payload?.roomId, accept: !!payload?.accept });
        ack?.(result);
      } catch (error) { ack?.({ ok:false, error:error.message || 'EXTEND_FAILED' }); }
    });
  });
}
setInterval(async () => {
  for (const [k, r] of rooms) {
    if (r.status === 'playing') {
      const lifecycleClosed = await enforceRoomLifecycle(r, 'sweep');
      if (lifecycleClosed) continue;
      const timedOut = syncClock(r);
      const disconnected = r.players.find((p) => !p.isBot && p.connected === false && p.disconnectedAt && now() - p.disconnectedAt > RECONNECT_GRACE_MS);
      if (timedOut) await settleRoom(r, 'timer-sweep');
      else if (disconnected) {
        const winner = r.players.find((p) => p.uid !== disconnected.uid);
        await finishRoom(r, { result: 'disconnect', winnerUid: winner?.uid || '', winnerColor: winner?.color || '', reason: 'disconnect' });
      }
    }
    if (r.status === 'waiting' && now() - (r.updatedAt || r.createdAt || now()) > ROOM_PRIMARY_MS) {
      if (r.bet && r.players[0]?.uid) await refundWaitingBet(r, r.players[0].uid, 'chess-waiting-expire-refund').catch(() => null);
      rooms.delete(k);
      emitLobby();
    }
    if (r.status === 'finished' && now() - (r.finishedAt || r.updatedAt || now()) > Number(process.env.CHESS_RESULT_RETENTION_MS || 120000)) {
      rooms.delete(k);
      emitLobby();
    }
  }
  const qcut = now() - QUEUE_TTL_MS;
  for (const [uid, item] of queue) if (item.at < qcut) queue.delete(uid);
}, 15000).unref();

module.exports = { router, installSocket, _rooms: rooms, _engine: { parseFen, boardToFen, legalMoves, applyMove, isInCheck } };
