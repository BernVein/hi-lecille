import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Spinner } from '@heroui/react';
import { Heart, WifiOff, Copy, Check, Users } from 'lucide-react';
import type { PeerStatus } from '../types/photobooth';

interface HeaderProps {
  peerStatus: PeerStatus;
  roomCode: string;
  shareUrl: string;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onDisconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  peerStatus,
  roomCode,
  shareUrl,
  onCreateRoom,
  onJoinRoom,
  onDisconnect,
}) => {
  const [copied, setCopied] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const getStatusBadge = () => {
    switch (peerStatus) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 animate-pulse">
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            Connected 💕
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Spinner size="sm" color="warning" />
            Connecting {roomCode ? `(${roomCode})` : ''}...
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/30">
            <WifiOff className="w-3.5 h-3.5" />
            Offline
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Users className="w-3.5 h-3.5" />
            Solo
          </span>
        );
    }
  };

  return (
    <>
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 px-3 py-2.5 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Minimal Brand / Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500/20 to-pink-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-rose-950/30">
              <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight flex items-center gap-1.5">
                PHOTOBOOTH
              </h1>
              <p className="text-[10px] text-rose-300/80 font-medium tracking-wide">
                for babe • butuan 🤍
              </p>
            </div>
          </div>

          {/* Right: Connection Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">{getStatusBadge()}</div>

            {peerStatus === 'connected' ? (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={onDisconnect}
              >
                End Session
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                className="bg-gradient-to-r from-rose-500 to-pink-500 text-white font-medium text-xs sm:text-sm px-3 shadow-md shadow-rose-900/30 hover:from-rose-600 hover:to-pink-600"
                onClick={() => setShowConnectModal(true)}
              >
                <Users className="w-4 h-4 mr-1" />
                {roomCode ? `Room: ${roomCode}` : 'Connect with Babe'}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Connect Partner Modal - Rendered into body via Portal to prevent stacking/overlay bugs */}
      {showConnectModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowConnectModal(false);
              }
            }}
          >
            <div
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-rose-400 fill-rose-400/30" />
                  <h3 className="font-semibold text-zinc-100 text-base">Connect Cameras</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 text-base font-bold transition-colors"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Connect your camera with babe in real-time. Share your room code or copy the direct link.
              </p>

              {/* Option 1: Create room */}
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2.5">
                <span className="text-xs font-semibold text-zinc-300 block">
                  1. Start a Session
                </span>
                {roomCode ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-700">
                      <span className="text-xs text-zinc-400">Your Room Code:</span>
                      <span className="font-mono text-base font-bold text-rose-400 tracking-wider">
                        {roomCode}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-200"
                      onClick={handleCopyLink}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                          Copied Link!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy Link for Babe
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    className="w-full text-xs bg-rose-500 hover:bg-rose-600 text-white font-medium"
                    onClick={() => onCreateRoom()}
                  >
                    Generate Room Code
                  </Button>
                )}
              </div>

              {/* Option 2: Join room */}
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2.5">
                <span className="text-xs font-semibold text-zinc-300 block">
                  2. Join Babe's Room
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter Code (e.g. 2FN2)"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 font-mono tracking-wider uppercase focus:outline-none focus:border-rose-500"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    isDisabled={!joinCodeInput.trim()}
                    onClick={() => {
                      if (joinCodeInput.trim()) {
                        onJoinRoom(joinCodeInput.trim());
                        setShowConnectModal(false);
                      }
                    }}
                  >
                    Join
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setShowConnectModal(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
