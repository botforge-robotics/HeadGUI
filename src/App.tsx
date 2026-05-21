import { useEffect } from "react";
import { RotateCcw, Camera, Home, MoveRight } from "lucide-react";
import URDFViewer from "./components/URDFViewer";
import TimelineStrip from "./components/TimelineStrip";
import RightPanel from "./components/RightPanel";
import ConnectionPanel from "./components/ConnectionPanel";
import { useRobotStore } from "./store/robotStore";
import { ROBOT_LIMITS, SPEED_UI_MAX, SPEED_UI_MIN } from "./robotLimits";

export default function App() {
  const {
    targetOrientation,
    setTargetOrientation,
    cameraResetTrigger,
    requestCameraReset,
    sendHome,
    sendCurrentRpy,
    loadConfig,
    playbackSpeed,
    setPlaybackSpeed,
    snackbarMessage,
    isConnected,
    isPlaying,
  } = useRobotStore();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <div className="app-root flex flex-col bg-[#0a0a0a] text-zinc-100">
      {/* Full-screen 3D view (fills everything; UI overlays on top) */}
      <div className="app-3d-view">
        <URDFViewer
          key={cameraResetTrigger}
          roll={targetOrientation.roll}
          pitch={targetOrientation.pitch}
          yaw={targetOrientation.yaw}
        />
      </div>

      {/* Top left: Title + reset + connection */}
      <header
        className="absolute top-4 left-4 z-20 flex items-center gap-3"
        style={{ position: "absolute", top: 16, left: 16, zIndex: 20 }}
      >
        <h1 className="text-lg font-bold text-white drop-shadow-lg">HeadGUI</h1>
        <button
          type="button"
          onClick={() => setTargetOrientation({ roll: 0, pitch: 0, yaw: 0 })}
          className="p-2 rounded-xl btn-glass text-zinc-300 hover:text-white"
          title="Reset pose"
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          onClick={requestCameraReset}
          className="p-2 rounded-xl btn-glass text-zinc-300 hover:text-white"
          title="Reset camera"
        >
          <Camera size={16} />
        </button>
        <ConnectionPanel />
      </header>

      {/* Top right: Saved positions + Sequences (vertical panel with tabs) */}
      <div className="app-right-panel">
        <RightPanel />
      </div>

      {/* R/P/Y sliders: responsive, no flip (value clamped in store) */}
      <div
        className="absolute z-20 flex flex-col gap-2 py-2 px-3 rounded-xl bg-zinc-900/80 border border-zinc-600/80 backdrop-blur-sm"
        style={{ bottom: 172, right: 248 }}
      >
        {(["roll", "pitch", "yaw"] as const).map((axis) => {
          const min = ROBOT_LIMITS[axis].min;
          const max = ROBOT_LIMITS[axis].max;
          const value = targetOrientation[axis];
          const step = 0.5;
          return (
            <div key={axis} className="flex items-center gap-2 min-w-[140px]">
              <span className="text-[10px] font-mono text-zinc-400 w-5 uppercase">
                {axis[0]}
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={isPlaying}
                className={`w-24 slider-${axis}`}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTargetOrientation({ ...targetOrientation, [axis]: v });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <span className="text-[10px] font-mono text-zinc-300 w-8 tabular-nums">
                {Math.round(value)}°
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1 border-t border-zinc-600/50 mt-1">
          <span
            className="text-[10px] font-mono text-zinc-400 w-10"
            title={`Prototype: max ${SPEED_UI_MAX}%`}
          >
            Speed
          </span>
          <input
            type="range"
            min={SPEED_UI_MIN}
            max={SPEED_UI_MAX}
            step={5}
            value={playbackSpeed}
            disabled={isPlaying}
            className="w-20 slider-pitch"
            onChange={(e) => {
              setPlaybackSpeed(Number(e.target.value));
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <span className="text-[10px] font-mono text-zinc-300 w-6 tabular-nums">
            {playbackSpeed}%
          </span>
        </div>
        <button
          type="button"
          onClick={sendHome}
          disabled={isPlaying}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-glass text-zinc-300 hover:text-white border border-zinc-600 disabled:opacity-50"
          title="Home head"
        >
          <Home size={14} />
          Home
        </button>
        <button
          type="button"
          onClick={sendCurrentRpy}
          disabled={!isConnected || isPlaying}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-primary disabled:opacity-50"
          title="Send current RPY to robot"
        >
          <MoveRight size={14} />
          Goto
        </button>
      </div>

      {/* Bottom: Timeline strip of square pose cards with thumbnails */}
      <div className="app-timeline-strip">
        <TimelineStrip />
      </div>

      {snackbarMessage && (
        <div
          className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 max-w-[min(90vw,28rem)] px-4 py-2.5 rounded-xl border border-zinc-600 bg-zinc-900/95 text-zinc-100 text-xs font-medium text-center shadow-lg backdrop-blur-sm pointer-events-none"
          role="status"
        >
          {snackbarMessage}
        </div>
      )}
    </div>
  );
}
