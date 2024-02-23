"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const job_apply_worker_1 = require("./job-apply-worker");
const connection = new ioredis_1.default({ maxRetriesPerRequest: null });
function main() {
    new job_apply_worker_1.JobApplyWorker().init(connection);
}
main();
