import { useState } from "react";
import { useRobotStore } from "../store/robotStore";
import { Bookmark, ListMusic, Plus, Save, Trash2, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PoseThumbnail from "./PoseThumbnail";

type Tab = "saved" | "sequences";

export default function RightPanel() {
  const [tab, setTab] = useState<Tab>("saved");
  const [poseNameModal, setPoseNameModal] = useState(false);
  const [poseNameDraft, setPoseNameDraft] = useState("");
  const [timelineNameModal, setTimelineNameModal] = useState(false);
  const [timelineNameDraft, setTimelineNameDraft] = useState("");
  const {
    savedPositions,
    addSavedPosition,
    removeSavedPosition,
    applySavedPosition,
    timelines,
    activeTimeline,
    setActiveTimeline,
    createNewTimeline,
    saveTimelineAs,
    deleteTimeline,
    playTimeline,
    stopPlayback,
    isPlaying,
  } = useRobotStore();

  const openSavePoseModal = () => {
    setPoseNameDraft("");
    setPoseNameModal(true);
  };

  const handleSavePoseSubmit = () => {
    const name = poseNameDraft.trim();
    if (name) {
      addSavedPosition(name);
      setPoseNameModal(false);
      setPoseNameDraft("");
    }
  };

  const openSaveTimelineModal = () => {
    setTimelineNameDraft(activeTimeline?.name || "My Sequence");
    setTimelineNameModal(true);
  };

  const handleSaveTimelineSubmit = () => {
    const name = timelineNameDraft.trim();
    if (name) {
      saveTimelineAs(name);
      setTimelineNameModal(false);
      setTimelineNameDraft("");
    }
  };

  const handleSaveSequence = () => openSaveTimelineModal();

  return (
    <div className="relative w-full h-full flex flex-col rounded-xl border border-zinc-600/80 bg-zinc-900/95 backdrop-blur-md overflow-hidden shadow-xl">
      {/* Tabs */}
      <div className="flex shrink-0 border-b border-zinc-700">
        <button
          onClick={() => setTab("saved")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
            tab === "saved"
              ? "bg-indigo-500/25 text-indigo-300 border-b-2 border-indigo-400 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <Bookmark size={14} />
          Saved
        </button>
        <button
          onClick={() => setTab("sequences")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
            tab === "sequences"
              ? "bg-indigo-500/25 text-indigo-300 border-b-2 border-indigo-400 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <ListMusic size={14} />
          Sequences
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <AnimatePresence mode="wait">
          {tab === "saved" && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="p-2 space-y-2"
            >
              <button
                onClick={openSavePoseModal}
                className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold btn-primary"
                title="Save current pose"
              >
                <Plus size={14} />
                Save current pose
              </button>
              {savedPositions.length === 0 && (
                <p className="text-[11px] text-zinc-500 py-4 text-center">
                  No saved poses yet
                </p>
              )}
              {savedPositions.map((pose) => (
                <div
                  key={pose.id}
                  className="group flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 border border-zinc-700/50 hover:border-indigo-500/40"
                >
                  <div className="w-12 h-12 shrink-0 rounded overflow-hidden border border-zinc-600">
                    <PoseThumbnail
                      orientation={pose.orientation}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">
                      {pose.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono">
                      R{pose.orientation.roll.toFixed(0)} P
                      {pose.orientation.pitch.toFixed(0)} Y
                      {pose.orientation.yaw.toFixed(0)}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => applySavedPosition(pose.id)}
                      className="p-1 rounded hover:bg-indigo-500/30 text-indigo-400"
                      title="Apply pose"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={() => removeSavedPosition(pose.id)}
                      className="p-1 rounded hover:bg-red-500/30 text-red-400"
                      title="Remove pose"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {tab === "sequences" && (
            <motion.div
              key="sequences"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="p-2 space-y-2"
            >
              <button
                onClick={createNewTimeline}
                className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold btn-glass text-zinc-300 hover:text-white border border-zinc-600"
                title="Clear frames"
              >
                <Plus size={14} />
                New / Clear
              </button>
              <button
                onClick={handleSaveSequence}
                disabled={!activeTimeline || activeTimeline.items.length === 0}
                className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold btn-primary disabled:opacity-50"
                title="Save as sequence"
              >
                <Save size={14} />
                Save current timeline
              </button>
              {timelines.length === 0 && !activeTimeline && (
                <p className="text-[11px] text-zinc-500 py-4 text-center">
                  No sequences yet. Add poses in the timeline, then save with a
                  name.
                </p>
              )}
              {activeTimeline && (
                <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/30 p-2">
                  <p className="text-[10px] text-indigo-400 font-medium mb-1">
                    Current
                  </p>
                  <p className="text-xs font-medium text-zinc-200">
                    {activeTimeline.name}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {activeTimeline.items.length} items
                  </p>
                </div>
              )}
              {timelines.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setActiveTimeline(t)}
                  className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                    activeTimeline?.id === t.id
                      ? "bg-indigo-500/15 border-indigo-500/40"
                      : "bg-zinc-800/80 border-zinc-700/50 hover:border-zinc-600"
                  }`}
                >
                  <div className="w-10 h-10 shrink-0 rounded bg-zinc-900 flex items-center justify-center">
                    <ListMusic size={18} className="text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">
                      {t.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {t.items.length} keyframes
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {activeTimeline?.id === t.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          isPlaying ? stopPlayback() : playTimeline();
                        }}
                        className="p-1.5 rounded-lg btn-success text-white"
                        title={isPlaying ? "Stop" : "Play"}
                      >
                        <Play size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTimeline(t.id);
                      }}
                      className="p-1.5 rounded hover:bg-red-500/30 text-red-400"
                      title="Remove sequence"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save pose name modal */}
      {poseNameModal && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 rounded-xl"
          onClick={() => setPoseNameModal(false)}
        >
          <div
            className="rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl p-4 w-[90%] max-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-zinc-300 mb-2">
              Enter name for this pose
            </p>
            <input
              type="text"
              value={poseNameDraft}
              onChange={(e) => setPoseNameDraft(e.target.value)}
              placeholder="Pose name"
              className="w-full text-sm bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePoseSubmit();
                if (e.key === "Escape") setPoseNameModal(false);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPoseNameModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-glass text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePoseSubmit}
                disabled={!poseNameDraft.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save timeline name modal */}
      {timelineNameModal && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 rounded-xl"
          onClick={() => setTimelineNameModal(false)}
        >
          <div
            className="rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl p-4 w-[90%] max-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-zinc-300 mb-2">
              Enter name to save timeline
            </p>
            <input
              type="text"
              value={timelineNameDraft}
              onChange={(e) => setTimelineNameDraft(e.target.value)}
              placeholder="Sequence name"
              className="w-full text-sm bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTimelineSubmit();
                if (e.key === "Escape") setTimelineNameModal(false);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setTimelineNameModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-glass text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTimelineSubmit}
                disabled={!timelineNameDraft.trim()}
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
