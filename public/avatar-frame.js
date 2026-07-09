'use strict';

(() => {
  const FALLBACK_AVATAR = '/public/assets/avatars/system/fallback.svg';
  const FRAME_ASSET_COUNT = 18;
  const FRAME_LEVEL_TO_ASSET = Object.freeze([
    Object.freeze({ min: 1, max: 15, asset: 1 }),
    Object.freeze({ min: 16, max: 30, asset: 2 }),
    Object.freeze({ min: 31, max: 40, asset: 3 }),
    Object.freeze({ min: 41, max: 50, asset: 4 }),
    Object.freeze({ min: 51, max: 60, asset: 5 }),
    Object.freeze({ min: 61, max: 80, asset: 6 }),
    Object.freeze({ min: 81, max: 85, asset: 7 }),
    Object.freeze({ min: 86, max: 90, asset: 8 }),
    Object.freeze({ min: 91, max: 91, asset: 9 }),
    Object.freeze({ min: 92, max: 92, asset: 10 }),
    Object.freeze({ min: 93, max: 93, asset: 11 }),
    Object.freeze({ min: 94, max: 94, asset: 12 }),
    Object.freeze({ min: 95, max: 95, asset: 13 }),
    Object.freeze({ min: 96, max: 96, asset: 14 }),
    Object.freeze({ min: 97, max: 97, asset: 15 }),
    Object.freeze({ min: 98, max: 98, asset: 16 }),
    Object.freeze({ min: 99, max: 99, asset: 17 }),
    Object.freeze({ min: 100, max: 100, asset: 18 })
  ]);

  const FRAME_CALIBRATION_VERSION = 2;
  const DEFAULT_FRAME_PROFILE = Object.freeze({ scale: 1.13, avatar: 0.82, shiftX: '0%', shiftY: '0%', avatarShiftX: '0%', avatarShiftY: '0%', profile: 'normal' });
  const FRAME_CALIBRATIONS = Object.freeze({
    normal: Object.freeze({
      1: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 116, opticalCenterY: 97, innerApertureRatio: 0.6749, outerVisibleRatio: 0.8625, scale: 1.3101, avatar: 0.7086, shiftX: '-0.62%', shiftY: '3.12%', avatarShiftX: '-1.46%', avatarShiftY: '-9.38%', profile: 'thick' }),
      2: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 98, innerApertureRatio: 0.7491, outerVisibleRatio: 0.8875, scale: 1.2732, avatar: 0.7866, shiftX: '-0.21%', shiftY: '-1.67%', avatarShiftX: '0.21%', avatarShiftY: '-8.96%', profile: 'thick' }),
      3: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 123, opticalCenterY: 127, innerApertureRatio: 0.5201, outerVisibleRatio: 0.9792, scale: 1.154, avatar: 0.64, shiftX: '2.08%', shiftY: '-1.04%', avatarShiftX: '1.46%', avatarShiftY: '3.12%', profile: 'ultra' }),
      4: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 120, innerApertureRatio: 0.4363, outerVisibleRatio: 0.975, scale: 1.159, avatar: 0.64, shiftX: '1.04%', shiftY: '1.25%', avatarShiftX: '0.21%', avatarShiftY: '0.21%', profile: 'ultra' }),
      5: Object.freeze({ assetWidth: 160, assetHeight: 160, opticalCenterX: 79, opticalCenterY: 71, innerApertureRatio: 0.7711, outerVisibleRatio: 0.9875, scale: 1.1443, avatar: 0.8096, shiftX: '0.00%', shiftY: '0.62%', avatarShiftX: '-0.31%', avatarShiftY: '-5.31%', profile: 'normal' }),
      6: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 117, opticalCenterY: 117, innerApertureRatio: 0.6177, outerVisibleRatio: 0.9542, scale: 1.1843, avatar: 0.6485, shiftX: '1.04%', shiftY: '-0.62%', avatarShiftX: '-1.04%', avatarShiftY: '-1.04%', profile: 'ultra' }),
      7: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 93, innerApertureRatio: 0.7001, outerVisibleRatio: 0.9583, scale: 1.1791, avatar: 0.7351, shiftX: '-0.62%', shiftY: '1.67%', avatarShiftX: '0.21%', avatarShiftY: '-11.04%', profile: 'thick' }),
      8: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 118, opticalCenterY: 106, innerApertureRatio: 0.4621, outerVisibleRatio: 0.95, scale: 1.1895, avatar: 0.64, shiftX: '0.42%', shiftY: '0.42%', avatarShiftX: '-0.62%', avatarShiftY: '-5.62%', profile: 'ultra' }),
      9: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 130, opticalCenterY: 123, innerApertureRatio: 0.4568, outerVisibleRatio: 0.9917, scale: 1.1395, avatar: 0.64, shiftX: '-0.42%', shiftY: '-0.62%', avatarShiftX: '4.38%', avatarShiftY: '1.46%', profile: 'ultra' }),
      10: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 121, opticalCenterY: 118, innerApertureRatio: 0.679, outerVisibleRatio: 0.9708, scale: 1.1639, avatar: 0.7129, shiftX: '0.42%', shiftY: '-1.46%', avatarShiftX: '0.62%', avatarShiftY: '-0.62%', profile: 'thick' }),
      11: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 116, opticalCenterY: 114, innerApertureRatio: 0.5968, outerVisibleRatio: 0.8333, scale: 1.356, avatar: 0.64, shiftX: '0.42%', shiftY: '0.21%', avatarShiftX: '-1.46%', avatarShiftY: '-2.29%', profile: 'ultra' }),
      12: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 118, opticalCenterY: 125, innerApertureRatio: 0.6462, outerVisibleRatio: 0.8917, scale: 1.2673, avatar: 0.6785, shiftX: '-0.21%', shiftY: '0.42%', avatarShiftX: '-0.62%', avatarShiftY: '2.29%', profile: 'thick' }),
      13: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 122, innerApertureRatio: 0.751, outerVisibleRatio: 0.9042, scale: 1.2498, avatar: 0.7886, shiftX: '0.21%', shiftY: '-1.04%', avatarShiftX: '0.21%', avatarShiftY: '1.04%', profile: 'thick' }),
      14: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 116, opticalCenterY: 129, innerApertureRatio: 0.4583, outerVisibleRatio: 0.8958, scale: 1.2614, avatar: 0.64, shiftX: '-5.62%', shiftY: '-5.21%', avatarShiftX: '-1.46%', avatarShiftY: '3.96%', profile: 'ultra' }),
      15: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 119, opticalCenterY: 117, innerApertureRatio: 0.6015, outerVisibleRatio: 0.9333, scale: 1.2107, avatar: 0.64, shiftX: '-0.42%', shiftY: '-0.83%', avatarShiftX: '-0.21%', avatarShiftY: '-1.04%', profile: 'ultra' }),
      16: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 141, innerApertureRatio: 0.484, outerVisibleRatio: 0.925, scale: 1.2216, avatar: 0.64, shiftX: '0.00%', shiftY: '-2.50%', avatarShiftX: '0.21%', avatarShiftY: '8.96%', profile: 'ultra' }),
      17: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 121, opticalCenterY: 111, innerApertureRatio: 0.4729, outerVisibleRatio: 0.9333, scale: 1.2107, avatar: 0.64, shiftX: '0.00%', shiftY: '-0.21%', avatarShiftX: '0.62%', avatarShiftY: '-3.54%', profile: 'ultra' }),
      18: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 110, opticalCenterY: 113, innerApertureRatio: 0.3911, outerVisibleRatio: 0.7708, scale: 1.4659, avatar: 0.64, shiftX: '-0.21%', shiftY: '-0.83%', avatarShiftX: '-3.96%', avatarShiftY: '-2.71%', profile: 'ultra' }),
    }),
    market: Object.freeze({
      1: Object.freeze({ assetWidth: 224, assetHeight: 224, opticalCenterX: 112, opticalCenterY: 117, innerApertureRatio: 0.7509, outerVisibleRatio: 0.9955, scale: 1.1351, avatar: 0.7885, shiftX: '-1.12%', shiftY: '0.22%', avatarShiftX: '0.22%', avatarShiftY: '2.46%', profile: 'thick' }),
      2: Object.freeze({ assetWidth: 230, assetHeight: 240, opticalCenterX: 111, opticalCenterY: 121, innerApertureRatio: 0.8739, outerVisibleRatio: 0.9625, scale: 1.174, avatar: 0.9176, shiftX: '0.00%', shiftY: '1.88%', avatarShiftX: '-1.46%', avatarShiftY: '0.62%', profile: 'normal' }),
      3: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 115, opticalCenterY: 101, innerApertureRatio: 0.5155, outerVisibleRatio: 0.9792, scale: 1.154, avatar: 0.64, shiftX: '0.62%', shiftY: '0.21%', avatarShiftX: '-1.88%', avatarShiftY: '-7.71%', profile: 'ultra' }),
      4: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 127, opticalCenterY: 108, innerApertureRatio: 0.589, outerVisibleRatio: 0.9583, scale: 1.1791, avatar: 0.64, shiftX: '-1.88%', shiftY: '-0.42%', avatarShiftX: '3.12%', avatarShiftY: '-4.79%', profile: 'ultra' }),
      5: Object.freeze({ assetWidth: 240, assetHeight: 238, opticalCenterX: 115, opticalCenterY: 113, innerApertureRatio: 0.7804, outerVisibleRatio: 0.8208, scale: 1.3766, avatar: 0.8195, shiftX: '0.21%', shiftY: '-0.83%', avatarShiftX: '-1.88%', avatarShiftY: '-2.29%', profile: 'normal' }),
      6: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 108, opticalCenterY: 112, innerApertureRatio: 0.7423, outerVisibleRatio: 0.9542, scale: 1.1843, avatar: 0.7794, shiftX: '1.25%', shiftY: '0.21%', avatarShiftX: '-4.79%', avatarShiftY: '-3.12%', profile: 'thick' }),
      7: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 119, opticalCenterY: 112, innerApertureRatio: 0.5925, outerVisibleRatio: 0.9667, scale: 1.169, avatar: 0.64, shiftX: '-1.25%', shiftY: '0.83%', avatarShiftX: '-0.21%', avatarShiftY: '-3.12%', profile: 'ultra' }),
      8: Object.freeze({ assetWidth: 224, assetHeight: 224, opticalCenterX: 111, opticalCenterY: 111, innerApertureRatio: 0.7894, outerVisibleRatio: 0.933, scale: 1.2111, avatar: 0.8288, shiftX: '3.35%', shiftY: '0.00%', avatarShiftX: '-0.22%', avatarShiftY: '-0.22%', profile: 'normal' }),
      9: Object.freeze({ assetWidth: 224, assetHeight: 224, opticalCenterX: 118, opticalCenterY: 106, innerApertureRatio: 0.5593, outerVisibleRatio: 0.9375, scale: 1.2053, avatar: 0.64, shiftX: '1.12%', shiftY: '-0.45%', avatarShiftX: '2.90%', avatarShiftY: '-2.46%', profile: 'ultra' }),
      10: Object.freeze({ assetWidth: 224, assetHeight: 224, opticalCenterX: 110, opticalCenterY: 109, innerApertureRatio: 0.7278, outerVisibleRatio: 0.9509, scale: 1.1884, avatar: 0.7642, shiftX: '0.67%', shiftY: '0.45%', avatarShiftX: '-0.67%', avatarShiftY: '-1.12%', profile: 'thick' }),
      11: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 105, opticalCenterY: 113, innerApertureRatio: 0.5848, outerVisibleRatio: 0.9917, scale: 1.1395, avatar: 0.64, shiftX: '-0.21%', shiftY: '0.42%', avatarShiftX: '-6.04%', avatarShiftY: '-2.71%', profile: 'ultra' }),
      12: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 137, opticalCenterY: 107, innerApertureRatio: 0.7011, outerVisibleRatio: 0.9417, scale: 1.2, avatar: 0.7362, shiftX: '-0.21%', shiftY: '0.42%', avatarShiftX: '7.29%', avatarShiftY: '-5.21%', profile: 'thick' }),
      13: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 109, opticalCenterY: 132, innerApertureRatio: 0.6242, outerVisibleRatio: 0.975, scale: 1.159, avatar: 0.6554, shiftX: '0.83%', shiftY: '-1.25%', avatarShiftX: '-4.38%', avatarShiftY: '5.21%', profile: 'thick' }),
      14: Object.freeze({ assetWidth: 160, assetHeight: 160, opticalCenterX: 72, opticalCenterY: 82, innerApertureRatio: 0.6544, outerVisibleRatio: 0.95, scale: 1.1895, avatar: 0.6871, shiftX: '3.12%', shiftY: '-0.62%', avatarShiftX: '-4.69%', avatarShiftY: '1.56%', profile: 'thick' }),
      15: Object.freeze({ assetWidth: 239, assetHeight: 239, opticalCenterX: 125, opticalCenterY: 124, innerApertureRatio: 0.6609, outerVisibleRatio: 0.8494, scale: 1.3304, avatar: 0.6939, shiftX: '0.00%', shiftY: '0.00%', avatarShiftX: '2.51%', avatarShiftY: '2.09%', profile: 'thick' }),
      16: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 117, opticalCenterY: 122, innerApertureRatio: 0.6257, outerVisibleRatio: 0.8583, scale: 1.3165, avatar: 0.657, shiftX: '-0.42%', shiftY: '-0.83%', avatarShiftX: '-1.04%', avatarShiftY: '1.04%', profile: 'thick' }),
      17: Object.freeze({ assetWidth: 180, assetHeight: 240, opticalCenterX: 75, opticalCenterY: 109, innerApertureRatio: 0.5309, outerVisibleRatio: 0.7792, scale: 1.4503, avatar: 0.64, shiftX: '0.00%', shiftY: '0.62%', avatarShiftX: '-6.04%', avatarShiftY: '-4.38%', profile: 'ultra' }),
      18: Object.freeze({ assetWidth: 224, assetHeight: 239, opticalCenterX: 114, opticalCenterY: 119, innerApertureRatio: 0.6084, outerVisibleRatio: 0.887, scale: 1.2739, avatar: 0.64, shiftX: '-0.21%', shiftY: '-2.72%', avatarShiftX: '1.05%', avatarShiftY: '0.00%', profile: 'ultra' }),
      19: Object.freeze({ assetWidth: 240, assetHeight: 187, opticalCenterX: 119, opticalCenterY: 89, innerApertureRatio: 0.4645, outerVisibleRatio: 0.7083, scale: 1.52, avatar: 0.64, shiftX: '-0.42%', shiftY: '0.83%', avatarShiftX: '-0.21%', avatarShiftY: '-1.67%', profile: 'ultra' }),
      20: Object.freeze({ assetWidth: 227, assetHeight: 240, opticalCenterX: 113, opticalCenterY: 119, innerApertureRatio: 0.5566, outerVisibleRatio: 0.9292, scale: 1.2161, avatar: 0.64, shiftX: '-0.42%', shiftY: '-1.88%', avatarShiftX: '0.00%', avatarShiftY: '-0.21%', profile: 'ultra' }),
      21: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 121, opticalCenterY: 111, innerApertureRatio: 0.4729, outerVisibleRatio: 0.9333, scale: 1.2107, avatar: 0.64, shiftX: '0.00%', shiftY: '-0.21%', avatarShiftX: '0.62%', avatarShiftY: '-3.54%', profile: 'ultra' }),
      22: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 122, opticalCenterY: 108, innerApertureRatio: 0.4559, outerVisibleRatio: 0.9917, scale: 1.1395, avatar: 0.64, shiftX: '0.00%', shiftY: '-0.62%', avatarShiftX: '1.04%', avatarShiftY: '-4.79%', profile: 'ultra' }),
      23: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 114, innerApertureRatio: 0.4896, outerVisibleRatio: 0.925, scale: 1.2216, avatar: 0.64, shiftX: '0.42%', shiftY: '1.46%', avatarShiftX: '0.21%', avatarShiftY: '-2.29%', profile: 'ultra' }),
      24: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 116, opticalCenterY: 122, innerApertureRatio: 0.5224, outerVisibleRatio: 0.9375, scale: 1.2053, avatar: 0.64, shiftX: '0.21%', shiftY: '0.00%', avatarShiftX: '-1.46%', avatarShiftY: '1.04%', profile: 'ultra' }),
      25: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 114, opticalCenterY: 116, innerApertureRatio: 0.4345, outerVisibleRatio: 0.9167, scale: 1.2327, avatar: 0.64, shiftX: '0.00%', shiftY: '-1.67%', avatarShiftX: '-2.29%', avatarShiftY: '-1.46%', profile: 'ultra' }),
      26: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 114, opticalCenterY: 114, innerApertureRatio: 0.3876, outerVisibleRatio: 0.9042, scale: 1.2498, avatar: 0.64, shiftX: '0.21%', shiftY: '-0.42%', avatarShiftX: '-2.29%', avatarShiftY: '-2.29%', profile: 'ultra' }),
      27: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 120, opticalCenterY: 117, innerApertureRatio: 0.4632, outerVisibleRatio: 0.9417, scale: 1.2, avatar: 0.64, shiftX: '0.00%', shiftY: '2.50%', avatarShiftX: '0.21%', avatarShiftY: '-1.04%', profile: 'ultra' }),
      28: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 119, opticalCenterY: 118, innerApertureRatio: 0.3672, outerVisibleRatio: 0.9458, scale: 1.1947, avatar: 0.64, shiftX: '0.21%', shiftY: '0.62%', avatarShiftX: '-0.21%', avatarShiftY: '-0.62%', profile: 'ultra' }),
      29: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 121, opticalCenterY: 115, innerApertureRatio: 0.5706, outerVisibleRatio: 0.9083, scale: 1.244, avatar: 0.64, shiftX: '0.00%', shiftY: '0.42%', avatarShiftX: '0.62%', avatarShiftY: '-1.88%', profile: 'ultra' }),
      30: Object.freeze({ assetWidth: 240, assetHeight: 240, opticalCenterX: 122, opticalCenterY: 90, innerApertureRatio: 0.4759, outerVisibleRatio: 0.95, scale: 1.1895, avatar: 0.64, shiftX: '0.42%', shiftY: '0.62%', avatarShiftX: '1.04%', avatarShiftY: '-12.29%', profile: 'ultra' }),
      31: Object.freeze({ assetWidth: 212, assetHeight: 240, opticalCenterX: 97, opticalCenterY: 119, innerApertureRatio: 0.401, outerVisibleRatio: 1.0, scale: 1.13, avatar: 0.64, shiftX: '0.21%', shiftY: '0.00%', avatarShiftX: '-3.54%', avatarShiftY: '-0.21%', profile: 'ultra' }),
      32: Object.freeze({ assetWidth: 240, assetHeight: 213, opticalCenterX: 119, opticalCenterY: 106, innerApertureRatio: 0.4709, outerVisibleRatio: 1.0, scale: 1.13, avatar: 0.64, shiftX: '0.00%', shiftY: '-0.21%', avatarShiftX: '-0.21%', avatarShiftY: '0.00%', profile: 'ultra' }),
    })
  });
  const FRAME_VISUAL_PROFILES = FRAME_CALIBRATIONS.normal;
  const DEFAULT_MARKET_FRAME_PROFILE = Object.freeze({ scale: 1.13, avatar: 0.78, shiftX: '0%', shiftY: '0%', avatarShiftX: '0%', avatarShiftY: '0%', profile: 'normal' });
  const MARKET_FRAME_VISUAL_PROFILES = FRAME_CALIBRATIONS.market;




  const AVATAR_FRAME_VARIANTS = Object.freeze([
    'homeTopbar', 'leaderboard', 'accountModal', 'accountProfileCard', 'marketCard',
    'crashTopbar', 'crashLivePanel', 'crashWinNotice', 'chessTopbar', 'chessGameCard',
    'pistiTopbar', 'pistiScoreCard', 'snakeTopbar', 'spaceTopbar'
  ]);
  function normalizeVariant(value = '') {
    const key = String(value || '').trim();
    return AVATAR_FRAME_VARIANTS.includes(key) ? key : '';
  }
  const DEFAULT_VARIANT_SETTING = Object.freeze({
    avatarScale: 1,
    frameScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    frameOffsetX: 0,
    frameOffsetY: 0,
    innerPadding: 0,
    outerPadding: 0,
    thickness: 'normal',
    overflow: 'visible'
  });
  const settingsState = { config: { version: FRAME_CALIBRATION_VERSION, variants: {}, frames: {}, updatedAt: 0 }, promise: null, loaded: false };
  const mountedHosts = new Set();

  function finiteSetting(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function normalizeVariantSetting(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const thickness = ['thin', 'normal', 'thick', 'ultra'].includes(String(source.thickness || '').toLowerCase())
      ? String(source.thickness).toLowerCase()
      : 'normal';
    return {
      avatarScale: finiteSetting(source.avatarScale, 1, 0.65, 1.5),
      frameScale: finiteSetting(source.frameScale, 1, 0.7, 1.8),
      avatarOffsetX: finiteSetting(source.avatarOffsetX, 0, -30, 30),
      avatarOffsetY: finiteSetting(source.avatarOffsetY, 0, -30, 30),
      frameOffsetX: finiteSetting(source.frameOffsetX, 0, -30, 30),
      frameOffsetY: finiteSetting(source.frameOffsetY, 0, -30, 30),
      innerPadding: finiteSetting(source.innerPadding, 0, 0, 24),
      outerPadding: finiteSetting(source.outerPadding, 0, 0, 24),
      thickness,
      overflow: source.overflow === 'hidden' ? 'hidden' : 'visible'
    };
  }

  function normalizeSettingsConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const variants = {};
    const frames = {};
    AVATAR_FRAME_VARIANTS.forEach((variant) => {
      if (source.variants?.[variant]) variants[variant] = normalizeVariantSetting(source.variants[variant]);
    });
    const frameOverrides = Number(source.version || 0) >= FRAME_CALIBRATION_VERSION ? (source.frames || {}) : {};
    Object.entries(frameOverrides).forEach(([key, value]) => {
      if (/^(normal:(?:[1-9]|1[0-8])|market:(?:[1-9]|[12][0-9]|3[0-2])):(?:homeTopbar|leaderboard|accountModal|accountProfileCard|marketCard|crashTopbar|crashLivePanel|crashWinNotice|chessTopbar|chessGameCard|pistiTopbar|pistiScoreCard|snakeTopbar|spaceTopbar)$/.test(key)) {
        frames[key] = normalizeVariantSetting(value);
      }
    });
    return { version: FRAME_CALIBRATION_VERSION, variants, frames, updatedAt: Number(source.updatedAt || 0) || 0 };
  }

  function getSpecificSettingKey(variant = '', frameIndex = 0, frameUrl = '') {
    const safeVariant = normalizeVariant(variant);
    if (!safeVariant) return '';
    const marketIndex = frameUrl ? getMarketFrameAssetIndex(frameUrl) : 0;
    if (marketIndex > 0) return `market:${marketIndex}:${safeVariant}`;
    const normalIndex = normalizeFrameIndex(frameIndex);
    return normalIndex > 0 ? `normal:${normalIndex}:${safeVariant}` : '';
  }

  function mergeVariantSettings(...items) {
    const merged = { ...DEFAULT_VARIANT_SETTING };
    items.filter(Boolean).forEach((item) => Object.assign(merged, normalizeVariantSetting(item)));
    return normalizeVariantSetting(merged);
  }

  function resolveVariantSetting(variant = '', frameIndex = 0, frameUrl = '', provided = null) {
    const safeVariant = normalizeVariant(variant);
    const specificKey = getSpecificSettingKey(safeVariant, frameIndex, frameUrl);
    return mergeVariantSettings(
      settingsState.config.variants?.[safeVariant],
      specificKey ? settingsState.config.frames?.[specificKey] : null,
      provided
    );
  }

  function setSettings(config = {}) {
    settingsState.config = normalizeSettingsConfig(config);
    settingsState.loaded = true;
    refreshAllMounted();
    return settingsState.config;
  }

  function settingsUrl() {
    try { return window.__PM_API__?.buildUrl ? window.__PM_API__.buildUrl('/api/avatar-frame/settings') : `${String(window.__PLAYMATRIX_API_URL__ || location.origin).replace(/\/+$/, '')}/api/avatar-frame/settings`; }
    catch (_) { return '/api/avatar-frame/settings'; }
  }

  async function loadSettings({ force = false } = {}) {
    if (settingsState.loaded && !force) return settingsState.config;
    if (settingsState.promise) return settingsState.promise;
    settingsState.promise = fetch(settingsUrl(), { credentials: 'include', cache: force ? 'no-store' : 'default' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setSettings(payload?.config || {}))
      .catch(() => settingsState.config)
      .finally(() => { settingsState.promise = null; });
    return settingsState.promise;
  }
  function frameAllowedForVariant(variant = '') {
    return normalizeVariant(variant) !== 'homeTopbar';
  }
  function applyVariantSetting(node, variant = '', variantSetting = null, frameIndex = 0, frameUrl = '') {
    if (!node) return node;
    const safeVariant = normalizeVariant(variant);
    const setting = resolveVariantSetting(safeVariant, frameIndex, frameUrl, variantSetting);
    const size = Math.max(18, Number(node.dataset.pmAvatarSizePx || node.style.width?.replace('px', '') || 45) || 45);
    const baseAvatarScale = finiteSetting(node.style.getPropertyValue('--pm-avatar-base-scale') || node.style.getPropertyValue('--pm-avatar-scale'), 1, 0.2, 3);
    const baseFrameScale = finiteSetting(node.style.getPropertyValue('--pm-frame-base-scale') || node.style.getPropertyValue('--pm-frame-scale'), 1, 0.2, 3);
    const innerFactor = Math.max(0.55, 1 - ((setting.innerPadding * 2) / size));
    const outerFactor = Math.max(0.55, 1 - ((setting.outerPadding * 2) / size));
    const baseAvatarX = node.style.getPropertyValue('--pm-avatar-base-shift-x') || '0px';
    const baseAvatarY = node.style.getPropertyValue('--pm-avatar-base-shift-y') || '0px';
    const baseFrameX = node.style.getPropertyValue('--pm-frame-base-shift-x') || '0px';
    const baseFrameY = node.style.getPropertyValue('--pm-frame-base-shift-y') || '0px';
    node.dataset.pmAvatarVariant = safeVariant;
    node.dataset.pmFrameThickness = setting.thickness;
    node.style.setProperty('--pm-avatar-scale', String(baseAvatarScale * setting.avatarScale * innerFactor));
    node.style.setProperty('--pm-avatar-shift-x', `calc(${baseAvatarX} + ${setting.avatarOffsetX}px)`);
    node.style.setProperty('--pm-avatar-shift-y', `calc(${baseAvatarY} + ${setting.avatarOffsetY}px)`);
    node.style.setProperty('--pm-frame-scale', String(baseFrameScale * setting.frameScale * outerFactor));
    node.style.setProperty('--pm-frame-shift-x', `calc(${baseFrameX} + ${setting.frameOffsetX}px)`);
    node.style.setProperty('--pm-frame-shift-y', `calc(${baseFrameY} + ${setting.frameOffsetY}px)`);
    node.style.setProperty('--pm-avatar-inner-padding', `${setting.innerPadding}px`);
    node.style.setProperty('--pm-avatar-frame-outer-padding', `${setting.outerPadding}px`);
    node.style.overflow = setting.overflow;
    return node;
  }

  function normalizeAssetPath(value = '') {
    const raw = String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw, window.location.origin);
        if (parsed.protocol !== 'https:') return '';
        return parsed.href;
      } catch (_) { return ''; }
    }
    if (raw.startsWith('/')) return raw.replace(/\/+/g, '/');
    if (/^(assets\/|\.\/assets\/|public\/|\.\/public\/)/i.test(raw)) return `/${raw.replace(/^\.?\//, '')}`.replace(/\/+/g, '/');
    return '';
  }

  function getAvatarRegistry() {
    const registry = window.PMAvatarRegistry && typeof window.PMAvatarRegistry === 'object' ? window.PMAvatarRegistry : {};
    const fallback = normalizeAssetPath(registry.fallback || FALLBACK_AVATAR) || FALLBACK_AVATAR;
    const avatarSet = new Set();
    if (Array.isArray(registry.avatars)) {
      registry.avatars.forEach((entry) => {
        const normalized = normalizeAssetPath(entry);
        if (normalized) avatarSet.add(normalized);
      });
    }
    avatarSet.add(fallback);
    return { fallback, avatarSet };
  }

  function isRegisteredAvatarUrl(value = '') {
    const normalized = normalizeAssetPath(value);
    if (!normalized) return false;
    const { avatarSet } = getAvatarRegistry();
    return avatarSet.has(normalized);
  }

  function safeAvatarUrl(value = '') {
    const normalized = normalizeAssetPath(value);
    const { fallback, avatarSet } = getAvatarRegistry();
    if (!normalized) return fallback;
    if (avatarSet.has(normalized)) return normalized;
    if (/^\/public\/assets\/market\/(generated|avatars)\//i.test(normalized)) return normalized;
    return fallback;
  }

  function safeFrameUrl(value = '') {
    const normalized = normalizeAssetPath(value);
    if (!normalized) return '';
    if (/^https:\/\//i.test(normalized)) return '';
    if (!/\/public\/assets\/(market\/frames|frames)\//i.test(normalized)) return '';
    return normalized;
  }

  function escapeAttr(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function normalizeLevel(level = 0) {
    const value = Math.floor(Number(level) || 0);
    return Math.max(0, Math.min(100, value));
  }

  function normalizeFrameIndex(frameIndex = 0) {
    const value = Math.floor(Number(frameIndex) || 0);
    return Math.max(0, Math.min(FRAME_ASSET_COUNT, value));
  }

  function getFrameRange(level = 0) {
    const lvl = normalizeLevel(level);
    if (lvl <= 0) return null;
    return FRAME_LEVEL_TO_ASSET.find((item) => lvl >= item.min && lvl <= item.max) || FRAME_LEVEL_TO_ASSET[FRAME_LEVEL_TO_ASSET.length - 1];
  }

  function getFrameRangeByAssetIndex(assetIndex = 0) {
    const idx = normalizeFrameIndex(assetIndex);
    if (idx <= 0) return null;
    return FRAME_LEVEL_TO_ASSET.find((item) => item.asset === idx) || null;
  }

  function getFrameAssetIndex(level = 0) {
    const matchedRange = getFrameRange(level);
    return matchedRange ? matchedRange.asset : 0;
  }

  function getFrameUnlockLevel(value = 0) {
    const range = getFrameRange(value);
    return range ? range.min : 0;
  }

  function getFrameLabel(level = 0) {
    const range = getFrameRange(level);
    if (!range) return 'Çerçevesiz';
    return range.min === range.max ? `Seviye ${range.min}` : `Seviye ${range.min}-${range.max}`;
  }

  function resolveFrameIndex(level = 0, exactFrameIndex = null) {
    const numericExact = Math.floor(Number(exactFrameIndex) || 0);
    if (numericExact > 0 && numericExact <= FRAME_ASSET_COUNT) return normalizeFrameIndex(numericExact);
    if (numericExact > FRAME_ASSET_COUNT) return getFrameAssetIndex(numericExact);
    return getFrameAssetIndex(level);
  }

  function isRegisteredFrameAssetIndex(frameIndex = 0) {
    const normalized = normalizeFrameIndex(frameIndex);
    return normalized >= 1 && normalized <= FRAME_ASSET_COUNT;
  }

  function getMarketFrameAssetIndex(frameUrl = '') {
    const normalized = normalizeAssetPath(frameUrl);
    const match = normalized.match(/\/market-(\d{1,3})\.(?:png|webp|jpe?g|svg)(?:[?#].*)?$/i)
      || normalized.match(/(?:market[-_]?frame|market|frame)[-_]?(\d{1,3})/i);
    return match ? Math.max(0, Math.trunc(Number(match[1]) || 0)) : 0;
  }

  function getMarketFrameProfile(frameUrl = '') {
    const index = getMarketFrameAssetIndex(frameUrl);
    return MARKET_FRAME_VISUAL_PROFILES[index] || DEFAULT_MARKET_FRAME_PROFILE;
  }

  function getFrameProfile(frameIndex = 0, frameUrl = '') {
    if (frameUrl) return getMarketFrameProfile(frameUrl);
    const normalized = normalizeFrameIndex(frameIndex);
    if (normalized <= 0) return { scale: 1, avatar: 1, shiftX: '0px', shiftY: '0px', profile: 'none' };
    return FRAME_VISUAL_PROFILES[normalized] || DEFAULT_FRAME_PROFILE;
  }

  function isFrameUnlocked(frameLevel = 0, accountLevel = 1) {
    const selected = normalizeLevel(frameLevel);
    if (selected <= 0) return true;
    const unlockLevel = getFrameUnlockLevel(selected);
    return unlockLevel <= normalizeLevel(accountLevel);
  }

  function getSafeSelectedFrame(frameLevel = 0, accountLevel = 1) {
    const selected = normalizeLevel(frameLevel);
    if (selected <= 0) return 0;
    return isFrameUnlocked(selected, accountLevel) ? selected : 0;
  }

  function createImage({ src, className = '', alt = '', hidden = false, fallback = '', ariaHidden = false } = {}) {
    const img = document.createElement('img');
    img.src = src || FALLBACK_AVATAR;
    img.alt = alt || '';
    if (className) img.className = className;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    if (fallback) img.dataset.fallback = fallback;
    if (ariaHidden) img.setAttribute('aria-hidden', 'true');
    if (hidden) img.hidden = true;
    return img;
  }

  function buildHTML({ avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, extraClass = '', imageClass = 'pm-avatar-img', wrapperClass = 'pm-avatar', alt = 'Oyuncu', sizeTag = '', variant = '', variantSetting = null } = {}) {
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const safeAvatar = safeAvatarUrl(avatarUrl);
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const frameSrc = customFrameUrl || (frameIndex > 0 ? `/public/assets/frames/frame-${frameIndex}.png` : '');
    const profile = customFrameUrl ? getMarketFrameProfile(customFrameUrl) : getFrameProfile(frameIndex);
    const classes = [wrapperClass, hasFrame ? 'has-frame' : '', customFrameUrl ? 'has-market-frame' : '', extraClass].filter(Boolean).join(' ');
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    const sizeAttr = sizeTag ? ` data-pm-avatar-size="${escapeAttr(sizeTag)}"` : '';
    const setting = resolveVariantSetting(normalizedVariant, frameIndex, customFrameUrl, variantSetting);
    const innerFactor = Math.max(0.55, 1 - ((setting.innerPadding * 2) / normalizedSize));
    const outerFactor = Math.max(0.55, 1 - ((setting.outerPadding * 2) / normalizedSize));
    const avatarScale = (Number(profile.avatar || 1) * setting.avatarScale * innerFactor);
    const frameScale = (Number(profile.scale || 1) * setting.frameScale * outerFactor);
    const styleAttr = ` style="--pm-avatar-base-scale:${escapeAttr(String(profile.avatar || 1))};--pm-avatar-base-shift-x:${escapeAttr(profile.avatarShiftX || '0px')};--pm-avatar-base-shift-y:${escapeAttr(profile.avatarShiftY || '0px')};--pm-avatar-fit:${escapeAttr(String(avatarScale))};--pm-avatar-scale:${escapeAttr(String(avatarScale))};--pm-avatar-shift-x:calc(${escapeAttr(profile.avatarShiftX || '0px')} + ${escapeAttr(String(setting.avatarOffsetX))}px);--pm-avatar-shift-y:calc(${escapeAttr(profile.avatarShiftY || '0px')} + ${escapeAttr(String(setting.avatarOffsetY))}px);--pm-frame-base-scale:${escapeAttr(String(profile.scale || 1))};--pm-frame-base-shift-x:${escapeAttr(profile.shiftX || '0px')};--pm-frame-base-shift-y:${escapeAttr(profile.shiftY || '0px')};--pm-frame-scale:${escapeAttr(String(frameScale))};--pm-frame-shift-x:calc(${escapeAttr(profile.shiftX || '0px')} + ${escapeAttr(String(setting.frameOffsetX))}px);--pm-frame-shift-y:calc(${escapeAttr(profile.shiftY || '0px')} + ${escapeAttr(String(setting.frameOffsetY))}px);--pm-avatar-inner-padding:${escapeAttr(String(setting.innerPadding))}px;--pm-avatar-frame-outer-padding:${escapeAttr(String(setting.outerPadding))}px;overflow:${escapeAttr(setting.overflow)};"`;
    const frameHtml = hasFrame
      ? `<img src="${escapeAttr(frameSrc)}" class="pm-frame-image pm-avatar-shell__frame frame-${frameIndex || 'market'}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-market-frame="${customFrameUrl ? 'true' : 'false'}" data-fallback="${escapeAttr(frameSrc)}">`
      : '';
    return `<div class="${escapeAttr(classes)}" data-pm-avatar="true" data-avatar-registered="${isRegisteredAvatarUrl(avatarUrl) ? 'true' : 'false'}" data-frame-registered="${customFrameUrl || frameIndex === 0 || isRegisteredFrameAssetIndex(frameIndex) ? 'true' : 'false'}" data-market-frame="${customFrameUrl ? 'true' : 'false'}" data-market-frame-profile="${escapeAttr(customFrameUrl ? (profile.profile || 'market') : '')}" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-frame-asset-index="${frameIndex}" data-pm-avatar-size-px="${normalizedSize}" data-pm-avatar-variant="${escapeAttr(normalizedVariant)}" data-pm-frame-thickness="${escapeAttr(setting.thickness)}"${sizeAttr}${styleAttr}><img src="${escapeAttr(safeAvatar)}" alt="${escapeAttr(alt || 'Oyuncu')}" class="${escapeAttr(imageClass)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-fallback="${escapeAttr(FALLBACK_AVATAR)}">${frameHtml}</div>`;
  }

  function applyNodeProfile(node, { avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, variant = '', variantSetting = null } = {}) {
    if (!node) return node;
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const profile = customFrameUrl ? getMarketFrameProfile(customFrameUrl) : getFrameProfile(frameIndex);
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    node.dataset.avatarRegistered = isRegisteredAvatarUrl(avatarUrl) ? 'true' : 'false';
    node.dataset.frameRegistered = customFrameUrl || frameIndex === 0 || isRegisteredFrameAssetIndex(frameIndex) ? 'true' : 'false';
    node.dataset.marketFrame = customFrameUrl ? 'true' : 'false';
    node.dataset.frameIndex = String(frameIndex);
    node.dataset.frameLevel = String(normalizedLevel);
    node.dataset.frameAssetIndex = String(frameIndex);
    node.dataset.pmAvatarSizePx = String(normalizedSize);
    node.classList.toggle('has-frame', hasFrame);
    node.classList.toggle('has-market-frame', !!customFrameUrl);
    node.style.width = `${normalizedSize}px`;
    node.style.height = `${normalizedSize}px`;
    node.style.setProperty('--pm-avatar-base-scale', String(profile.avatar || 1));
    node.style.setProperty('--pm-avatar-base-shift-x', profile.avatarShiftX || '0px');
    node.style.setProperty('--pm-avatar-base-shift-y', profile.avatarShiftY || '0px');
    node.style.setProperty('--pm-avatar-fit', String(profile.avatar || 1));
    node.style.setProperty('--pm-avatar-scale', String(profile.avatar || 1));
    node.style.setProperty('--pm-avatar-shift-x', profile.avatarShiftX || '0px');
    node.style.setProperty('--pm-avatar-shift-y', profile.avatarShiftY || '0px');
    node.style.setProperty('--pm-frame-base-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-base-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-base-shift-y', profile.shiftY || '0px');
    node.style.setProperty('--pm-frame-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
    node.style.setProperty('--pm-frame-variant-scale', customFrameUrl ? String(profile.scale || 1) : '1');
    node.style.setProperty('--pm-frame-variant-shift-x', customFrameUrl ? (profile.shiftX || '0px') : '0px');
    node.style.setProperty('--pm-frame-variant-shift-y', customFrameUrl ? (profile.shiftY || '0px') : '0px');
    node.dataset.marketFrameProfile = customFrameUrl ? (profile.profile || 'market') : '';
    const frame = node.querySelector('.pm-avatar-shell__frame');
    if (frame) {
      const frameSrc = customFrameUrl || (frameIndex > 0 ? `/public/assets/frames/frame-${frameIndex}.png` : '');
      frame.dataset.frameIndex = String(frameIndex);
      frame.dataset.frameLevel = String(normalizedLevel);
      frame.dataset.marketFrame = customFrameUrl ? 'true' : 'false';
      frame.dataset.fallback = frameSrc;
      frame.src = frameSrc;
      frame.hidden = !frameSrc;
      frame.style.setProperty('--pm-frame-base-scale', String(profile.scale));
      frame.style.setProperty('--pm-frame-base-shift-x', profile.shiftX || '0px');
      frame.style.setProperty('--pm-frame-base-shift-y', profile.shiftY || '0px');
      frame.style.setProperty('--pm-frame-scale', String(profile.scale));
      frame.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
      frame.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
    }
    applyVariantSetting(node, normalizedVariant, variantSetting, frameIndex, customFrameUrl);
    return node;
  }

  function createNode(options = {}) {
    const { avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, extraClass = '', imageClass = 'pm-avatar-img', wrapperClass = 'pm-avatar', alt = 'Oyuncu', sizeTag = '', variant = '', variantSetting = null } = options || {};
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const node = document.createElement('div');
    node.className = [wrapperClass, hasFrame ? 'has-frame' : '', customFrameUrl ? 'has-market-frame' : '', extraClass].filter(Boolean).join(' ');
    node.dataset.pmAvatar = 'true';
    if (sizeTag) node.dataset.pmAvatarSize = String(sizeTag);
    if (normalizedVariant) node.dataset.pmAvatarVariant = normalizedVariant;
    const avatar = createImage({ src: safeAvatarUrl(avatarUrl), className: imageClass, alt: alt || 'Oyuncu', fallback: FALLBACK_AVATAR });
    node.appendChild(avatar);
    if (hasFrame) {
      const frameSrc = customFrameUrl || `/public/assets/frames/frame-${frameIndex}.png`;
      const frame = createImage({ src: frameSrc, className: `pm-frame-image pm-avatar-shell__frame frame-${frameIndex || 'market'}`, alt: '', fallback: frameSrc, ariaHidden: true });
      frame.dataset.marketFrame = customFrameUrl ? 'true' : 'false';
      node.appendChild(frame);
    }
    applyNodeProfile(node, { ...options, variantSetting, level: normalizedLevel, exactFrameIndex: frameIndex, frameUrl: customFrameUrl, sizePx, variant: normalizedVariant });
    return node;
  }

  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = img.dataset.fallback || '';
    if (!fallback) return;
    if (img.dataset.fallbackApplied === 'true') {
      if (img.classList.contains('pm-avatar-shell__frame')) img.hidden = true;
      return;
    }
    img.dataset.fallbackApplied = 'true';
    img.src = fallback;
  }, true);

  function mount(target, options = {}) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) return null;
    mountedHosts.add(host);
    host.__pmAvatarMountOptions = { ...(options || {}) };
    const variant = normalizeVariant(options.variant || '');
    const allowFrame = frameAllowedForVariant(variant);
    const normalizedOptions = {
      ...options,
      variant,
      level: allowFrame ? normalizeLevel(options.level || 0) : 0,
      exactFrameIndex: allowFrame ? (options.exactFrameIndex ?? null) : 0,
      frameUrl: allowFrame ? safeFrameUrl(options.frameUrl || '') : ''
    };
    const key = JSON.stringify({
      avatarUrl: safeAvatarUrl(normalizedOptions.avatarUrl || ''),
      level: normalizedOptions.level,
      exactFrameIndex: normalizedOptions.exactFrameIndex,
      frameUrl: normalizedOptions.frameUrl,
      sizePx: Math.max(18, Number(normalizedOptions.sizePx) || 45),
      extraClass: normalizedOptions.extraClass || '',
      imageClass: normalizedOptions.imageClass || 'pm-avatar-img',
      wrapperClass: normalizedOptions.wrapperClass || 'pm-avatar',
      sizeTag: normalizedOptions.sizeTag || '',
      variant,
      variantSetting: normalizedOptions.variantSetting || null
    });
    if (!options.force && host.dataset.pmAvatarMountKey === key && host.firstElementChild) return host.firstElementChild;
    const node = createNode(normalizedOptions);
    host.replaceChildren(node);
    host.dataset.pmAvatarMountKey = key;
    return node;
  }

  function refreshAllMounted() {
    mountedHosts.forEach((host) => {
      if (!host?.isConnected) { mountedHosts.delete(host); return; }
      const options = host.__pmAvatarMountOptions || {};
      mount(host, { ...options, force: true });
    });
  }

  function getFrameRanges() {
    return FRAME_LEVEL_TO_ASSET.map((item) => Object.freeze({ ...item }));
  }

  window.PMAvatar = Object.freeze({
    FALLBACK_AVATAR,
    FRAME_ASSET_COUNT,
    FRAME_CALIBRATION_VERSION,
    FRAME_CALIBRATIONS,
    FRAME_LEVEL_TO_ASSET,
    FRAME_VISUAL_PROFILES,
    MARKET_FRAME_VISUAL_PROFILES,
    AVATAR_FRAME_VARIANTS,
    DEFAULT_VARIANT_SETTING,
    normalizeVariantSetting,
    resolveVariantSetting,
    getSettings: () => settingsState.config,
    setSettings,
    loadSettings,
    refreshAllMounted,
    normalizeLevel,
    normalizeFrameIndex,
    normalizeVariant,
    frameAllowedForVariant,
    getFrameRange,
    getFrameRanges,
    getFrameRangeByAssetIndex,
    getFrameUnlockLevel,
    getFrameLabel,
    getFrameAssetIndex,
    resolveFrameIndex,
    getFrameProfile,
    getMarketFrameAssetIndex,
    getMarketFrameProfile,
    isFrameUnlocked,
    getSafeSelectedFrame,
    isRegisteredAvatarUrl,
    safeAvatarUrl,
    safeFrameUrl,
    isRegisteredFrameAssetIndex,
    buildHTML,
    applyNodeProfile,
    createNode,
    renderAvatarNode: createNode,
    mount
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => loadSettings().catch(() => null), { once: true });
  else loadSettings().catch(() => null);
})();
