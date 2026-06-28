import { callHomeRuntime } from './widget-contract.js';

export function openMarketPanel() {
  return callHomeRuntime('openSheet', 'market');
}
