/**
 * Loads better-sqlite3; if ABI mismatches Node (different NODE_MODULE_VERSION),
 * rebuilds the native addon for the *currently running* Node and retries.
 *
 * Wired into predev/prestart/prebuild. Skip with SKIP_NATIVE_CHECK=1.
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cwd = path.join(__dirname, "..");

function canLoadBetterSqlite3() {
  try {
    delete require.cache[require.resolve("better-sqlite3")];
    require("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

function rebuild() {
  const res = spawnSync("npm", ["rebuild", "better-sqlite3"], {
    cwd,
    shell: true,
    stdio: "inherit",
  });
  return res.status ?? 1;
}

if (process.env.SKIP_NATIVE_CHECK === "1") {
  process.exit(0);
}

if (canLoadBetterSqlite3()) {
  process.exit(0);
}

// eslint-disable-next-line no-console
console.warn(
  `[ensure-better-sqlite3] better-sqlite3 did not load for Node ${process.version} — rebuilding…`
);

const code = rebuild();
if (!canLoadBetterSqlite3()) {
  // eslint-disable-next-line no-console
  console.error(
    "[ensure-better-sqlite3] Still failing after rebuild. Use one stable Node.js for this project,\n" +
      "then run:\n  npm run rebuild:native\n" +
      "Or switch Node versions: nvm-windows / fnm → `nvm use 20` (or 22), then reinstall:\n  rm -rf node_modules && npm install"
  );
  process.exit(code || 1);
}

// eslint-disable-next-line no-console
console.warn("[ensure-better-sqlite3] Rebuild OK — retrying load succeeded.");
