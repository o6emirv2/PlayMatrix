/* PlayMatrix FAZ 3 modular architecture. */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
export const formatNumber = (n) => Number(n || 0).toLocaleString("tr-TR");
export const formatMc = (n) => `${formatNumber(n)} MC`;
