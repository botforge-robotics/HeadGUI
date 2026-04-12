#!/usr/bin/env node
/**
 * HeadGUI serial WebSocket bridge — run on the machine where USB is attached (e.g. Raspberry Pi).
 *
 * Usage:
 *   node serial-ws-bridge/index.mjs --serial /dev/ttyUSB0 [--listen 8765] [--host 0.0.0.0] [--token secret]
 *   node serial-ws-bridge/index.mjs --auto [--listen 8765]
 * Env: SERIAL_PORT, BRIDGE_LISTEN_PORT, BRIDGE_HOST, BRIDGE_TOKEN, BRIDGE_AUTO=1
 *
 * --auto: pick first serial port that looks like a Silicon Labs CP210x (VID 10C4, case-insensitive IDs).
 *
 * Parity with electron/serial.cjs: 115200 8N1, dtr/rts false, line-delimited.
 * Boot-drain: omit ESP/UART boot noise (same window as serial.cjs). Lines are not forwarded to WebSocket
 * until this period elapses after the serial port opens (not per WebSocket connect). Env BRIDGE_BOOT_DRAIN_MS.
 * One active WebSocket client; a new connection closes the previous. Firewall / trusted LAN is your responsibility.
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { WebSocketServer } from "ws";
import { URL } from "node:url";

function bootDrainMsFromEnv() {
  const n = Number(process.env.BRIDGE_BOOT_DRAIN_MS);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

/** Normalize USB id strings for case-insensitive compare (handles "0x10C4", "10c4", "10C4"). */
function normalizeUsbId(id) {
  if (id == null || id === "") return "";
  return String(id).trim().toLowerCase().replace(/^0x/i, "");
}

/** Silicon Labs CP210x UART: VID 10C4; match PID and/or manufacturer like electron/serial.cjs. */
const CP210X_VENDOR = "10c4";
/** Common CP210x product IDs (hex, no 0x). */
const CP210X_PRODUCT_IDS = new Set([
  "ea60",
  "ea61",
  "ea70",
  "ea71",
  "ea7a",
]);

function isCp210xPort(p) {
  const vid = normalizeUsbId(p.vendorId);
  if (vid !== CP210X_VENDOR) return false;
  const pid = normalizeUsbId(p.productId);
  if (pid && CP210X_PRODUCT_IDS.has(pid)) return true;
  const man = (p.manufacturer || "").toLowerCase();
  if (man.includes("cp210") || man.includes("silicon")) return true;
  return false;
}

async function pickCp210xPath() {
  const ports = await SerialPort.list();
  const matches = (ports || []).filter(isCp210xPort);
  if (matches.length === 0) {
    throw new Error(
      "No CP210x port found (expect Silicon Labs VID 10C4). Connect the device or pass --serial <path>.",
    );
  }
  matches.sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")));
  const chosen = matches[0];
  const pv = normalizeUsbId(chosen.vendorId);
  const pp = normalizeUsbId(chosen.productId);
  console.error(
    `serial-ws-bridge: --auto selected ${chosen.path} (vendor=${pv || "?"} product=${pp || "?"})`,
  );
  return chosen.path;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    serialPath: process.env.SERIAL_PORT || "",
    listen: Number(process.env.BRIDGE_LISTEN_PORT) || 8765,
    host: process.env.BRIDGE_HOST || "0.0.0.0",
    token: process.env.BRIDGE_TOKEN || "",
    help: false,
    auto: process.env.BRIDGE_AUTO === "1" || process.env.BRIDGE_AUTO === "true",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--serial" || a === "-s") out.serialPath = argv[++i] || "";
    else if (a === "--listen" || a === "-l") out.listen = Number(argv[++i]) || 8765;
    else if (a === "--host") out.host = argv[++i] || "0.0.0.0";
    else if (a === "--token" || a === "-t") out.token = argv[++i] || "";
    else if (a === "--auto" || a === "-a") out.auto = true;
    else if (a === "--help") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(
      "Usage: node serial-ws-bridge/index.mjs [--serial <path> | --auto] [--listen 8765] [--host 0.0.0.0] [--token <secret>]",
    );
    console.log(
      "Env: SERIAL_PORT, BRIDGE_LISTEN_PORT, BRIDGE_HOST, BRIDGE_TOKEN, BRIDGE_AUTO=1, BRIDGE_BOOT_DRAIN_MS",
    );
    process.exit(0);
  }

  let serialPath = (args.serialPath || "").trim();
  if (!serialPath && args.auto) {
    serialPath = await pickCp210xPath();
  }

  if (!serialPath) {
    console.error(
      "Missing device: pass --serial <path> or SERIAL_PORT, or use --auto to pick a CP210x (VID 10C4) port.",
    );
    process.exit(1);
  }

  const port = new SerialPort({
    path: serialPath,
    baudRate: 115200,
    autoOpen: false,
    dtr: false,
    rts: false,
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  const bootDrainMs = bootDrainMsFromEnv();
  let activeWs = null;
  /** Mirror electron/serial.cjs: false until boot-drain elapses — drop boot/log garbage, then forward lines. */
  let forwardSerial = false;

  function attachClient(ws) {
    if (activeWs && activeWs !== ws) {
      try {
        activeWs.close(4000, "replaced");
      } catch {
        /* ignore */
      }
    }
    activeWs = ws;

    ws.on("message", (raw) => {
      if (!port.isOpen) return;
      const data = typeof raw === "string" ? raw : raw.toString("utf8");
      port.write(data + "\n", (err) => {
        if (err) console.error("Serial write error:", err);
      });
    });

    ws.on("close", () => {
      if (activeWs === ws) activeWs = null;
    });

    ws.on("error", () => {
      if (activeWs === ws) activeWs = null;
    });
  }

  await new Promise((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });

  port.on("error", (err) => {
    console.error("Serial error:", err);
  });

  setTimeout(() => {
    forwardSerial = true;
  }, bootDrainMs);

  parser.on("data", (line) => {
    if (!forwardSerial || !activeWs || activeWs.readyState !== 1) return;
    const text = typeof line === "string" ? line.trim() : String(line).trim();
    if (!text) return;
    try {
      activeWs.send(text);
    } catch (e) {
      console.error("WebSocket send error:", e);
    }
  });

  const wss = new WebSocketServer({ host: args.host, port: args.listen });

  wss.on("connection", (ws, req) => {
    if (args.token) {
      let urlToken = null;
      try {
        const base = `http://${req.headers.host || "localhost"}`;
        const u = new URL(req.url || "/", base);
        urlToken = u.searchParams.get("token");
      } catch {
        /* ignore */
      }
      if (urlToken === args.token) {
        attachClient(ws);
        return;
      }
      const onFirstMessage = (raw) => {
        ws.off("message", onFirstMessage);
        try {
          const data = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
          if (data?.type === "auth" && data?.token === args.token) {
            attachClient(ws);
          } else {
            ws.close(4401, "unauthorized");
          }
        } catch {
          ws.close(4401, "unauthorized");
        }
      };
      ws.on("message", onFirstMessage);
    } else {
      attachClient(ws);
    }
  });

  wss.on("listening", () => {
    console.error(
      `serial-ws-bridge: serial=${serialPath} ws=ws://${args.host}:${args.listen}/ token=${args.token ? "on" : "off"} bootDrainMs=${bootDrainMs}`,
    );
  });

  wss.on("error", (err) => {
    console.error("WebSocket server error:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
