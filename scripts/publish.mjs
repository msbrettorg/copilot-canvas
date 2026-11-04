import { copyFile, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILD_MANIFEST,
  DIST_ROOT,
  entryKind,
  extensionRoot,
  removeEntry,
  selectApps,
  sourceFingerprint,
} from "./common.mjs";

async function verifyBuild(appName) {
  const root = join(DIST_ROOT, appName);
  if ((await entryKind(root)) !== "directory") {
    throw new Error(`Build is missing for ${appName}. Run "npm run build -- ${appName}".`);
  }
  const entry = join(root, "extension.mjs");
  if ((await entryKind(entry)) !== "file") throw new Error(`Build is incomplete for ${appName}: extension.mjs is missing.`);

  const marker = join(root, BUILD_MANIFEST);
  if ((await entryKind(marker)) !== "file") {
    throw new Error(`Build is incomplete for ${appName}: completion marker is missing.`);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(marker, "utf8"));
  } catch {
    throw new Error(`Build manifest is invalid for ${appName}.`);
  }
  const source = await sourceFingerprint(appName);
  if (manifest.app !== appName || manifest.version !== 1 || manifest.fingerprint !== source.fingerprint) {
    throw new Error(`Build is stale for ${appName}. Run "npm run build -- ${appName}".`);
  }
}

async function syncDirectory(sourceRoot, destinationRoot, atAppRoot = true) {
  const sourceNames = new Set((await readdir(sourceRoot)).filter((name) => name !== BUILD_MANIFEST));
  for (const entry of await readdir(destinationRoot)) {
    if (atAppRoot && entry === "artifacts") continue;
    if (!sourceNames.has(entry)) await removeEntry(join(destinationRoot, entry));
  }

  for (const name of [...sourceNames].sort()) {
    const source = join(sourceRoot, name);
    const destination = join(destinationRoot, name);
    const sourceKind = await entryKind(source);
    const destinationKind = await entryKind(destination);
    if (sourceKind === "symlink") throw new Error(`Built app contains a symlink: ${source}`);
    if (destinationKind === "symlink") throw new Error(`Installed app contains a symlink: ${destination}`);

    if (sourceKind === "directory") {
      if (destinationKind === "file" || destinationKind === "other") await removeEntry(destination);
      await mkdir(destination, { recursive: true });
      await syncDirectory(source, destination, false);
    } else if (sourceKind === "file") {
      if (destinationKind === "directory" || destinationKind === "other") await removeEntry(destination);
      await copyFile(source, destination);
    } else {
      throw new Error(`Unsupported build entry: ${source}`);
    }
  }
}

async function publishApp(appName, root) {
  await verifyBuild(appName);
  const destination = join(root, appName);
  const kind = await entryKind(destination);
  if (kind === "symlink") throw new Error(`Refusing to publish through symlink: ${destination}`);
  if (kind === "missing") await mkdir(destination);
  else if (kind !== "directory") throw new Error(`Publish target is not a directory: ${destination}`);

  const artifacts = join(destination, "artifacts");
  const artifactsKind = await entryKind(artifacts);
  if (artifactsKind === "symlink") throw new Error(`Runtime artifacts path is a symlink: ${artifacts}`);
  if (!["missing", "directory"].includes(artifactsKind)) {
    throw new Error(`Runtime artifacts path is not a directory: ${artifacts}`);
  }

  await syncDirectory(join(DIST_ROOT, appName), destination);
}

export async function publishApps(appNames, root) {
  const selectedRoot = root ?? await extensionRoot();
  const actualRoot = await realpath(selectedRoot);
  for (const appName of appNames) await publishApp(appName, actualRoot);
  return { apps: appNames, root: actualRoot };
}

async function main() {
  const apps = await selectApps(process.argv.slice(2));
  if (!apps.length) throw new Error("No apps found in apps/.");
  const result = await publishApps(apps);
  console.log(`Published ${result.apps.join(", ")} to ${result.root}`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(`Publish failed: ${error.message}`);
    process.exitCode = 1;
  });
}
