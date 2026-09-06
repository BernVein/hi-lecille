import React, { useState, useEffect } from 'react';
import { SwitchCamera, FlipHorizontal, RefreshCw, Heart, ImagePlus, Wifi } from 'lucide-react';
import { Spinner } from '@heroui/react';
import type { FilterId, PeerStatus } from '../types/photobooth';
import { PHOTOBOOTH_FILTERS } from '../utils/filters';

interface LiveCameraViewProps {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteStream?: MediaStream | null;
  remoteFrame?: string | null;
  hasRemoteStream: boolean;
  peerStatus: PeerStatus;
  activeFilter: FilterId;
  countdown: number | null;
  isFlashing: boolean;
  isMirrored: boolean;
  onToggleFacingMode: () => void;
  onToggleMirror: () => void;
  onRestartCamera: () => void;
  onRetryConnection?: () => void;
  onUploadPartnerPhoto?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const LiveCameraView: React.FC<LiveCameraViewProps> = ({
  localVideoRef,
  remoteVideoRef,
  remoteStream,
  remoteFrame,
  hasRemoteStream,
  peerStatus,
  activeFilter,
  countdown,
  isFlashing,
  isMirrored,
  onToggleFacingMode,
  onToggleMirror,
  onRestartCamera,
  onRetryConnection,
  onUploadPartnerPhoto,
}) => {
  const currentFilter = PHOTOBOOTH_FILTERS.find((f) => f.id === activeFilter) || PHOTOBOOTH_FILTERS[0];
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Direct sync of remoteStream to remoteVideo element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, remoteVideoRef]);

  // When remoteStream is cleared or changed, reset play state
  useEffect(() => {
    if (!remoteStream) {
      setIsVideoPlaying(false);
    }
  }, [remoteStream]);

  const isRemoteActive = isVideoPlaying || hasRemoteStream;

  const showPartnerSlot =
    hasRemoteStream || Boolean(remoteFrame) || peerStatus === 'connected' || peerStatus === 'connecting';

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800/80 shadow-2xl">
      {/* Flash overlay */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-shutter-flash" />
      )}

      {/* Countdown overlay */}
      {countdown !== null && countdown > 0 && (
        <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none animate-in fade-in duration-100">
          <div className="text-8xl sm:text-9xl font-black text-white drop-shadow-[0_0_35px_rgba(244,63,94,0.8)] tracking-tighter animate-bounce">
            {countdown}
          </div>
        </div>
      )}

      {/* Camera Feeds Container: Responsive Split Screen */}
      <div
        className={`w-full grid gap-1 p-1 sm:p-2 ${
          showPartnerSlot ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* Local Stream (You) */}
        <div className="relative aspect-[4/3] sm:aspect-[4/3] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/60 flex items-center justify-center">
          <video
            ref={localVideoRef}
            playsInline
            muted
            autoPlay
            style={{ filter: currentFilter.cssFilter }}
            className={`w-full h-full object-cover transition-all duration-300 ${
              isMirrored ? '-scale-x-100' : ''
            }`}
          />

          {/* Color grading tint overlay */}
          {currentFilter.tintColor && (
            <div
              className="absolute inset-0 pointer-events-none mix-blend-color"
              style={{ backgroundColor: currentFilter.tintColor }}
            />
          )}

          {/* Vignette if filter has one */}
          {currentFilter.vignette && (
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.35)_100%)]" />
          )}

          {/* Camera controls toolbar on bottom right */}
          <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full p-1">
            <button
              type="button"
              onClick={onToggleMirror}
              title="Toggle Mirror"
              className="p-1.5 rounded-full hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleFacingMode}
              title="Flip Camera (Front/Back)"
              className="p-1.5 rounded-full hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRestartCamera}
              title="Restart Camera"
              className="p-1.5 rounded-full hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Remote Stream (Partner Slot) */}
        {showPartnerSlot && (
          <div className="relative aspect-[4/3] sm:aspect-[4/3] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/60 flex items-center justify-center">
            {/* Always-mounted video element ensures remoteVideoRef is NEVER null */}
            <video
              ref={(el) => {
                if (el) {
                  const mutableRef = remoteVideoRef as React.MutableRefObject<HTMLVideoElement | null>;
                  if (mutableRef.current !== el) {
                    mutableRef.current = el;
                  }
                  if (remoteStream && el.srcObject !== remoteStream) {
                    el.srcObject = remoteStream;
                    el.muted = true;
                    el.play().catch(() => {});
                  }
                }
              }}
              playsInline
              autoPlay
              muted
              style={{ filter: currentFilter.cssFilter }}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isRemoteActive ? 'opacity-100 z-10' : 'opacity-0 absolute inset-0'
              }`}
              onPlaying={() => setIsVideoPlaying(true)}
              onLoadedData={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              onWaiting={() => setIsVideoPlaying(false)}
            />

            {/* Live frame sync fallback from data connection */}
            {!isRemoteActive && remoteFrame && (
              <img
                src={remoteFrame}
                alt="Babe's camera feed"
                style={{ filter: currentFilter.cssFilter }}
                className="w-full h-full object-cover z-10 animate-in fade-in duration-200"
              />
            )}

            {/* Loading / Connecting Overlay when neither video nor frame is ready */}
            {!isRemoteActive && !remoteFrame && (
              <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="mb-3">
                  <Spinner size="lg" color="accent" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-200 mb-1">
                  {peerStatus === 'connected' ? 'Babe Connected 💕' : 'Connecting to babe...'}
                </h4>
                <p className="text-xs text-zinc-400 max-w-xs mb-3">
                  {peerStatus === 'connected'
                    ? 'Starting babe’s camera feed...'
                    : 'Share your code with babe to start.'}
                </p>
                {onRetryConnection && (
                  <button
                    type="button"
                    onClick={onRetryConnection}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reconnect Signal</span>
                  </button>
                )}
              </div>
            )}

            {/* Filter Overlays */}
            {(isVideoPlaying || remoteFrame) && (
              <>
                {currentFilter.tintColor && (
                  <div
                    className="absolute inset-0 pointer-events-none mix-blend-color z-10"
                    style={{ backgroundColor: currentFilter.tintColor }}
                  />
                )}
                {currentFilter.vignette && (
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.35)_100%)] z-10" />
                )}
              </>
            )}

            {/* Babe Live Badge */}
            <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/80 backdrop-blur-md border border-rose-500/30 text-[11px] font-medium text-rose-200 shadow-md">
              <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />
              <span>Babe 💕</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isRemoteActive
                    ? 'bg-emerald-400 animate-pulse'
                    : remoteFrame
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-400 animate-ping'
                }`}
                title={
                  isRemoteActive
                    ? 'Live Video Connected'
                    : remoteFrame
                    ? 'Live Frame Sync Connected'
                    : 'Connecting'
                }
              />
              {remoteFrame && !isRemoteActive && (
                <span className="text-[9px] text-amber-300/80 flex items-center gap-0.5">
                  <Wifi className="w-2.5 h-2.5" />
                  Live
                </span>
              )}
            </div>

            {/* Quick reconnect button */}
            {onRetryConnection && (
              <button
                type="button"
                onClick={onRetryConnection}
                title="Reconnect Babe's Video"
                className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Active Filter Banner */}
      <div className="px-3 py-1.5 bg-zinc-900/80 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/20">
            {currentFilter.badge}
          </span>
          <span className="text-zinc-200 font-medium">{currentFilter.name}</span>
          <span className="hidden sm:inline text-zinc-500">• {currentFilter.tagline}</span>
        </div>

        {/* Fallback upload if babe camera cannot be shared */}
        {!hasRemoteStream && !remoteFrame && onUploadPartnerPhoto && (
          <label className="cursor-pointer inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-300 transition-colors">
            <ImagePlus className="w-3.5 h-3.5 text-rose-400" />
            <span>Upload Babe's Photo</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onUploadPartnerPhoto}
            />
          </label>
        )}
      </div>
    </div>
  );
};
