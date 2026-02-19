import { useRobotStore } from "../store/robotStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Clock,
  Film,
  PlayCircle,
  StopCircle,
  Timer,
  Gauge,
} from "lucide-react";
import type { TimelineItem } from "../types";

export default function TimelineEditor({
  isMini = false,
}: {
  isMini?: boolean;
}) {
  const {
    activeTimeline,
    isPlaying,
    addKeyframe,
    removeKeyframe,
    playTimeline,
    stopPlayback,
  } = useRobotStore();

  return (
    <div className="flex flex-col h-full w-full">
      {!isMini && (
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-700/50 bg-zinc-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Film size={20} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                Sequence Editor
              </h2>
              <div className="flex gap-2 text-xs text-zinc-500 font-mono mt-0.5">
                <span>{activeTimeline?.items.length || 0} FRAMES</span>
                <span>•</span>
                <span>
                  {(
                    (activeTimeline?.items.reduce(
                      (acc, item) =>
                        acc + ("durationMs" in item ? item.durationMs : 0),
                      0,
                    ) || 0) / 1000
                  ).toFixed(1)}{" "}
                  SEC
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={isPlaying ? stopPlayback : playTimeline}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${isPlaying ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}
            >
              {isPlaying ? <StopCircle size={18} /> : <PlayCircle size={18} />}
              <span>{isPlaying ? "Stop" : "Play Sequence"}</span>
            </button>
            <div className="w-px h-8 bg-white/10 mx-2" />
            <button
              onClick={addKeyframe}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <Plus size={18} />
              <span>Add Keyframe</span>
            </button>
          </div>
        </div>
      )}

      {/* Timeline Track Area */}
      <div
        className={`relative flex-1 min-h-0 bg-zinc-950/50 border-t border-zinc-700/50 overflow-hidden ${isMini ? "p-2" : "p-6"}`}
      >
        {/* Background Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "40px 100%",
            }}
          />
        </div>

        {/* Scrollable Container */}
        <div className="h-full w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent flex items-center px-4">
          <div className="flex gap-1 min-w-max items-center h-full py-2">
            <AnimatePresence mode="popLayout">
              {activeTimeline?.items.map((item, index) => {
                const i = item as TimelineItem;
                const isPose = i.type === "pose" || !("type" in i);
                const isDelay = i.type === "delay";
                const isSetSpeed = i.type === "setspeed";
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 10 }}
                    className="relative group flex items-center"
                  >
                    {index > 0 && <div className="w-6 h-0.5 bg-zinc-800" />}

                    <div className="w-32 bg-zinc-900 border border-white/5 hover:border-indigo-500/50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-1 cursor-pointer">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-mono text-zinc-500">
                          #{index + 1}
                        </span>
                        {!isMini && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeKeyframe(item.id);
                            }}
                            className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      {isPose && "orientation" in i && (
                        <>
                          <div className="flex gap-1 h-12 items-end justify-center mb-2 px-1">
                            <div
                              className="w-1.5 bg-sky-500/80 rounded-t-sm"
                              style={{
                                height: `${Math.max(20, (Math.abs(i.orientation.roll) / 180) * 100)}%`,
                              }}
                            />
                            <div
                              className="w-1.5 bg-emerald-500/80 rounded-t-sm"
                              style={{
                                height: `${Math.max(20, (Math.abs(i.orientation.pitch) / 180) * 100)}%`,
                              }}
                            />
                            <div
                              className="w-1.5 bg-rose-500/80 rounded-t-sm"
                              style={{
                                height: `${Math.max(20, (Math.abs(i.orientation.yaw) / 180) * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] bg-black/30 rounded px-1.5 py-1 text-zinc-400">
                            <Clock size={10} />
                            <span className="font-mono">{i.durationMs}ms</span>
                          </div>
                        </>
                      )}
                      {isDelay && (
                        <div className="flex flex-col items-center gap-1 py-2">
                          <Timer size={20} className="text-amber-400/80" />
                          <span className="text-[10px] font-mono text-zinc-400">
                            {i.durationMs}ms
                          </span>
                          <span className="text-[9px] text-zinc-500">
                            Delay
                          </span>
                        </div>
                      )}
                      {isSetSpeed && (
                        <div className="flex flex-col items-center gap-1 py-2">
                          <Gauge size={20} className="text-indigo-400/80" />
                          <span className="text-[10px] font-mono text-zinc-200">
                            {i.speedPercent}%
                          </span>
                          <span className="text-[9px] text-zinc-500">
                            Speed
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Add Button Placeholders if empty */}
            {(!activeTimeline || activeTimeline.items.length === 0) && (
              <div className="flex flex-col items-center justify-center w-64 h-32 border-2 border-dashed border-white/10 rounded-2xl text-zinc-600 gap-2 mx-auto">
                <Film size={24} className="opacity-50" />
                <span className="text-sm">Sequence is empty</span>
                {!isMini && (
                  <button
                    onClick={addKeyframe}
                    className="text-indigo-400 text-xs hover:underline"
                  >
                    Add first keyframe
                  </button>
                )}
              </div>
            )}

            {/* Quick Add at end */}
            {activeTimeline && activeTimeline.items.length > 0 && !isMini && (
              <>
                <div className="w-6 h-0.5 bg-zinc-800" />
                <button
                  onClick={addKeyframe}
                  className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 hover:border-indigo-500/50 hover:text-indigo-400 flex items-center justify-center transition-all group"
                >
                  <Plus
                    size={20}
                    className="text-zinc-500 group-hover:text-indigo-400"
                  />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
