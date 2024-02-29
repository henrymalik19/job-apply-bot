interface JobSearchQueueJob {
  userId: number;
  preferenceId: number;
}

interface JobApplyQueueJob {
  userJobId: number;
}

export { JobApplyQueueJob, JobSearchQueueJob };
