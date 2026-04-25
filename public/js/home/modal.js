import { qsa } from "./dom-utils.js";

export function installModalSafety(root = document) {
  qsa(".ps-modal:not(.active)", root).forEach((modal) => {
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
  });
  qsa(".sheet-shell:not(.is-open)", root).forEach((sheet) => {
    sheet.setAttribute("aria-hidden", "true");
  });
}
