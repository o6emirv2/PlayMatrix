/* PlayMatrix FAZ 3 modular architecture. */
export function openModal(id) { const el = document.getElementById(id); if (!el) return false; el.classList.add("show"); el.setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open"); return true; }
export function closeModal(id) { const el = document.getElementById(id); if (!el) return false; el.classList.remove("show"); el.setAttribute("aria-hidden", "true"); if (!document.querySelector(".ps-modal.show")) document.body.classList.remove("modal-open"); return true; }
