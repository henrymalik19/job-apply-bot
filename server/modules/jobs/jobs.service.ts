// Public API of the jobs module. Discovery writes jobs through these; matching
// (M4) and the Jobs page (M3) will read through queries added here.
export { countJobs, insertDiscoveredJobs, listExternalIds, syncBoard, type NewJob } from "./jobs.repository";
