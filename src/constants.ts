const HEADLESS_BROWSER = process.env.HEADLESS_BROWSER === "true" ? true : false;

const AWS_S3_REGION = "us-east-1";
const AWS_S3_ENDPOINT = "http://minio:9000";
const AWS_S3_ACCESS_KEY_ID = "8yVZ6AraoKBY2IrEbSF9";
const AWS_S3_SECRET_ACCESS_KEY = "KCruWV8mgjXiBxHkONM96eFmp71e6VdlrBj73Bc5";

const REDIS_HOST = process.env.REDIS_HOST as string;
const REDIS_PORT = parseInt(process.env.REDIS_PORT as string);

const DB_HOST = process.env.DB_HOST ?? "";
const DB_USER = process.env.DB_USER ?? "";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const DB_NAME = process.env.DB_NAME ?? "";

const ENCRYPTION = {
  KEY: Buffer.from(process.env.KEY as string, "hex"),
  IV: Buffer.from(process.env.IV as string, "hex"),
};

const TASK_EXECUTION_STATUSES = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
};

const USER_JOB_STATUSES = {
  READY: "READY",
  APPLYING: "APPLYING",
  APPLIED: "APPLIED",
  FAILED: "FAILED",
};

export {
  HEADLESS_BROWSER,
  AWS_S3_REGION,
  AWS_S3_ENDPOINT,
  AWS_S3_ACCESS_KEY_ID,
  AWS_S3_SECRET_ACCESS_KEY,
  REDIS_HOST,
  REDIS_PORT,
  DB_HOST,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  ENCRYPTION,
  TASK_EXECUTION_STATUSES,
  USER_JOB_STATUSES,
};
