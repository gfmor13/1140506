function getSolverSpawnEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  if (process.platform === "win32") {
    const currentPath = baseEnv.PATH || baseEnv.Path || "";
    const runtimePaths = ["C:\\msys64\\ucrt64\\bin", "C:\\msys64\\usr\\bin"];
    env.PATH = [currentPath, ...runtimePaths].filter(Boolean).join(";");
    env.Path = env.PATH;
  }
  return env;
}

module.exports = {
  getSolverSpawnEnv,
};
