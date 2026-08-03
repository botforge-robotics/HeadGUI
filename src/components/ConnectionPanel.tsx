import { useState, useEffect, useRef } from "react";
import { useRobotStore } from "../store/robotStore";
import type { SerialPort } from "../types";
import {
  RefreshCw,
  Cable,
  Wifi,
  CheckCircle2,
  ChevronDown,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/** Web Serial port handle for browser: read loop and close on disconnect */
interface WebSerialPortHandle {
  port: { readable: ReadableStream<Uint8Array>; close(): Promise<void> };
  writer: WritableStreamDefaultWriter<Uint8Array>;
}

type BrowserLinkMode = "usb" | "wireless";

export default function ConnectionPanel() {
  const { isConnected, setConnected } = useRobotStore();
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<BrowserLinkMode>("usb");
  const [wirelessHost, setWirelessHost] = useState("");
  const [wirelessPort, setWirelessPort] = useState("8765");
  const [wirelessToken, setWirelessToken] = useState("");
  const webSerialRef = useRef<WebSerialPortHandle | null>(null);
  const wirelessWsRef = useRef<WebSocket | null>(null);

  const handleWirelessDisconnect = () => {
    const ws = wirelessWsRef.current;
    wirelessWsRef.current = null;
    window.__webSerialSend = undefined;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    setConnected(false);
  };

  const openWebSerialPort = async (port: {
    open: (opts: { baudRate: number }) => Promise<void>;
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close(): Promise<void>;
  }) => {
    await port.open({ baudRate: 115200 });
    const writer = port.writable.getWriter();
    window.__webSerialSend = (data: string) => {
      writer.write(new TextEncoder().encode(data)).catch(() => {});
    };
    webSerialRef.current = { port, writer };
    setConnected(true);

    (async () => {
      const handle = webSerialRef.current;
      if (!handle?.port.readable) return;
      const reader = handle.port.readable.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) {
            useRobotStore.getState().handleSerialData(decoder.decode(value));
          }
        }
      } catch {
        // Port closed or disconnected
      } finally {
        reader.releaseLock();
        if (webSerialRef.current?.port === port) {
          webSerialRef.current = null;
          window.__webSerialSend = undefined;
          setConnected(false);
        }
      }
    })();

    setTimeout(() => {
      const send = window.__webSerialSend;
      if (send) send("STATUS\n");
    }, 2500);
  };

  const refreshPorts = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setListError(null);
    try {
      const { ports: availablePorts, error } =
        await window.electronAPI.serial.listPorts();
      setPorts(availablePorts ?? []);
      if (error) setListError(error);
      if ((availablePorts?.length ?? 0) > 0 && !selectedPort) {
        setSelectedPort(availablePorts[0].path);
      }
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  useEffect(() => {
    let cancelled = false;
    refreshPorts();
    if (window.electronAPI) {
      window.electronAPI.serial.onStatus((status) => {
        setConnected(status.connected);
        setLoading(false);
        if (status.connected) {
          setTimeout(() => {
            const send = window.electronAPI?.serial?.send;
            if (send) send("STATUS\n");
          }, 2500);
        }
      });
      window.electronAPI.serial.onData((data: string) => {
        useRobotStore.getState().handleSerialData(data);
      });
    } else {
      const nav = navigator as unknown as {
        serial?: {
          getPorts?: () => Promise<
            Array<{
              open: (opts: { baudRate: number }) => Promise<void>;
              readable: ReadableStream<Uint8Array>;
              writable: WritableStream<Uint8Array>;
              close(): Promise<void>;
            }>
          >;
        };
      };
      nav.serial
        ?.getPorts?.()
        .then(async (ports) => {
          if (cancelled) return;
          if (
            ports.length > 0 &&
            !webSerialRef.current &&
            linkMode === "usb"
          ) {
            try {
              await openWebSerialPort(ports[0]);
            } catch {
              try {
                await ports[0].close();
              } catch {
                /* ignore */
              }
              setConnected(false);
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [setConnected, linkMode]);

  useEffect(() => {
    return () => {
      const ws = wirelessWsRef.current;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        wirelessWsRef.current = null;
      }
      window.__webSerialSend = undefined;
    };
  }, []);

  const handleWebSerialDisconnect = async () => {
    const handle = webSerialRef.current;
    webSerialRef.current = null;
    window.__webSerialSend = undefined;
    if (handle) {
      try {
        await handle.writer.releaseLock();
        await handle.port.close();
      } catch {
        // Ignore if already closed
      }
    }
    setConnected(false);
  };

  const selectLinkMode = (mode: BrowserLinkMode) => {
    if (mode === linkMode) return;
    if (isConnected) {
      if (linkMode === "usb") void handleWebSerialDisconnect();
      else handleWirelessDisconnect();
    }
    setLinkMode(mode);
  };

  const handleWirelessConnect = async () => {
    setListError(null);
    await handleWebSerialDisconnect();
    handleWirelessDisconnect();
    const host = wirelessHost.trim();
    const portNum = parseInt(wirelessPort.trim(), 10) || 8765;
    if (!host) {
      setListError("Enter the bridge host or IP address.");
      return;
    }
    setLoading(true);
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = wirelessToken.trim();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${proto}//${host}:${portNum}${qs}`;
    const ws = new WebSocket(url);
    wirelessWsRef.current = ws;
    ws.onopen = () => {
      window.__webSerialSend = (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      };
      setConnected(true);
      setLoading(false);
      setTimeout(() => {
        window.__webSerialSend?.("STATUS\n");
      }, 2500);
    };
    ws.onmessage = (ev) => {
      useRobotStore.getState().handleSerialData(String(ev.data));
    };
    ws.onerror = () => {
      setListError("WebSocket connection failed.");
      setLoading(false);
    };
    ws.onclose = () => {
      wirelessWsRef.current = null;
      window.__webSerialSend = undefined;
      setConnected(false);
      setLoading(false);
    };
  };

  const handleWebSerialConnect = async () => {
    handleWirelessDisconnect();
    await handleWebSerialDisconnect();
    const nav = navigator as unknown as {
      serial?: {
        requestPort: () => Promise<{
          open: (opts: { baudRate: number }) => Promise<void>;
          readable: ReadableStream<Uint8Array>;
          writable: WritableStream<Uint8Array>;
          close(): Promise<void>;
        }>;
      };
    };
    if (!nav.serial) {
      setListError(
        "Web Serial not supported. Use Chrome or run the desktop app (npm run electron:dev).",
      );
      return;
    }
    setLoading(true);
    setListError(null);
    try {
      const port = await nav.serial.requestPort();
      await openWebSerialPort(port);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("failed to open")) {
        setListError(
          "Port busy — close Arduino IDE, PuTTY, or any other app using this port, then try again.",
        );
      } else {
        setListError(msg || "Failed to open USB port.");
      }
      webSerialRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (window.electronAPI) {
      if (!selectedPort) return;
      setLoading(true);
      if (isConnected) {
        await window.electronAPI.serial.disconnect();
      } else {
        await window.electronAPI.serial.connect(selectedPort);
      }
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <div className="relative z-50">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-3 pl-2 pr-4 py-2 rounded-xl border backdrop-blur-md transition-all duration-300 ${
          isConnected
            ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_2px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.35)]"
            : "btn-glass"
        }`}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${isConnected ? "bg-emerald-500 text-white shadow-inner" : "bg-zinc-700 text-zinc-300 group-hover:bg-zinc-600 group-hover:text-white"}`}
        >
          {isConnected ? <CheckCircle2 size={16} /> : <Cable size={16} />}
        </div>

        <div className="flex flex-col items-start text-left leading-none">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">
            System Status
          </span>
          <span
            className={`text-sm font-semibold ${isConnected ? "text-emerald-400" : "text-zinc-300"}`}
          >
            {isConnected ? "Online" : "Offline"}
          </span>
        </div>

        <ChevronDown
          size={14}
          className={`ml-2 text-zinc-500 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute top-full right-0 mt-3 w-80 bg-zinc-900 border border-zinc-600 rounded-xl shadow-2xl p-4 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-700">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Connection Settings
              </h3>
              {window.electronAPI && (
                <button
                  onClick={refreshPorts}
                  className={`p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-white transition-colors ${loading ? "animate-spin" : ""}`}
                  title="Refresh ports"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="space-y-4">
              {window.electronAPI && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 ml-1">
                    SERIAL PORT
                  </label>
                  <div className="relative">
                    <select
                      value={selectedPort}
                      onChange={(e) => setSelectedPort(e.target.value)}
                      disabled={isConnected}
                      className="w-full appearance-none bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50 transition-colors"
                    >
                      {ports.map((port) => (
                        <option key={port.path} value={port.path}>
                          {port.path}{" "}
                          {port.manufacturer ? `— ${port.manufacturer}` : ""}
                        </option>
                      ))}
                      {ports.length === 0 && (
                        <option value="">No ports detected</option>
                      )}
                    </select>
                    {listError && (
                      <p className="mt-1.5 text-xs text-amber-500/90">
                        {listError.includes("Permission") ||
                        listError.includes("EACCES") ||
                        listError.includes("access")
                          ? "Permission denied. On Linux, add your user to the dialout group: sudo usermod -aG dialout $USER, then log out and back in."
                          : listError}
                      </p>
                    )}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>
              )}

              {window.electronAPI ? (
                <button
                  onClick={handleConnect}
                  disabled={!selectedPort || loading}
                  className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isConnected ? "btn-danger" : "btn-primary"}`}
                  title={isConnected ? "Disconnect" : "Connect serial"}
                >
                  {loading ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : isConnected ? (
                    <XCircle size={16} />
                  ) : (
                    <Cable size={16} />
                  )}
                  {loading
                    ? "Connecting..."
                    : isConnected
                      ? "Disconnect"
                      : "Connect to Device"}
                </button>
              ) : (
                <>
                  <div className="flex rounded-xl border border-white/5 p-0.5 bg-zinc-950/80 gap-0.5">
                    <button
                      type="button"
                      onClick={() => selectLinkMode("usb")}
                      disabled={loading}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        linkMode === "usb"
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      USB
                    </button>
                    <button
                      type="button"
                      onClick={() => selectLinkMode("wireless")}
                      disabled={loading}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                        linkMode === "wireless"
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Wifi size={12} />
                      Wireless
                    </button>
                  </div>

                  {linkMode === "usb" && (
                    <>
                      {!(
                        navigator as unknown as { serial?: unknown }
                      ).serial ? (
                        <p className="text-xs text-zinc-500">
                          Web Serial not available. Use Chrome or run the
                          desktop app.
                        </p>
                      ) : isConnected ? (
                        <button
                          onClick={() => void handleWebSerialDisconnect()}
                          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 btn-danger"
                          title="Disconnect"
                        >
                          <XCircle size={16} /> Disconnect USB
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleWebSerialConnect()}
                          disabled={loading}
                          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 btn-primary"
                          title="Connect USB"
                        >
                          {loading ? (
                            <RefreshCw size={16} className="animate-spin" />
                          ) : (
                            <Cable size={16} />
                          )}
                          {loading ? "Opening..." : "Select USB (Chrome)"}
                        </button>
                      )}
                    </>
                  )}

                  {linkMode === "wireless" && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-500 ml-1">
                        BRIDGE HOST
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 192.168.1.10"
                        value={wirelessHost}
                        onChange={(e) => setWirelessHost(e.target.value)}
                        disabled={isConnected}
                        className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                      <label className="text-xs font-medium text-zinc-500 ml-1">
                        PORT
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="8765"
                        value={wirelessPort}
                        onChange={(e) => setWirelessPort(e.target.value)}
                        disabled={isConnected}
                        className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                      <label className="text-xs font-medium text-zinc-500 ml-1">
                        TOKEN (OPTIONAL)
                      </label>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder="If bridge uses --token"
                        value={wirelessToken}
                        onChange={(e) => setWirelessToken(e.target.value)}
                        disabled={isConnected}
                        className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                      {isConnected ? (
                        <button
                          type="button"
                          onClick={handleWirelessDisconnect}
                          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 btn-danger"
                          title="Disconnect wireless"
                        >
                          <XCircle size={16} /> Disconnect wireless
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleWirelessConnect()}
                          disabled={loading || !wirelessHost.trim()}
                          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-primary"
                          title="Connect to bridge"
                        >
                          {loading ? (
                            <RefreshCw size={16} className="animate-spin" />
                          ) : (
                            <Wifi size={16} />
                          )}
                          {loading ? "Connecting..." : "Connect wireless"}
                        </button>
                      )}
                    </div>
                  )}

                  {listError && (
                    <p className="text-xs text-amber-500/90">{listError}</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Wifi size={12} />
                <span>Wireless Link</span>
              </div>
              <span className="text-[10px] font-mono bg-white/5 text-zinc-400 px-1.5 py-0.5 rounded">
                v1.0.0
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
