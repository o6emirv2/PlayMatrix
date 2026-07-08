(() => {
  'use strict';
  if (window.Chess) return;
  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const files = 'abcdefgh';
  const isWhite = (p) => p && p === p.toUpperCase();
  const colorOf = (p) => isWhite(p) ? 'w' : 'b';
  const opposite = (c) => c === 'w' ? 'b' : 'w';
  const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const squareToPos = (sq) => ({ row: 8 - Number(String(sq || '')[1]), col: files.indexOf(String(sq || '')[0]) });
  const posToSquare = (row, col) => `${files[col]}${8 - row}`;
  const cloneBoard = (board) => board.map((row) => row.slice());

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
      let out = '', empty = 0;
      for (const piece of row) {
        if (!piece) empty += 1;
        else { if (empty) out += String(empty); empty = 0; out += piece; }
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
    if (!piece || (target && colorOf(target) === colorOf(piece))) return;
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
    const piece = next.board[fr]?.[fc];
    const target = next.board[tr]?.[tc];
    if (!piece) return state;
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
    return generatePseudoMoves(state, color).filter((m) => !isInCheck(applyMove(state, m), color));
  }
  function findLegalMove(state, from, to, promotion = 'q') {
    const safePromotion = String(promotion || 'q').toLowerCase()[0] || 'q';
    return legalMoves(state, state.turn).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === safePromotion || safePromotion)) || null;
  }
  class PlayMatrixChess {
    constructor(fen = INITIAL_FEN) { this.state = parseFen(fen); }
    load(fen = INITIAL_FEN) { try { this.state = parseFen(fen); return true; } catch (_) { return false; } }
    fen() { return boardToFen(this.state); }
    turn() { return this.state.turn; }
    in_check() { return isInCheck(this.state, this.state.turn); }
    board() { return this.state.board.map((row) => row.map((piece) => piece ? { type: piece.toLowerCase(), color: colorOf(piece) } : null)); }
    get(square) { const { row, col } = squareToPos(square); const piece = inBounds(row, col) ? this.state.board[row][col] : null; return piece ? { type: piece.toLowerCase(), color: colorOf(piece) } : null; }
    moves(options = {}) {
      const all = legalMoves(this.state, this.state.turn).filter((m) => !options.square || m.from === options.square);
      if (options.verbose === false) return all.map((m) => m.to);
      return all.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion || '', captured: m.captured || '', flags: m.castle ? 'k' : m.enPassant ? 'e' : m.captured ? 'c' : '' }));
    }
    move(move = {}) {
      const from = String(move.from || '');
      const to = String(move.to || '');
      const legal = findLegalMove(this.state, from, to, move.promotion || 'q');
      if (!legal) return null;
      this.state = applyMove(this.state, legal);
      return { from: legal.from, to: legal.to, piece: legal.piece, captured: legal.captured || '', promotion: legal.promotion || '' };
    }
  }
  window.Chess = PlayMatrixChess;
  window.PlayMatrixChessEngine = Object.freeze({ Chess: PlayMatrixChess, INITIAL_FEN, parseFen, boardToFen, legalMoves, applyMove, isInCheck });
})();
