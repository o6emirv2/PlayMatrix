/* PlayMatrix FAZ 3 modular architecture. */
import { loadFirebaseWebConfig } from "../../firebase-runtime.js";
export { loadFirebaseWebConfig };
export async function getFirebaseClientConfig(options = {}) { return loadFirebaseWebConfig({ required: false, scope: "shared", ...options }); }
