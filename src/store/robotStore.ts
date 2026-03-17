import { create } from "zustand";
import type {
  RobotOrientation,
  Timeline,
  TimelineItem,
  SavedPose,
} from "../types";
import { clampOrientation } from "../robotLimits";

/** Treat legacy items without .type as pose */
function asTimelineItem(item: any): TimelineItem {
  if (item.type === "delay") return item as TimelineItem;
  if (item.type === "setspeed") return item as TimelineItem;
  return {
    id: item.id,
    type: "pose",
    orientation: item.orientation ?? { roll: 0, pitch: 0, yaw: 0 },
    durationMs: item.durationMs ?? 1000,
  };
}

const DEBUG_SERIAL_DONE = true;

/** Extract one complete JSON object from the start of string (handles concatenated JSON). */
function extractOneJson(str: string): { obj: unknown; rest: string } | null {
  const trimmed = str.trimStart();
  if (trimmed[0] !== "{") return null;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") depth++;
    else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(trimmed.slice(0, i + 1));
          return { obj, rest: trimmed.slice(i + 1).trimStart() };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Wait for "done" via store (browser Web Serial path; handleSerialData resolves this). */
function waitForDoneSignal(
  set: (s: Partial<RobotState>) => void,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      set({ pendingDoneResolver: null });
      reject(new Error("Serial done timeout"));
    }, timeoutMs);
    set({
      pendingDoneResolver: () => {
        clearTimeout(t);
        set({ pendingDoneResolver: null });
        resolve();
      },
    });
  });
}

/** Wait for firmware to send {"event":"done"} over serial (after RPY move). */
function waitForSerialDone(
  serial: { onData: (cb: (data: string) => void) => void },
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    if (DEBUG_SERIAL_DONE)
      console.log(
        '[Timeline] waitForSerialDone: waiting for {"event":"done"} (timeout',
        timeoutMs,
        "ms)",
      );
    const t = setTimeout(() => {
      if (DEBUG_SERIAL_DONE)
        console.log(
          "[Timeline] waitForSerialDone: TIMEOUT - no done event received",
        );
      serial.onData(() => {});
      reject(new Error("Serial done timeout"));
    }, timeoutMs);
    serial.onData((data: string) => {
      if (DEBUG_SERIAL_DONE && data.trim())
        console.log(
          "[Timeline] serial data received:",
          JSON.stringify(data.substring(0, 100)),
        );
      buffer += data;
      while (buffer) {
        const result = extractOneJson(buffer);
        if (!result) {
          // Skip non-JSON content (e.g. "HOMING_DONE\n") so we can parse {"event":"done"}
          const braceIdx = buffer.indexOf("{");
          if (braceIdx >= 0) buffer = buffer.slice(braceIdx);
          else break;
          continue;
        }
        buffer = result.rest;
        const obj = result.obj as { event?: string };
        if (DEBUG_SERIAL_DONE && obj?.event)
          console.log("[Timeline] serial event:", obj.event);
        if (obj && obj.event === "done") {
          if (DEBUG_SERIAL_DONE)
            console.log(
              "[Timeline] waitForSerialDone: got done, advancing to next frame",
            );
          clearTimeout(t);
          serial.onData(() => {});
          resolve();
          return;
        }
      }
    });
  });
}

// NOTE: limits + clampOrientation live in ../robotLimits so sliders/gizmo/store stay in sync.

interface RobotState {
  // Orientation state
  targetOrientation: RobotOrientation;
  currentOrientation: RobotOrientation;
  setTargetOrientation: (orientation: RobotOrientation) => void;
  /** Update RPY from robot status (no serial send). Use when receiving STATUS response. */
  setTargetOrientationFromRobot: (orientation: RobotOrientation) => void;
  /** Handle incoming serial line data: parse status JSON or request STATUS on done/HOMING_DONE. */
  handleSerialData: (data: string) => void;

  // Saved poses (individual)
  savedPositions: SavedPose[];
  addSavedPosition: (name?: string) => void;
  removeSavedPosition: (id: string) => void;
  applySavedPosition: (id: string) => void;

  // Timeline / sequences state
  timelines: Timeline[];
  activeTimeline: Timeline | null;
  isPlaying: boolean;
  setActiveTimeline: (timeline: Timeline | null) => void;
  /** Create a new empty timeline and set it active (keeps existing sequences). */
  createNewTimeline: () => void;
  addKeyframe: () => void;
  removeKeyframe: (id: string) => void;
  playTimeline: () => void;
  stopPlayback: () => void;

