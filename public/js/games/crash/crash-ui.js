export function setCrashBootMessage(message, tone = "info") {
  const node = document.getElementById("loaderStatus") || document.getElementById("crashLoaderStatus");
  if (!node) return;
  node.textContent = String(message || "");
  node.dataset.tone = tone;
}

export function setCrashIntroHidden(hidden = true) {
  const intro = document.getElementById("studioIntro");
  if (!intro) return;
  intro.hidden = !!hidden;
  intro.classList.toggle("is-hidden", !!hidden);
}
