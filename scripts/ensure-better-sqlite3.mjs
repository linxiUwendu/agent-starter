/**
 * 原生依赖（better-sqlite3、nodejieba）须与当前 Node ABI 一致。
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function pkgDir(name) {
  return require.resolve(`${name}/package.json`).replace(/\/package\.json$/, "");
}

function tryRequire(name) {
  return require(name);
}

function rebuildNative(name, npmScript = "install") {
  const dir = pkgDir(name);
  console.log(`Rebuilding ${name} for Node ${process.version}…`);
  execSync(`npm run ${npmScript}`, { cwd: dir, stdio: "inherit", env: process.env });
  tryRequire(name);
}

for (const dep of ["better-sqlite3", "nodejieba"]) {
  try {
    tryRequire(dep);
    console.log(`${dep} ok (Node ${process.version}, ABI ${process.versions.modules})`);
  } catch (err) {
    const code = err?.code;
    const msg = String(err?.message ?? err);
    const needsRebuild =
      code === "ERR_DLOPEN_FAILED" ||
      code === "MODULE_NOT_FOUND" ||
      /native binding was not found/i.test(msg);
    if (!needsRebuild) throw err;
    const script = dep === "better-sqlite3" ? "build-release" : "install";
    rebuildNative(dep, script);
    console.log(`${dep} rebuilt`);
  }
}