  // Hardware state
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  sendHome: () => void;
  sendCurrentRpy: () => void;

  // Camera reset (increment to remount viewer)
  cameraResetTrigger: number;
  requestCameraReset: () => void;

  // 3D gizmo dragging (lock orbit when interacting)
  isGizmoDragging: boolean;
  setGizmoDragging: (v: boolean) => void;

  // Playback
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  /** Index of timeline item currently playing (null when stopped). */
  playbackActiveIndex: number | null;
  /** 0..1 progress during a delay item (for UI progress bar). */
  playbackDelayProgress: number;

  // Timeline as sequence: save with name, delete, rename
  saveTimelineAs: (name: string) => void;
  deleteTimeline: (id: string) => void;
  updateTimelineName: (id: string, name: string) => void;
  setTimelineLoop: (id: string, loop: boolean) => void;
  addDelay: (durationMs?: number) => void;
  addSetSpeed: (speedPercent?: number) => void;
  updateDelayItem: (id: string, durationMs: number) => void;
  updateSetSpeedItem: (id: string, speedPercent: number) => void;
  reorderTimelineItems: (fromIndex: number, toIndex: number) => void;

  // Config JSON persistence (positions + sequences; transferable to another PC)
  loadConfig: () => Promise<void>;
  persistConfig: () => void;

  /** Buffer for incomplete serial lines (internal). */
  serialLineBuffer: string;
  /** Resolver for browser Web Serial "done" wait (internal). */
  pendingDoneResolver: (() => void) | null;
}

