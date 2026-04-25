export function setCrashProgress(element, percent) {
  if (!element) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  element.style.setProperty("--crash-progress", `${value}%`);
  element.dataset.progress = String(Math.round(value));
}

export function formatCrashMultiplier(value) {
  const number = Math.max(1, Number(value) || 1);
  return `${number.toFixed(2)}x`;
}
