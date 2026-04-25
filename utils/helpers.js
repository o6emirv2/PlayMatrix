'use strict';

const crypto = require('crypto');
const { USERNAME_BAD_WORD_PATTERNS } = require('../config/constants');

let xss = null;
let sanitizerEngine = 'internal';
try {
  xss = require('xss');
  sanitizerEngine = 'xss';
} catch (error) {
  xss = null;
}

const nowMs = () => Date.now();

const safeNum = (v, d = 0) => {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? n : d;
};

const safeSignedNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function safeFloat(num) {
  return parseFloat((Number(num) || 0).toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, safeNum(ms, 0))));

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

const textSanitizer = xss
  ? new xss.FilterXSS({
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
      css: false
    })
  : null;

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) ? String.fromCharCode(num) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const num = parseInt(hex, 16);
      return Number.isFinite(num) ? String.fromCharCode(num) : ' ';
    });
}

function stripDangerousHtml(value = '') {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|meta|link)\b[^>]*\/?>/gi, ' ')
    .replace(/on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
    .replace(/javascript\s*:/gi, ' ')
    .replace(/data\s*:\s*text\/html/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function sanitizePlainText(value, options = {}) {
  const maxLen = Number.isFinite(options.maxLen) && options.maxLen > 0 ? Math.floor(options.maxLen) : 5000;
  let text = typeof value === 'string' ? value : '';
  if (!text) return '';

  text = text
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n?/g, '\n');

  text = decodeHtmlEntities(text);

  if (textSanitizer) {
    text = textSanitizer.process(text);
  } else {
    text = stripDangerousHtml(text);
  }

  text = decodeHtmlEntities(text)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length > maxLen) text = text.slice(0, maxLen).trim();
  return text;
}

const cleanStr = (v, maxLen = 500) => sanitizePlainText(v, { maxLen });

const isDisposableEmail = (email) => {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  const blocked = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    '10minutemail.com', '10minutemail.net', '10minemail.com',
    'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'temp-mail.com',
    'yopmail.com', 'yopmail.fr', 'yopmail.net',
    'trashmail.com', 'getnada.com', 'dispostable.com', 'minuteinbox.com'
  ]);
  if (blocked.has(domain)) return true;
  if (domain.endsWith('.mailinator.com')) return true;
  if (domain.endsWith('.yopmail.com')) return true;
  return false;
};

function normalizeUsernameForFilter(value) {
  return cleanStr(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function containsBlockedUsername(value) {
  const normalized = normalizeUsernameForFilter(value);
  if (!normalized) return false;
  return USERNAME_BAD_WORD_PATTERNS.some((pattern) => pattern.test(normalized));
}

function checkProfanity(text) {
  if (!text) return false;

  const normalized = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[\s\.\,\-\_\!\?\@\#\$\%\^\&\*\(\)\[\]\{\}\<\>\+\=]/g, '')
    .replace(/1/g, 'i').replace(/!/g, 'i')
    .replace(/@/g, 'a').replace(/3/g, 'e')
    .replace(/0/g, 'o').replace(/5/g, 's')
    .replace(/7/g, 't').replace(/4/g, 'a');

  const badWords = [
    'amk', 'amq', 'aq', 'sik', 'pic', 'piç', 'oc', 'oç', 'orosp', 'yarak', 'yarrak',
    'got', 'gotveren', 'göt', 'ibne', 'kavat', 'surtuk', 'sürtük', 'kahpe', 'amcik', 'amcık', 'yavsak', 'yavşak'
  ];

  for (const word of badWords) {
    if (normalized.includes(word)) return true;
  }
  return false;
}

module.exports = {
  sanitizerEngine,
  nowMs,
  safeNum,
  safeSignedNum,
  safeFloat,
  clamp,
  wait,
  sha256Hex,
  decodeHtmlEntities,
  stripDangerousHtml,
  sanitizePlainText,
  cleanStr,
  isDisposableEmail,
  normalizeUsernameForFilter,
  containsBlockedUsername,
  checkProfanity
};