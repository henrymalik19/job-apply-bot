"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const job_search_worker_1 = require("./job-search-worker");
const connection = new ioredis_1.default({ maxRetriesPerRequest: null });
function main() {
    new job_search_worker_1.JobSearchWorker().init(connection);
}
main();
