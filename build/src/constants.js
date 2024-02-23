"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_JOB_STATUSES = exports.TASK_EXECUTION_STATUSES = exports.ENCRYPTION = void 0;
const ENCRYPTION = {
    KEY: Buffer.from(process.env.KEY, "hex"),
    IV: Buffer.from(process.env.IV, "hex"),
};
exports.ENCRYPTION = ENCRYPTION;
const TASK_EXECUTION_STATUSES = {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
};
exports.TASK_EXECUTION_STATUSES = TASK_EXECUTION_STATUSES;
const USER_JOB_STATUSES = {
    READY: "READY",
    APPLYING: "APPLYING",
    APPLIED: "APPLIED",
    FAILED: "FAILED",
};
exports.USER_JOB_STATUSES = USER_JOB_STATUSES;
