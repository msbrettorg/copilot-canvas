// Triage Inbox -- Copilot canvas extension (user scope).
// Wiring only. Logic lives in lib.mjs. stdout is reserved for JSON-RPC.

import { createCanvas, CanvasError, joinSession } from "@github/copilot-sdk/extension";

import { BRIDGE_PATH, createTriage } from "./lib.mjs";
import { createWorkIqHostAdapter } from "./workiq.mjs";

let session;
const requireSession = () => {
  if (!session) throw new Error("The WorkIQ plugin is not ready");
  return session;
};
const workiq = createWorkIqHostAdapter({
  listTools: (params) => requireSession().rpc.mcp.apps.listTools(params),
  callTool: (params) => requireSession().rpc.mcp.apps.callTool(params),
  login: (params) => requireSession().rpc.mcp.oauth.login(params),
  bridgePath: BRIDGE_PATH,
});
const triage = createTriage({ workiq });
let sharedServerPromise = null;
const getSharedServer = () => {
  sharedServerPromise ??= triage.startServer().catch((err) => {
    sharedServerPromise = null;
    throw err;
  });
  return sharedServerPromise;
};

const wrap = (fn) => async (ctx) => {
  try {
    return await fn(ctx.input ?? {});
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    throw new CanvasError(error.code ?? "triage_error", error.message);
  }
};

const idSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", description: "Item id from get_items." } },
};

const itemSchema = {
  type: "object",
  required: ["source", "title"],
  properties: {
    id: { type: "string" },
    source: { enum: ["teams", "email", "calendar"] },
    title: { type: "string" },
    sender: { type: "string" },
    summary: { type: "string" },
    status: { enum: ["action", "fyi"] },
    recipientRole: {
      enum: ["mention", "to", "cc", "bcc"],
      description: "How the item addresses the user: @mention, To, CC, or BCC / distribution list.",
    },
    receivedAt: { type: "string" },
    rawId: { type: "string", description: "Graph message id or Teams chat id." },
    messageId: { type: "string" },
    eventId: { type: "string", description: "Calendar event id, cached after the first Accept or Decline." },
    chatId: { type: "string" },
    tenantId: { type: "string", description: "Microsoft Teams tenant id." },
    webLink: { type: "string" },
  },
};

const getItemsOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "items",
    "updatedAt",
    "calendarEvents",
    "agendaUpdatedAt",
    "agendaLoaded",
    "selectedItemId",
    "selectedItem",
  ],
  properties: {
    items: { type: "array", items: itemSchema },
    updatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    calendarEvents: { type: "array", items: { type: "object" } },
    agendaUpdatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    agendaLoaded: { type: "boolean" },
    selectedItemId: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "ID of the item currently open in the reading pane, or null.",
    },
    selectedItem: {
      anyOf: [itemSchema, { type: "null" }],
      description: "Snapshot of the item currently open in the reading pane, or null.",
    },
  },
};

session = await joinSession({
  enableMcpApps: true,
  canvases: [
    createCanvas({
      id: "triage-inbox",
      displayName: "Work Triage Inbox",
      description:
        "Unified Outlook email, Microsoft Teams, and calendar invite triage inbox with native-app/web Open, live Dismiss (mark as read), and Accept or Decline for meeting invites.",
      open: async (ctx) => {
        if (ctx.reason !== "rehydrate" && Array.isArray(ctx.input?.items)) {
          await triage.setItems(ctx.input.items);
        } else {
          await triage.getItems();
        }
        const entry = await getSharedServer();
        return { title: "Work Triage Inbox", url: entry.url };
      },
      onClose: async () => {},
      actions: [
        {
          name: "get_items",
          description: "Return current triage items, update times, agenda, and the selected reading-pane item.",
          outputSchema: getItemsOutputSchema,
          handler: wrap(() => triage.getItems()),
        },
        {
          name: "set_items",
          description: "Replace (default) or merge the triage items.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: { type: "array", items: itemSchema },
              mode: { enum: ["replace", "merge"] },
            },
          },
          handler: wrap((input) => triage.setItems(input.items, input.mode)),
        },
        {
          name: "dismiss_item",
          description: "Mark the item read in Outlook or Teams, then remove it from the list. A calendar invite stays pending on the calendar.",
          inputSchema: idSchema,
          handler: wrap((input) => triage.dismiss(input.id)),
        },
        {
          name: "delete_item",
          description: "Delete the item: move an Outlook message to Deleted Items, or mark a Teams chat read and hide it, then remove it from the list.",
          inputSchema: idSchema,
          handler: wrap((input) => triage.deleteItem(input.id)),
        },
        {
          name: "rsvp_item",
          description: "Accept, tentatively accept, or decline a calendar invite, send the response, mark the invite read, and remove it from the list.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["id", "response"],
            properties: {
              ...idSchema.properties,
              response: { enum: ["accept", "tentative", "decline"], description: "Response to send to the organizer." },
            },
          },
          handler: wrap((input) => triage.rsvp(input.id, input.response)),
        },
        {
          name: "open_item",
          description: "Open the item in the native Teams or Outlook app.",
          inputSchema: {
            ...idSchema,
            properties: {
              ...idSchema.properties,
              target: { enum: ["native", "web"], description: "Open in the native app or on the web. Default native." },
              dryRun: { type: "boolean", description: "Return the URL without opening it." },
            },
          },
          handler: wrap((input) => triage.open(input.id, input)),
        },
        {
          name: "refresh",
          description: "Pull unread human email and Teams chats from Microsoft 365 through WorkIQ.",
          handler: wrap(() => triage.refresh()),
        },
      ],
    }),
  ],
});

await getSharedServer().catch(() => {});
await session.log("Triage Inbox extension ready");
