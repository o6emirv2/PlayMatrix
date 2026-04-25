const safePlay = (node) => node?.play?.().catch?.(() => null);

export function createCrashAudioBank(root = document) {
  const bank = new Map();
  root.querySelectorAll?.("audio[data-crash-sfx]").forEach((audio) => bank.set(audio.dataset.crashSfx, audio));
  return Object.freeze({
    play(name) { return safePlay(bank.get(name)); },
    has(name) { return bank.has(name); },
    size: bank.size
  });
}
