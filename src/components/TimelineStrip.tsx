import React, { useRef, useState, useCallback, useEffect } from "react";
import { useRobotStore } from "../store/robotStore";
import { motion, AnimatePresence } from "framer-motion";

const AnimatePresenceTyped = AnimatePresence as React.FC<{ children?: React.ReactNode; mode?: "wait" | "popLayout" }>;
import {
  Plus,
  Play,
  Square,
  Trash2,
  Timer,
  Gauge,
  Save,
  FilePlus,
  Repeat,
} from "lucide-react";
import PoseThumbnail from "./PoseThumbnail";

const LONG_PRESS_MS = 500;

export default function TimelineStrip() {
  const {
    activeTimeline,
    isPlaying,
    playbackActiveIndex,
    playbackDelayProgress,
    addKeyframe,
    addDelay,
    addSetSpeed,
    removeKeyframe,
    playTimeline,
    stopPlayback,
    setTargetOrientation,
    updateDelayItem,
    updateSetSpeedItem,
    reorderTimelineItems,
    createNewTimeline,
    saveTimelineAs,
    setTimelineLoop,
  } = useRobotStore();

  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dropOverIndex, setDropOverIndex] = useState<number | null>(null);
  const [editPopup, setEditPopup] = useState<
    | { type: "delay"; id: string; value: number }
    | { type: "setspeed"; id: string; value: number }
    | null
  >(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [saveTimelineModal, setSaveTimelineModal] = useState(false);
  const [saveTimelineDraft, setSaveTimelineDraft] = useState("");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHandled = useRef(false);

  const handleAddDelay = useCallback(() => {
    addDelay(500);
  }, [addDelay]);

  const handleAddSetSpeed = useCallback(() => {
    addSetSpeed(50);
  }, [addSetSpeed]);

  const openSaveTimelineModal = useCallback(() => {
    setSaveTimelineDraft(activeTimeline?.name || "My Sequence");
    setSaveTimelineModal(true);
  }, [activeTimeline?.name]);

  const handleSaveTimelineSubmit = useCallback(() => {
    const name = saveTimelineDraft.trim();
    if (name) {
      saveTimelineAs(name);
      setSaveTimelineModal(false);
      setSaveTimelineDraft("");
    }
  }, [saveTimelineDraft, saveTimelineAs]);

  const handlePointerDown = useCallback((index: number) => {
    longPressHandled.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressHandled.current = true;
      setDragFromIndex(index);
      setDropOverIndex(index);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (dragFromIndex !== null) {
      const toIndex = dropOverIndex ?? dragFromIndex;
      if (dragFromIndex !== toIndex) {
        reorderTimelineItems(dragFromIndex, toIndex);
      }
      setDragFromIndex(null);
      setDropOverIndex(null);
    }
  }, [dragFromIndex, dropOverIndex, reorderTimelineItems]);

  const handlePointerEnter = useCallback(
    (index: number) => {
      if (dragFromIndex !== null) setDropOverIndex(index);
    },
    [dragFromIndex],
  );

  const openDelayEdit = useCallback((id: string, value: number) => {
    if (longPressHandled.current) return;
    setEditPopup({ type: "delay", id, value });
    setEditDraft(String(value));
  }, []);

  const openSpeedEdit = useCallback((id: string, value: number) => {
    if (longPressHandled.current) return;
    setEditPopup({ type: "setspeed", id, value });
    setEditDraft(String(value));
  }, []);

  const closeEditPopup = useCallback(() => {
    setEditPopup(null);
    setEditDraft("");
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editPopup) return;
    if (editPopup.type === "delay") {
      const ms = parseInt(editDraft, 10);
      if (!Number.isNaN(ms) && ms >= 0)
        updateDelayItem(editPopup.id, Math.min(60000, ms));
    } else {
      const p = parseInt(editDraft, 10);
      if (!Number.isNaN(p) && p >= 5 && p <= 100)
        updateSetSpeedItem(editPopup.id, Math.max(5, Math.min(100, p)));
    }
    closeEditPopup();
  }, [
    editPopup,
    editDraft,
    updateDelayItem,
    updateSetSpeedItem,
    closeEditPopup,
  ]);

  useEffect(() => {
    if (dragFromIndex === null) return;
    const onUp = () => handlePointerUp();
    document.addEventListener("pointerup", onUp);
    return () => document.removeEventListener("pointerup", onUp);
  }, [dragFromIndex, handlePointerUp]);

  return (
    <div className="relative w-full h-full flex flex-col border-t border-zinc-700/80 bg-zinc-950/95 backdrop-blur-md">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span
          className="text-xs font-semibold text-zinc-400 uppercase tracking-wider"
          title="Long-press frame to reorder"
        >
          Timeline
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? stopPlayback : playTimeline}
            disabled={!activeTimeline || activeTimeline.items.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 ${isPlaying ? "btn-danger" : "btn-success"}`}
            title={isPlaying ? "Stop playback" : "Play sequence"}
          >
            {isPlaying ? <Square size={12} /> : <Play size={12} />}
            {isPlaying ? "Stop" : "Play"}
          </button>
          <button
            onClick={addKeyframe}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-primary"
            title="Add current pose"
          >
            <Plus size={12} />
            Add pose
          </button>
          <button
            onClick={handleAddDelay}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white border border-zinc-600"
            title="Add delay"
          >
            <Timer size={12} />
            Add delay
          </button>
          <button
            onClick={handleAddSetSpeed}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white border border-zinc-600"
            title="Add speed step"
          >
            <Gauge size={12} />
            Set speed
          </button>
          <button
            onClick={createNewTimeline}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white border border-zinc-600"
            title="Clear frames"
          >
            <FilePlus size={12} />
            New
          </button>
          <button
            onClick={openSaveTimelineModal}
            disabled={!activeTimeline || activeTimeline.items.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white border border-zinc-600 disabled:opacity-50"
            title="Save as sequence"
          >
            <Save size={12} />
            Save
          </button>
          <button
            onClick={() =>
              activeTimeline &&
              setTimelineLoop(activeTimeline.id, !activeTimeline.loop)
            }
            disabled={!activeTimeline}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
              activeTimeline?.loop
                ? "btn-primary"
                : "btn-glass text-zinc-300 hover:text-white border-zinc-600"
            }`}
            title="Loop sequence"
          >
            <Repeat size={12} />
            Loop
          </button>
        </div>
      </div>

      {/* Horizontal scroll of square cards */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex items-center px-4 py-3 gap-3">
        <AnimatePresenceTyped mode="popLayout">
          {activeTimeline?.items.map((item, index) => {
            const normalized =
              item.type === "pose" ||
              item.type === "delay" ||
              item.type === "setspeed"
                ? item
                : {
                    ...(item as object),
                    type: "pose" as const,
                    orientation: (item as any).orientation ?? {
                      roll: 0,
                      pitch: 0,
                      yaw: 0,
                    },
                    durationMs: (item as any).durationMs ?? 1000,
                  };
            const isDragging = dragFromIndex === index;
            const isDropTarget =
              dragFromIndex !== null && dropOverIndex === index && !isDragging;
            const isActive = playbackActiveIndex === index;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`group relative shrink-0 flex flex-col items-center touch-none transition-all duration-200 ${isDragging ? "opacity-60 scale-95 z-10" : ""} ${isDropTarget ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-950 rounded-lg" : ""} ${isActive ? "bg-emerald-500/20 border-2 border-emerald-500/50 rounded-xl shadow-[0_2px_12px_rgba(16,185,129,0.25)] z-20" : ""}`}
                onPointerDown={(e) =>
                  e.button === 0 && handlePointerDown(index)
                }
                onPointerUp={handlePointerUp}
                onPointerEnter={() => handlePointerEnter(index)}
              >
                {normalized.type === "pose" && (
                  <div
                    onClick={() => {
                      if (longPressHandled.current) {
                        longPressHandled.current = false;
                        return;
                      }
                      setTargetOrientation(normalized.orientation);
                    }}
                    className={`relative w-[88px] h-[88px] rounded-lg overflow-hidden border-2 cursor-pointer transition-colors shadow-lg ${isActive ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_2px_8px_rgba(16,185,129,0.2)]" : "bg-zinc-900 border-zinc-700 hover:border-indigo-500/60 hover:shadow-indigo-500/10"}`}
                  >
                    <PoseThumbnail
                      orientation={normalized.orientation}
                      className="absolute inset-0 w-full h-full rounded-none border-0"
                    />
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-0.5 bg-zinc-900/95 border-t border-zinc-800">
                      <span className="text-[9px] font-mono text-zinc-400">
                        R{Math.round(normalized.orientation.roll)} P
                        {Math.round(normalized.orientation.pitch)} Y
                        {Math.round(normalized.orientation.yaw)}
                      </span>
                    </div>
                  </div>
                )}
                {normalized.type === "delay" && (
                  <div
                    onClick={() => {
                      if (longPressHandled.current) {
                        longPressHandled.current = false;
                        return;
                      }
                      openDelayEdit(item.id, normalized.durationMs);
                    }}
                    className={`relative w-[88px] h-[88px] rounded-lg border-2 overflow-hidden flex flex-col items-center justify-center gap-1 cursor-pointer ${isActive ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_2px_8px_rgba(16,185,129,0.2)]" : "bg-zinc-800/80 border-zinc-700 hover:border-amber-500/50"}`}
                  >
                    <Timer size={24} className="text-amber-400/80" />
                    <span className="text-[10px] font-mono text-zinc-400">
                      {normalized.durationMs}ms
                    </span>
                    <span className="text-[9px] text-zinc-500">Delay</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
                        <div
                          className="h-full bg-amber-500/90 transition-all duration-75"
                          style={{ width: `${playbackDelayProgress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {normalized.type === "setspeed" && (
                  <div
                    onClick={() => {
                      if (longPressHandled.current) {
                        longPressHandled.current = false;
                        return;
                      }
                      openSpeedEdit(item.id, normalized.speedPercent);
                    }}
                    className={`relative w-[88px] h-[88px] rounded-lg border-2 flex flex-col items-center justify-center gap-1 cursor-pointer ${isActive ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_2px_8px_rgba(16,185,129,0.2)]" : "bg-zinc-800/80 border-zinc-700 hover:border-indigo-500/50"}`}
                  >
                    <Gauge size={24} className="text-indigo-400/80" />
                    <span className="text-[10px] font-mono text-zinc-200">
                      {normalized.speedPercent}%
                    </span>
                    <span className="text-[9px] text-zinc-500">Speed</span>
                  </div>
                )}
                <span
                  className={`text-[9px] mt-0.5 font-mono ${isActive ? "text-emerald-400 font-semibold" : "text-zinc-500"}`}
                >
                  #{index + 1}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeKeyframe(item.id);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow z-10"
                >
                  <Trash2 size={10} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresenceTyped>

        {/* Add card at end */}
        {activeTimeline && activeTimeline.items.length > 0 && (
          <button
            onClick={addKeyframe}
            className="shrink-0 w-[88px] h-[88px] rounded-lg border-2 border-dashed border-zinc-600 hover:border-indigo-500 flex items-center justify-center text-zinc-500 hover:text-indigo-400 transition-colors btn-glass"
            title="Add pose"
          >
            <Plus size={28} />
          </button>
        )}

        {(!activeTimeline || activeTimeline.items.length === 0) && (
          <div className="flex flex-col items-center justify-center gap-2 text-zinc-500 py-4">
            <p className="text-sm">No poses in timeline</p>
            <button
              onClick={addKeyframe}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary"
              title="Add pose"
            >
              Add first pose
            </button>
          </div>
        )}
      </div>

      {/* Edit popup for delay / speed */}
      {editPopup && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeEditPopup}
        >
          <div
            className="rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl p-4 min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-zinc-400 mb-3">
              {editPopup.type === "delay" ? "Delay (ms)" : "Speed (5-100)%"}
            </p>
            <input
              type="number"
              min={editPopup.type === "delay" ? 0 : 5}
              max={editPopup.type === "delay" ? 60000 : 100}
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="w-full text-sm font-mono bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeEditPopup}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save timeline name modal */}
      {saveTimelineModal && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSaveTimelineModal(false)}
        >
          <div
            className="rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl p-4 min-w-[220px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-zinc-300 mb-3">
              Enter name to save timeline
            </p>
            <input
              type="text"
              value={saveTimelineDraft}
              onChange={(e) => setSaveTimelineDraft(e.target.value)}
              placeholder="Sequence name"
              className="w-full text-sm bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTimelineSubmit();
                if (e.key === "Escape") setSaveTimelineModal(false);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSaveTimelineModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTimelineSubmit}
                disabled={!saveTimelineDraft.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
