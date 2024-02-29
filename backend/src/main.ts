import express from "express";

import { APP_PORT } from "./constants";

const app = express();

app.use(express.json());

app.listen(APP_PORT, () => {
  console.info(`[info] Server listening on port:${APP_PORT}`);
});
