import { createApp } from "./app.js";
import { getResolvedSolverPath } from "./solverRunner.js";

const port = process.env.PORT || 3001;
const host = "0.0.0.0";
const app = createApp();

app.listen(port, host, () => {
  console.log(
    `1140506 EDA API listening on ${host}:${port} NODE_ENV=${process.env.NODE_ENV || "development"} solver=${getResolvedSolverPath()}`,
  );
});
