import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildApps } from "../scripts/build.mjs";
import { publishApps } from "../scripts/publish.mjs";

test("triage state path follows a configured extension root", () => {
  const root = join(tmpdir(), "custom-canvas-extensions");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", 'import("./apps/triage-inbox/lib.mjs").then(m => process.stdout.write(m.STATE_PATH))'],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, COPILOT_EXTENSIONS_DIR: root },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, join(root, "triage-inbox", "artifacts", "state.json"));
});

test("publish updates an app but preserves runtime artifacts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-extensions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = join(root, "triage-inbox");
  const statePath = join(appRoot, "artifacts", "state.json");
  await mkdir(join(appRoot, "artifacts", "nested"), { recursive: true });
  await writeFile(statePath, '{"items":[{"id":"keep"}]}\n');
  await writeFile(join(appRoot, "artifacts", "nested", "keep.txt"), "keep\n");
  await writeFile(join(appRoot, "obsolete.txt"), "remove\n");

  await buildApps(["triage-inbox"]);
  const result = await publishApps(["triage-inbox"], root);

  assert.equal(result.root, await realpath(root));
  assert.match(await readFile(statePath, "utf8"), /"id":"keep"/);
  assert.equal(await readFile(join(appRoot, "artifacts", "nested", "keep.txt"), "utf8"), "keep\n");
  await assert.rejects(readFile(join(appRoot, "obsolete.txt"), "utf8"), { code: "ENOENT" });
  await assert.doesNotReject(readFile(join(appRoot, "extension.mjs"), "utf8"));
  await assert.rejects(readFile(join(appRoot, "artifacts", "state.json.build"), "utf8"), { code: "ENOENT" });
});
