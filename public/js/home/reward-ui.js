import { byId } from "./dom-utils.js";

export function installRewardUiGuards() {
  const wheel = byId("wheelCanvas");
  if (wheel) wheel.dataset.module = "reward-wheel";
  const promo = byId("promoCode");
  if (promo) {
    promo.autocomplete = "off";
    promo.inputMode = "text";
  }
}
