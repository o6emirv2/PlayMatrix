/* PlayMatrix FAZ 3: home application orchestrator.
 * Static same-origin module import; no Blob/ObjectURL and no delayed dynamic import.
 */
import "./legacy-home.runtime.js";
let booted = true;
export async function bootHomeApplication() {
  if (booted) return true;
  booted = true;
  return true;
}
export const homeModuleInfo = Object.freeze({ phase: 3, strategy: "static-module-runtime", cspSafe: true, fastBoot: true });
