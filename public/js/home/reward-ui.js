import { callHomeRuntime } from './widget-contract.js';

export function openRewardsPanel() {
  return callHomeRuntime('openSheet', 'wheel');
}
