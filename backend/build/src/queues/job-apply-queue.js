"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobApplyQueue = exports.jobApplyQueueName = void 0;
const bullmq_1 = require("bullmq");
const jobApplyQueueName = "jobApplyQueue";
exports.jobApplyQueueName = jobApplyQueueName;
const jobApplyQueue = new bullmq_1.Queue(jobApplyQueueName);
exports.jobApplyQueue = jobApplyQueue;
