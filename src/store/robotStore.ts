import { create } from "zustand";
import type {
  RobotOrientation,
  Timeline,
  TimelineItem,
  SavedPose,
} from "../types";
import {
  clampOrientation,
  SPEED_UI_CAP_MESSAGE,
  SPEED_UI_DEFAULT,
  SPEED_UI_MAX,
  SPEED_UI_MIN,
} from "../robotLimits";

let snackbarTimer: ReturnType<typeof setTimeout> | null = null;

/** Treat legacy items without .type as pose */
function asTimelineItem(item: any): TimelineItem {
  if (item.type === "delay") return item as TimelineItem;
  if (item.type === "setspeed") {
    const speedPercent = Math.round(
      Math.max(SPEED_UI_MIN, Math.min(SPEED_UI_MAX, item.speedPercent)),
    );
    return { ...item, speedPercent } as TimelineItem;
  }
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

function handlePlainSerialLine(
  line: string,
  send: ((data: string) => void) | null | undefined,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed === "HOMING_DONE" && send) send("STATUS\n");
}

/** Wait for "done" via store (browser Web Serial path; handleSerialData resolves this). */
function waitForDoneSignal(
  get: () => RobotState,
  set: (s: Partial<RobotState>) => void,
  timeoutMs: number,
): Promise<void> {
  const consumeQueuedDone = (): boolean => {
    const queuedDoneEvents = get().pendingDoneCount;
    if (queuedDoneEvents <= 0) return false;
    set({
      pendingDoneCount: queuedDoneEvents - 1,
      pendingDoneResolver: null,
    });
    return true;
  };

  if (consumeQueuedDone()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      set({ pendingDoneResolver: null });
      resolve();
    };
    const finishReject = () => {
      if (settled) return;
      settled = true;
      set({ pendingDoneResolver: null });
      reject(new Error("Serial done timeout"));
    };
    const t = setTimeout(finishReject, timeoutMs);

    set({
      pendingDoneResolver: finishResolve,
    });

    // Cover race window: done may be queued just before resolver was armed.
    if (consumeQueuedDone()) {
      finishResolve();
    }
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
  snackbarMessage: string | null;
  flashSnackbar: (message: string) => void;
  /** Index of timeline item currently playing (null when stopped). */
  playbackActiveIndex: number | null;
  /** 0..1 progress during a delay item (for UI progress bar). */
  playbackDelayProgress: number;
  /** Monotonic id to cancel/ignore stale async playback runs. */
  playbackRunId: number;

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
  /** Count of completed "done" events received before a waiter was installed. */
  pendingDoneCount: number;
}