export const useRobotStore = create<RobotState>((set, get) => ({
  // Initial state
  targetOrientation: { roll: 0, pitch: 0, yaw: 0 },
  currentOrientation: { roll: 0, pitch: 0, yaw: 0 },
  savedPositions: [],
  timelines: [],
  activeTimeline: null,
  isPlaying: false,
  isConnected: false,
  cameraResetTrigger: 0,
  playbackSpeed: 50,
  isGizmoDragging: false,
  serialLineBuffer: "",
  playbackActiveIndex: null,
  playbackDelayProgress: 0,
  pendingDoneResolver: null,

  requestCameraReset: () =>
    set((s) => ({ cameraResetTrigger: s.cameraResetTrigger + 1 })),
  setGizmoDragging: (v) => set({ isGizmoDragging: v }),
  setPlaybackSpeed: (speed) => {
    const percent = Math.round(Math.max(5, Math.min(100, speed)));
    set({ playbackSpeed: percent });
    if (get().isConnected && typeof window !== "undefined") {
      const send = window.electronAPI?.serial?.send ?? window.__webSerialSend;
      if (send) send(`SPEED ${percent}\n`);
    }
  },

  addDelay: (durationMs = 500) => {
    const { activeTimeline } = get();
    const newItem: TimelineItem = {
      id: Date.now().toString(),
      type: "delay",
      durationMs,
    };
    if (!activeTimeline) {
      const newTimeline: Timeline = {
        id: Date.now().toString(),
        name: "New Sequence",
        items: [newItem],
      };
      set({ activeTimeline: newTimeline });
    } else {
      const updated = {
        ...activeTimeline,
        items: [...activeTimeline.items, newItem],
      };
      set({
        activeTimeline: updated,
        timelines: get().timelines.map((t) =>
          t.id === updated.id ? updated : t,
        ),
      });
    }
    get().persistConfig();
  },

  addSetSpeed: (speedPercent) => {
    const { activeTimeline, playbackSpeed } = get();
    const percent = Math.round(
      Math.max(5, Math.min(100, speedPercent ?? playbackSpeed)),
    );
    const newItem: TimelineItem = {
      id: Date.now().toString(),
      type: "setspeed",
      speedPercent: percent,
    };
    if (!activeTimeline) {
      const newTimeline: Timeline = {
        id: Date.now().toString(),
        name: "New Sequence",
        items: [newItem],
      };
      set({ activeTimeline: newTimeline });
    } else {
      const updated = {
        ...activeTimeline,
        items: [...activeTimeline.items, newItem],
      };
      set({
        activeTimeline: updated,
        timelines: get().timelines.map((t) =>
          t.id === updated.id ? updated : t,
        ),
      });
    }
    get().persistConfig();
  },

  updateDelayItem: (id, durationMs) => {
    const { activeTimeline } = get();
    if (!activeTimeline) return;
    const ms = Math.max(0, Math.min(60000, durationMs));
    const items = activeTimeline.items.map((it) =>
      it.id === id && it.type === "delay" ? { ...it, durationMs: ms } : it,
    );
    const updated = { ...activeTimeline, items };
    set({
      activeTimeline: updated,
      timelines: get().timelines.map((t) =>
        t.id === updated.id ? updated : t,
      ),
    });
    get().persistConfig();
  },

  updateSetSpeedItem: (id, speedPercent) => {
    const { activeTimeline } = get();
    if (!activeTimeline) return;
    const percent = Math.round(Math.max(5, Math.min(100, speedPercent)));
    const items = activeTimeline.items.map((it) =>
      it.id === id && it.type === "setspeed"
        ? { ...it, speedPercent: percent }
        : it,
    );
    const updated = { ...activeTimeline, items };
    set({
      activeTimeline: updated,
      timelines: get().timelines.map((t) =>
        t.id === updated.id ? updated : t,
      ),
    });
    get().persistConfig();
  },

  reorderTimelineItems: (fromIndex, toIndex) => {
    const { activeTimeline } = get();
    if (!activeTimeline || fromIndex === toIndex) return;
    const items = [...activeTimeline.items];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    const updated = { ...activeTimeline, items };
    set({
      activeTimeline: updated,
      timelines: get().timelines.map((t) =>
        t.id === updated.id ? updated : t,
      ),
    });
    get().persistConfig();
  },

  saveTimelineAs: (name) => {
    const { activeTimeline, timelines } = get();
    if (!activeTimeline || !name.trim()) return;
    const newTimeline: Timeline = {
      ...activeTimeline,
      id: Date.now().toString(),
      name: name.trim(),
      loop: activeTimeline.loop === true,
      items: activeTimeline.items.map((i) => {
        const normalized = asTimelineItem(i);
        return { ...normalized, id: Date.now().toString() + Math.random() };
      }),
    };
    set({ timelines: [...timelines, newTimeline] });
    get().persistConfig();
  },

  deleteTimeline: (id) => {
    const { timelines, activeTimeline } = get();
    set({
      timelines: timelines.filter((t) => t.id !== id),
      activeTimeline: activeTimeline?.id === id ? null : activeTimeline,
    });
    get().persistConfig();
  },

  updateTimelineName: (id, name) => {
    if (!name.trim()) return;
    set({
      timelines: get().timelines.map((t) =>
        t.id === id ? { ...t, name: name.trim() } : t,
      ),
      activeTimeline:
        get().activeTimeline?.id === id
          ? { ...get().activeTimeline!, name: name.trim() }
          : get().activeTimeline,
    });
    get().persistConfig();
  },

  setTimelineLoop: (id, loop) => {
    set({
      timelines: get().timelines.map((t) => (t.id === id ? { ...t, loop } : t)),
      activeTimeline:
        get().activeTimeline?.id === id
          ? { ...get().activeTimeline!, loop }
          : get().activeTimeline,
    });
    get().persistConfig();
  },

  addSavedPosition: (name) => {
    const { targetOrientation, savedPositions } = get();
    const newPose: SavedPose = {
      id: Date.now().toString(),
      name: name || `Pose ${savedPositions.length + 1}`,
      orientation: { ...targetOrientation },
      createdAt: Date.now(),
    };
    set({ savedPositions: [...savedPositions, newPose] });
    get().persistConfig();
  },

  removeSavedPosition: (id) => {
    set({ savedPositions: get().savedPositions.filter((p) => p.id !== id) });
    get().persistConfig();
  },

  applySavedPosition: (id) => {
    const pose = get().savedPositions.find((p) => p.id === id);
    if (pose) {
      get().setTargetOrientation(clampOrientation(pose.orientation));
      get().sendCurrentRpy();
    }
  },

  // Actions
  setTargetOrientation: (orientation) => {
    const clamped = clampOrientation(orientation);
    set({ targetOrientation: clamped });
    // Do not send to hardware here; use Goto button or timeline/apply to send RPY
  },

  setTargetOrientationFromRobot: (orientation) => {
    const clamped = clampOrientation(orientation);
    set({ targetOrientation: clamped, currentOrientation: clamped });
  },

  handleSerialData: (data) => {
    const state = get();
    let buffer = (state.serialLineBuffer + data).trimStart();
    const send =
      typeof window !== "undefined"
        ? (window.electronAPI?.serial?.send ?? window.__webSerialSend)
        : null;

    while (buffer && buffer[0] === "{") {
      const result = extractOneJson(buffer);
      if (!result) break;
      buffer = result.rest;
      const obj = result.obj as Record<string, unknown>;
      if (
        obj &&
        typeof obj.roll === "number" &&
        typeof obj.pitch === "number" &&
        typeof obj.yaw === "number"
      ) {
        get().setTargetOrientationFromRobot({
          roll: obj.roll,
          pitch: obj.pitch,
          yaw: obj.yaw,
        });
        if (typeof obj.speed === "number") get().setPlaybackSpeed(obj.speed);
        continue;
      }
      if (obj && obj.event === "done") {
        if (DEBUG_SERIAL_DONE)
          console.log("[Timeline] handleSerialData: saw event done");
        const resolveDone = get().pendingDoneResolver;
        if (resolveDone) {
          set({ pendingDoneResolver: null });
          resolveDone();
        }
      }
    }
    if (buffer) {
      const lines = buffer.split(/\r?\n/);
      const last = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "HOMING_DONE" && send) send("STATUS\n");
      }
      buffer = last;
    }
    set({ serialLineBuffer: buffer });
  },

  setActiveTimeline: (timeline) => set({ activeTimeline: timeline }),

  createNewTimeline: () => {
    const { timelines, activeTimeline } = get();
    if (activeTimeline) {
      // Clear frames only; do not add any new timeline to the sequences list
      const updated = { ...activeTimeline, items: [] };
      const inList = timelines.some((t) => t.id === activeTimeline.id);
      set({
        activeTimeline: updated,
        timelines: inList
          ? timelines.map((t) => (t.id === updated.id ? updated : t))
          : timelines,
      });
    } else {
      // No current timeline: create empty one for editing; do not add to list
      const newTimeline: Timeline = {
        id: Date.now().toString(),
        name: "New Sequence",
        items: [],
      };
      set({ activeTimeline: newTimeline });
    }
    get().persistConfig();
  },

  addKeyframe: () => {
    const { targetOrientation, activeTimeline } = get();
    const newItem: TimelineItem = {
      id: Date.now().toString(),
      type: "pose",
      orientation: clampOrientation(targetOrientation),
      durationMs: 1000,
    };

    if (!activeTimeline) {
      const newTimeline: Timeline = {
        id: Date.now().toString(),
        name: "New Sequence",
        items: [newItem],
      };
      set({ activeTimeline: newTimeline });
    } else {
      const updatedTimeline = {
        ...activeTimeline,
        items: [...activeTimeline.items, newItem],
      };
      set({
        activeTimeline: updatedTimeline,
        timelines: get().timelines.map((t) =>
          t.id === updatedTimeline.id ? updatedTimeline : t,
        ),
      });
    }
    get().persistConfig();
  },

  removeKeyframe: (id) => {
    const { activeTimeline } = get();
    if (!activeTimeline) return;

    const updatedTimeline = {
      ...activeTimeline,
      items: activeTimeline.items.filter((item) => item.id !== id),
    };
    set({
      activeTimeline: updatedTimeline,
      timelines: get().timelines.map((t) =>
        t.id === updatedTimeline.id ? updatedTimeline : t,
      ),
    });
    get().persistConfig();
  },

  playTimeline: async () => {
    const { activeTimeline, setTargetOrientation, isConnected } = get();
    if (!activeTimeline || get().isPlaying) return;

    set({
      isPlaying: true,
      playbackActiveIndex: null,
      playbackDelayProgress: 0,
    });

    const api =
      typeof window !== "undefined" ? window.electronAPI?.serial : null;
    const send =
      typeof window !== "undefined"
        ? (window.electronAPI?.serial?.send ?? window.__webSerialSend)
        : null;
    const useSerial = Boolean(isConnected && send);

    let currentSpeedPercent = get().playbackSpeed;
    if (useSerial && send) {
      send(`SPEED ${currentSpeedPercent}\n`);
    }

    const items = activeTimeline.items;
    if (items.length === 0) {
      set({
        isPlaying: false,
        playbackActiveIndex: null,
        playbackDelayProgress: 0,
      });
      return;
    }
    const runOnePass = async (): Promise<void> => {
      const tl = get().activeTimeline;
      const list = tl?.items ?? [];
      for (let index = 0; index < list.length; index++) {
        if (!get().isPlaying) return;
        const raw = list[index];
        const item = asTimelineItem(raw);

        set({ playbackActiveIndex: index, playbackDelayProgress: 0 });

        if (item.type === "pose") {
          setTargetOrientation(item.orientation);
          if (useSerial && send) {
            const { roll, pitch, yaw } = item.orientation;
            send(
              `RPY ${roll.toFixed(2)} ${pitch.toFixed(2)} ${yaw.toFixed(2)}\n`,
            );
            try {
              if (api) {
                if (DEBUG_SERIAL_DONE)
                  console.log(
                    "[Timeline] pose",
                    index + 1,
                    "sent RPY, waiting for done...",
                  );
                await waitForSerialDone(api, 30000);
                if (DEBUG_SERIAL_DONE)
                  console.log(
                    "[Timeline] pose",
                    index + 1,
                    "done received, advancing",
                  );
              } else if (useSerial) {
                await waitForDoneSignal(set, 30000);
              } else {
                await new Promise((r) =>
                  setTimeout(
                    r,
                    item.durationMs * (50 / Math.max(5, currentSpeedPercent)),
                  ),
                );
              }
            } catch (err) {
              if (DEBUG_SERIAL_DONE)
                console.warn(
                  "[Timeline] pose",
                  index + 1,
                  "wait error or timeout:",
                  err,
                );
            }
          } else {
            const waitMs =
              item.durationMs * (50 / Math.max(5, currentSpeedPercent));
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        } else if (item.type === "delay") {
          const durationMs = item.durationMs;
          const tickMs = 50;
          let elapsed = 0;
          while (elapsed < durationMs && get().isPlaying) {
            await new Promise((r) => setTimeout(r, tickMs));
            elapsed += tickMs;
            set({ playbackDelayProgress: Math.min(1, elapsed / durationMs) });
          }
          if (!get().isPlaying) return;
          await new Promise((r) =>
            setTimeout(r, Math.max(0, durationMs - elapsed)),
          );
        } else if (item.type === "setspeed") {
          currentSpeedPercent = item.speedPercent;
          set({ playbackSpeed: currentSpeedPercent });
          if (DEBUG_SERIAL_DONE)
            console.log(
              "[Timeline] set speed to",
              currentSpeedPercent,
              "% (slider above Home should update)",
            );
          if (useSerial && send) {
            send(`SPEED ${currentSpeedPercent}\n`);
          }
        }
      }
    };

    while (get().isPlaying) {
      await runOnePass();
      if (!get().isPlaying) break;
      if (!get().activeTimeline?.loop) break;
    }

    set({
      isPlaying: false,
      playbackActiveIndex: null,
      playbackDelayProgress: 0,
    });
  },

  stopPlayback: () =>
    set({
      isPlaying: false,
      playbackActiveIndex: null,
      playbackDelayProgress: 0,
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  sendHome: () => {
    get().setTargetOrientationFromRobot({ roll: 0, pitch: 0, yaw: 0 });
    if (get().isConnected && typeof window !== "undefined") {
      const send = window.electronAPI?.serial?.send ?? window.__webSerialSend;
      if (send) send("HOME\n");
    }
  },

  sendCurrentRpy: () => {
    if (get().isConnected && typeof window !== "undefined") {
      const send = window.electronAPI?.serial?.send ?? window.__webSerialSend;
      if (send) {
        const { roll, pitch, yaw } = get().targetOrientation;
        send(`RPY ${roll.toFixed(2)} ${pitch.toFixed(2)} ${yaw.toFixed(2)}\n`);
      }
    }
  },

  loadConfig: async () => {
    if (typeof window === "undefined") return;
    try {
      let raw: any = null;
      if (window.electronAPI?.store?.get) {
        raw = await window.electronAPI.store.get("config");
      } else if (typeof localStorage !== "undefined") {
        const s = localStorage.getItem("headgui-config");
        if (s) raw = JSON.parse(s);
      }
      if (raw == null || typeof raw !== "object") return;
      const savedPositions = Array.isArray(raw.savedPositions)
        ? raw.savedPositions
        : [];
      const timelines = Array.isArray(raw.timelines)
        ? raw.timelines.map((t: any) => ({
            id: t.id ?? Date.now().toString(),
            name: typeof t.name === "string" ? t.name : "Sequence",
            items: Array.isArray(t.items)
              ? t.items.map((i: any) => asTimelineItem(i))
              : [],
            loop: t.loop === true,
          }))
        : [];
      set({ savedPositions, timelines });
    } catch {
      // no or invalid config: keep defaults
    }
  },

  persistConfig: () => {
    if (typeof window === "undefined") return;
    try {
      const { savedPositions, timelines } = get();
      const payload = { savedPositions, timelines };
      if (window.electronAPI?.store?.set) {
        window.electronAPI.store.set("config", payload);
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem("headgui-config", JSON.stringify(payload));
      }
    } catch {
      // ignore
    }
  },
}));
