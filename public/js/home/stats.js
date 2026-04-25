const NUMBER_FORMAT = new Intl.NumberFormat("tr-TR");

export function formatMetric(value, fallback = "0") {
  const number = Number(value);
  return Number.isFinite(number) ? NUMBER_FORMAT.format(number) : fallback;
}

export function installStatsGuards(root = document) {
  root.querySelectorAll?.("[data-stat-value]").forEach((node) => {
    node.textContent = formatMetric(node.dataset.statValue, node.textContent || "0");
  });
}