function normalizePersistedTimeline(raw: any): Timeline | null {
  if (raw == null || typeof raw !== "object") return null;
  return {
    id: raw.id ?? Date.now().toString(),
    name: typeof raw.name === "string" ? raw.name : "Sequence",
    items: Array.isArray(raw.items)
      ? raw.items.map((i: any) => asTimelineItem(i))
      : [],
    loop: raw.loop === true,
  };
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
  playbackSpeed: SPEED_UI_DEFAULT,
  snackbarMessage: null,
  isGizmoDragging: false,
  serialLineBuffer: "",
  playbackActiveIndex: null,
  playbackDelayProgress: 0,
  playbackRunId: 0,
  pendingDoneResolver: null,
  pendingDoneCount: 0,

  requestCameraReset: () =>
    set((s) => ({ cameraResetTrigger: s.cameraResetTrigger + 1 })),
  setGizmoDragging: (v) => set({ isGizmoDragging: v }),
  flashSnackbar: (message: string) => {
    if (snackbarTimer) clearTimeout(snackbarTimer);
    set({ snackbarMessage: message });
    snackbarTimer = setTimeout(() => {
      set({ snackbarMessage: null });
      snackbarTimer = null;
    }, 3200);
  },
  setPlaybackSpeed: (speed) => {
    const rounded = Math.round(speed);
    if (rounded > SPEED_UI_MAX) {
      get().flashSnackbar(SPEED_UI_CAP_MESSAGE);
    }
    const percent = Math.max(
      SPEED_UI_MIN,
      Math.min(SPEED_UI_MAX, rounded),
    );
    set({ playbackSpeed: percent });
    if (get().isConnected && typeof window !== "undefined") {
      const send = window.electronAPI?.serial?.send ?? window.__webSerialSend;
      if (send) send(`SPEED ${percent}\n`);
    }
    get().persistConfig();
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
      Math.max(
        SPEED_UI_MIN,
        Math.min(SPEED_UI_MAX, speedPercent ?? playbackSpeed),
      ),
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
    const rounded = Math.round(speedPercent);
    if (rounded > SPEED_UI_MAX) {
      get().flashSnackbar(SPEED_UI_CAP_MESSAGE);
    }
    const percent = Math.max(
      SPEED_UI_MIN,
      Math.min(SPEED_UI_MAX, rounded),
    );
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
    set({ currentOrientation: clamped });
  },

  handleSerialData: (data) => {
    const state = get();
    let buffer = (state.serialLineBuffer + data).trimStart();
    const send =
      typeof window !== "undefined"
        ? (window.electronAPI?.serial?.send ?? window.__webSerialSend)
        : null;

    // Parse all JSON objects we can find anywhere in the buffer.
    // Important: firmware output may mix plain text (e.g. "HOMING_DONE\n") with JSON in the same chunk.
    for (;;) {
      if (!buffer) break;

      const braceIdx = buffer.indexOf("{");
      if (braceIdx < 0) break;

      // Anything before the next JSON object may contain line-oriented events (HOMING_DONE etc.)
      const prefix = buffer.slice(0, braceIdx);
      if (prefix) {
        const lines = prefix.split(/\r?\n/);
        for (const line of lines) handlePlainSerialLine(line, send);
      }

      buffer = buffer.slice(braceIdx);
      const result = extractOneJson(buffer);
      if (!result) {
        // Incomplete JSON: keep it for the next chunk.
        break;
      }

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
        } else {
          set({ pendingDoneCount: get().pendingDoneCount + 1 });
        }
      }
    }

    // Keep only the tail that's useful for future parsing:
    // - An incomplete JSON object starting with '{', OR
    // - The last partial line of non-JSON text (so we can detect a split "HOMING_DONE").
    if (buffer) {
      const braceIdx = buffer.indexOf("{");
      if (braceIdx > 0) buffer = buffer.slice(braceIdx);
      if (braceIdx < 0) {
        const lines = buffer.split(/\r?\n/);
        for (const line of lines.slice(0, -1))
          handlePlainSerialLine(line, send);
        buffer = lines.pop() ?? "";
      }
    }

    set({ serialLineBuffer: buffer });
  },

  setActiveTimeline: (timeline) => {
    set({ activeTimeline: timeline });
    get().persistConfig();
  },

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

    const runId = get().playbackRunId + 1;
    set({
      isPlaying: true,
      playbackActiveIndex: null,
      playbackDelayProgress: 0,
      playbackRunId: runId,
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
        if (!get().isPlaying || get().playbackRunId !== runId) return;
        const raw = list[index];
        const item = asTimelineItem(raw);

        if (get().playbackRunId !== runId) return;
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
                await waitForSerialDone(api, 120000);
                if (DEBUG_SERIAL_DONE)
                  console.log(
                    "[Timeline] pose",
                    index + 1,
                    "done received, advancing",
                  );
              } else if (useSerial) {
                await waitForDoneSignal(get, set, 120000);
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
            if (get().playbackRunId !== runId) return;
          } else {
            const waitMs =
              item.durationMs * (50 / Math.max(5, currentSpeedPercent));
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        } else if (item.type === "delay") {
          const durationMs = item.durationMs;
          const tickMs = 50;
          let elapsed = 0;
          while (
            elapsed < durationMs &&
            get().isPlaying &&
            get().playbackRunId === runId
          ) {
            await new Promise((r) => setTimeout(r, tickMs));
            elapsed += tickMs;
            set({ playbackDelayProgress: Math.min(1, elapsed / durationMs) });
          }
          if (!get().isPlaying || get().playbackRunId !== runId) return;
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
      if (!get().isPlaying || get().playbackRunId !== runId) break;
      if (!get().activeTimeline?.loop) break;
    }

    // Only the latest run is allowed to clear UI state.
    if (get().playbackRunId === runId) {
      set({
        isPlaying: false,
        playbackActiveIndex: null,
        playbackDelayProgress: 0,
      });
    }
  },

  stopPlayback: () =>
    set({
      isPlaying: false,
      playbackActiveIndex: null,
      playbackDelayProgress: 0,
      playbackRunId: get().playbackRunId + 1,
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  sendHome: () => {
    const home = { roll: 0, pitch: 0, yaw: 0 };
    set({ targetOrientation: home, currentOrientation: home });
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
        ? raw.timelines
            .map((t: any) => normalizePersistedTimeline(t))
            .filter(Boolean)
        : [];
      const activeTimeline =
        normalizePersistedTimeline(raw.activeTimeline) ??
        (typeof raw.activeTimelineId === "string"
          ? (timelines.find((t: Timeline) => t.id === raw.activeTimelineId) ??
            null)
          : null);
      const playbackSpeed =
        typeof raw.playbackSpeed === "number"
          ? Math.round(
              Math.max(SPEED_UI_MIN, Math.min(SPEED_UI_MAX, raw.playbackSpeed)),
            )
          : get().playbackSpeed;
      set({ savedPositions, timelines, activeTimeline, playbackSpeed });
    } catch {
      // no or invalid config: keep defaults
    }
  },

  persistConfig: () => {
    if (typeof window === "undefined") return;
    try {
      const { savedPositions, timelines, activeTimeline, playbackSpeed } =
        get();
      const payload = {
        savedPositions,
        timelines,
        activeTimeline,
        activeTimelineId: activeTimeline?.id ?? null,
        playbackSpeed,
      };
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
