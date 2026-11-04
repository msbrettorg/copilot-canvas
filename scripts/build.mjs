import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPS_ROOT,
  BUILD_MANIFEST,
  DIST_ROOT,
  copyTree,
  entryKind,
  selectApps,
  sourceFingerprint,
} from "./common.mjs";

export async function buildApps(appNames, { cleanAll = false } = {}) {
  const distKind = await entryKind(DIST_ROOT);
  if (distKind === "symlink") throw new Error(`Refusing to use symlink: ${DIST_ROOT}`);
  if (cleanAll) {
    await rm(DIST_ROOT, { recursive: true, force: true });
  }
  await mkdir(DIST_ROOT, { recursive: true });

  for (const appName of appNames) {
    const source = join(APPS_ROOT, appName);
    const destination = join(DIST_ROOT, appName);
    const staging = join(DIST_ROOT, `.${appName}.build-${process.pid}`);
    await rm(staging, { recursive: true, force: true });
    await copyTree(source, staging, { excludeRootArtifacts: true });
    const { fingerprint, fileCount } = await sourceFingerprint(appName);
    await writeFile(
      join(staging, BUILD_MANIFEST),
      `${JSON.stringify({ version: 1, app: appName, fingerprint, fileCount }, null, 2)}\n`,
    );
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
  }
  return appNames;
}

async function main() {
  const args = process.argv.slice(2);
  const apps = await selectApps(args);
  if (!apps.length) throw new Error("No apps found in apps/.");
  await buildApps(apps, { cleanAll: !args.length || (args.length === 1 && ["all", "--all"].includes(args[0])) });
  console.log(`Built: ${apps.join(", ")}`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
