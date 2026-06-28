import { callHomeRuntime } from './widget-contract.js';

export function openWheelPanel() {
  return callHomeRuntime('openSheet', 'wheel');
}
