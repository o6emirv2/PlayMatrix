export function installHeroSliderGuards(root = document) {
  const track = root.querySelector?.("#heroSliderTrack, .hero-slider-track");
  if (!track) return;
  track.dataset.module = "hero-slider";
  track.setAttribute("aria-live", "polite");
}
