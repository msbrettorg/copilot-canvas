import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { APPS_ROOT, REPO_ROOT, discoverApps } from "./common.mjs";
import { extractEmailBlocks, openUrlFor, resolveChatPreview } from "../apps/triage-inbox/lib.mjs";
import { unwrapWorkIqResult } from "../apps/triage-inbox/workiq.mjs";
import { SEED_ITEMS } from "../apps/triage-inbox/seed.mjs";

const LEAK_PATTERN = /@microsoft\.?com|AAMk|19:[^"'\s]+@thread|\/Users\//i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const apps = await discoverApps();
assert(apps.includes("triage-inbox"), "triage-inbox was not discovered.");
assert(
  apps.length === 1 && apps[0] === "triage-inbox",
  "Only triage-inbox should remain in the app registry.",
);
assert(
  openUrlFor({ source: "teams", chatId: "chat/id" }) ===
    "msteams://teams.microsoft.com/l/chat/chat%2Fid/0",
  "Native Teams URL changed.",
);
assert(
  openUrlFor({ source: "email", messageId: "message/id+part==" }) ===
    "ms-outlook://emails/message/message-id_part==?account=alex.morgan%40contoso.com",
  "Native Outlook URL changed.",
);
assert(
  resolveChatPreview([
    {
      body: { content: "[attachment]" },
      from: { user: { displayName: "Sample User" } },
      attachments: [{ content: { body: [{ text: "Attachment preview text" }] } }],
    },
  ])?.body === "Attachment preview text",
  "Attachment preview resolution changed.",
);
assert(
  new Set(SEED_ITEMS.map((item) => item.recipientRole)).size === 4,
  "Seed data does not cover all recipient roles.",
);
assert(
  SEED_ITEMS.every((item) => !LEAK_PATTERN.test(JSON.stringify(item))),
  "Seed data contains live or personal values.",
);

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
  .split("\0")
  .filter((file) => file && file !== "scripts/check.mjs");
for (const file of tracked) {
  const text = await readFile(join(REPO_ROOT, file), "utf8");
  assert(!LEAK_PATTERN.test(text), `${file} contains live or personal values.`);
}

const extension = await readFile(join(APPS_ROOT, "triage-inbox", "extension.mjs"), "utf8");
assert(
  extension.includes(".rpc.mcp.apps.listTools") &&
    extension.includes(".rpc.mcp.apps.callTool"),
  "Triage Inbox does not use the host WorkIQ MCP Apps RPC.",
);
assert(
  unwrapWorkIqResult(
    { structuredContent: { results: [{ statusCode: 200, data: { id: "sample" } }] } },
    "test",
  )
    .results?.[0]?.statusCode === 200,
  "Triage Inbox cannot read the host WorkIQ result.",
);
for (const action of ["get_items", "set_items", "dismiss_item", "open_item", "refresh", "rsvp_item"]) {
  assert(extension.includes(`name: "${action}"`), `Missing canvas action: ${action}`);
}
assert(!/name:\s*"reply"/.test(extension), "Reply must not be exposed as an agent canvas action.");
const blocks = extractEmailBlocks(
  '<head><style>.hidden{display:none}</style></head><p>Hello <a href="https://example.com/path">Example</a></p><script>alert(1)</script><img src="pixel.gif" width="1" height="1">',
);
assert(blocks.some((block) => block.text === "Hello Example" && block.links?.[0]?.href === "https://example.com/path"), "Email block extraction changed.");
assert(!JSON.stringify(blocks).includes("alert(1)"), "Email sanitizer retained script content.");
const triageCore = await readFile(join(APPS_ROOT, "triage-inbox", "lib.mjs"), "utf8");
const triageWorkIq = await readFile(join(APPS_ROOT, "triage-inbox", "workiq.mjs"), "utf8");
assert(!/127\.0\.0\.1:8080|GatewayExecute/.test(`${triageCore}\n${triageWorkIq}`), "Triage Inbox still depends on Maenifold.");

console.log(`Checked ${apps.length} app(s) and core triage-inbox behavior.`);
