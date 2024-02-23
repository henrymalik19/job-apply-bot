interface JobSearchQueueJob {
  taskExecutionId: number;
  userId: number;
  preferenceId: number;
  //   onsite: boolean;
  //   hybrid: boolean;
  //   remote: boolean;
}

interface JobApplyQueueJob {
  taskExecutionId: number;
  userJobId: number;
}

export { JobApplyQueueJob, JobSearchQueueJob };
