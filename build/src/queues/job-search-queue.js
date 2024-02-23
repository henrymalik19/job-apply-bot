"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobSearchQueue = exports.jobSearchQueueName = void 0;
const bullmq_1 = require("bullmq");
const jobSearchQueueName = "jobSearchQueue";
exports.jobSearchQueueName = jobSearchQueueName;
const jobSearchQueue = new bullmq_1.Queue(jobSearchQueueName);
exports.jobSearchQueue = jobSearchQueue;
