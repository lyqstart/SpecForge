/**
 * Unit Generator Module
 *
 * Generates systemd unit files and NSSM command sequences
 * for service management on Linux and Windows respectively.
 */

export type { ServiceUnitGenerator } from "./service-unit-generator.js";
export { DefaultServiceUnitGenerator } from "./default-impl.js";