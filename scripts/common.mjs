import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const APPS_ROOT = join(REPO_ROOT, "apps");
export const DIST_ROOT = join(REPO_ROOT, "dist");
export const BUILD_MANIFEST = ".canvas-build.json";

const APP_NAME = /^[a-z0-9][a-z0-9-]*$/;

export async function entryKind(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return "symlink";
    if (info.isDirectory()) return "directory";
    if (info.isFile()) return "file";
    return "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

export function isWithin(root, candidate) {
  const value = relative(root, candidate);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function validateAppName(name) {
  if (!APP_NAME.test(name) || name.includes("..")) {
    throw new Error(`Invalid app name: ${name}`);
  }
  return name;
}

export async function discoverApps() {
  const entries = await readdir(APPS_ROOT, { withFileTypes: true });
  const apps = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    validateAppName(entry.name);
    const kind = await entryKind(join(APPS_ROOT, entry.name, "extension.mjs"));
    if (kind === "file") apps.push(entry.name);
  }
  return apps;
}

export async function selectApps(args) {
  const available = await discoverApps();
  if (args.length === 2 && args[0] === "--app") args = [args[1]];
  if (!args.length || (args.length === 1 && ["all", "--all"].includes(args[0]))) {
    return available;
  }
  if (args.length !== 1) throw new Error("Select one app or use --all.");
  const name = validateAppName(args[0]);
  if (!available.includes(name)) throw new Error(`Unknown app: ${name}`);
  return [name];
}

export async function ensureSafeDirectory(path) {
  const kind = await entryKind(path);
  if (kind === "symlink") throw new Error(`Refusing to use symlink: ${path}`);
  if (kind === "missing") await mkdir(path, { recursive: true });
  else if (kind !== "directory") throw new Error(`Expected a directory: ${path}`);
  await stat(path);
}

async function listSorted(path) {
  return (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function copyTree(sourceRoot, destinationRoot, { excludeRootArtifacts = false, excludeNames = [] } = {}) {
  await ensureSafeDirectory(destinationRoot);
  for (const entry of await listSorted(sourceRoot)) {
    if (excludeRootArtifacts && entry.name === "artifacts") continue;
    if (excludeNames.includes(entry.name)) continue;
    const source = join(sourceRoot, entry.name);
    const destination = join(destinationRoot, entry.name);
    const kind = await entryKind(source);
    if (kind === "symlink") throw new Error(`Source symlink is not allowed: ${source}`);
    if (kind === "directory") {
      await mkdir(destination);
      await copyTree(source, destination);
    } else if (kind === "file") {
      await copyFile(source, destination);
    } else {
      throw new Error(`Unsupported source entry: ${source}`);
    }
  }
}

export async function sourceFingerprint(appName) {
  const root = join(APPS_ROOT, appName);
  const hash = createHash("sha256");
  let fileCount = 0;

  async function visit(directory, prefix = "") {
    for (const entry of await listSorted(directory)) {
      if (!prefix && entry.name === "artifacts") continue;
      const source = join(directory, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const kind = await entryKind(source);
      if (kind === "symlink") throw new Error(`Source symlink is not allowed: ${source}`);
      if (kind === "directory") {
        await visit(source, rel);
      } else if (kind === "file") {
        hash.update(rel);
        hash.update("\0");
        hash.update(await readFile(source));
        hash.update("\0");
        fileCount++;
      } else {
        throw new Error(`Unsupported source entry: ${source}`);
      }
    }
  }

  await visit(root);
  return { fingerprint: hash.digest("hex"), fileCount };
}

export async function removeEntry(path) {
  const kind = await entryKind(path);
  if (kind === "missing") return;
  if (kind === "symlink" || kind === "file" || kind === "other") {
    await rm(path, { force: true });
    return;
  }
  for (const entry of await readdir(path)) await removeEntry(join(path, entry));
  await rm(path, { recursive: false });
}

function nearestExistingCandidate(path) {
  return (async () => {
    let existing = path;
    let kind = await entryKind(existing);
    while (kind === "missing") {
      existing = dirname(existing);
      kind = await entryKind(existing);
    }
    const actual = await realpath(existing);
    return resolve(actual, relative(existing, path));
  })();
}

export async function extensionRoot() {
  const configured = process.env.COPILOT_EXTENSIONS_DIR;
  const raw = configured === undefined ? join(homedir(), ".copilot", "extensions") : configured.trim();
  if (!raw) throw new Error("COPILOT_EXTENSIONS_DIR cannot be empty.");
  if (!isAbsolute(raw)) throw new Error("COPILOT_EXTENSIONS_DIR must be an absolute path.");

  const root = resolve(raw);
  if (root === REPO_ROOT || isWithin(REPO_ROOT, root)) {
    throw new Error("COPILOT_EXTENSIONS_DIR cannot be inside this repository.");
  }

  const projected = await nearestExistingCandidate(root);
  const realRepo = await realpath(REPO_ROOT);
  if (projected === realRepo || isWithin(realRepo, projected)) {
    throw new Error("COPILOT_EXTENSIONS_DIR resolves inside this repository.");
  }

  await ensureSafeDirectory(root);
  const actual = await realpath(root);
  if (actual !== projected || actual === realRepo || isWithin(realRepo, actual)) {
    throw new Error("COPILOT_EXTENSIONS_DIR resolved to an unsafe path.");
  }
  return root;
}
