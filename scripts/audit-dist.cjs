const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function fail(message) {
  process.stderr.write(`dist audit failed: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail("dist/ does not exist. Run npm run build first.");
}

if (!fs.existsSync(indexPath)) {
  fail("dist/index.html does not exist.");
}

const files = walkFiles(distDir);
const mapFiles = files.filter((file) => file.endsWith(".map"));
if (mapFiles.length > 0) {
  fail(`found sourcemap files: ${mapFiles.map((file) => path.relative(rootDir, file)).join(", ")}`);
}

const jsAssets = files.filter((file) => file.endsWith(".js"));
const cssAssets = files.filter((file) => file.endsWith(".css"));
if (jsAssets.length === 0) {
  fail("no JavaScript assets found.");
}
if (cssAssets.length === 0) {
  fail("no CSS assets found.");
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
if (/\.map(?:["')\s]|$)/.test(indexHtml) || /sourceMappingURL/i.test(indexHtml)) {
  fail("index.html references a sourcemap.");
}

const totalAssetBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
process.stdout.write(
  JSON.stringify(
    {
      status: "OK",
      dist: path.relative(rootDir, distDir),
      indexHtml: true,
      jsAssets: jsAssets.length,
      cssAssets: cssAssets.length,
      mapFiles: 0,
      totalAssetBytes,
    },
    null,
    2,
  ) + "\n",
);
