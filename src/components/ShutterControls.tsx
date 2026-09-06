import React from 'react';
import { Button } from '@heroui/react';
import { Camera, Timer, Sparkles, RotateCcw, Film } from 'lucide-react';

interface ShutterControlsProps {
  onTriggerSnap: (timerSec: number) => void;
  onStartMultiShotSession: (shotsCount: number) => void;
  onClearPhotos: () => void;
  photoCount: number;
  maxPhotos: number;
  isCapturing: boolean;
  selectedTimer: number;
  onSelectTimer: (seconds: number) => void;
}

export const ShutterControls: React.FC<ShutterControlsProps> = ({
  onTriggerSnap,
  onStartMultiShotSession,
  onClearPhotos,
  photoCount,
  maxPhotos,
  isCapturing,
  selectedTimer,
  onSelectTimer,
}) => {
  return (
    <div className="w-full bg-zinc-950/90 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-xl space-y-3">
      {/* Top row: Timer options & multi-shot photobooth mode */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        {/* Timer selector */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <span className="text-zinc-500 px-2 py-0.5 flex items-center gap-1 font-medium">
            <Timer className="w-3.5 h-3.5" />
            Delay:
          </span>
          {[0, 3, 5, 10].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onSelectTimer(sec)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedTimer === sec
                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-900/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {sec === 0 ? '0s' : `${sec}s`}
            </button>
          ))}
        </div>

        {/* Photobooth Auto-Session button */}
        <div className="flex items-center gap-2">
          {photoCount > 0 && (
            <button
              type="button"
              onClick={onClearPhotos}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-400 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake All</span>
            </button>
          )}

          <Button
            size="sm"
            variant="outline"
            isDisabled={isCapturing}
            onClick={() => onStartMultiShotSession(4)}
            className="text-xs font-medium border-rose-500/40 text-rose-300 hover:bg-rose-950/20"
          >
            <Film className="w-3.5 h-3.5 mr-1" />
            Auto 4-Cut Series
          </Button>
        </div>
      </div>

      {/* Main Big Shutter Action */}
      <div className="flex items-center justify-center pt-1 pb-1">
        <div className="relative group">
          {/* Animated glow ring */}
          <div className="absolute -inset-1.5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full blur-md opacity-40 group-hover:opacity-75 transition duration-300 group-hover:duration-200 animate-pulse" />

          <button
            type="button"
            disabled={isCapturing}
            onClick={() => onTriggerSnap(selectedTimer)}
            className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-rose-500 via-pink-600 to-rose-600 text-white shadow-2xl flex flex-col items-center justify-center p-1 border-4 border-zinc-950 active:scale-95 hover:scale-105 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-white/40 flex flex-col items-center justify-center">
              <Camera className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-0.5">
                {isCapturing ? 'Snapping' : 'Snap'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Counter indicator */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
        <Sparkles className="w-3.5 h-3.5 text-rose-400" />
        <span>
          Photos taken: <strong className="text-zinc-200">{photoCount}</strong> / {maxPhotos}
        </span>
      </div>
    </div>
  );
};
