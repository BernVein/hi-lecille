import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { LiveCameraView } from './components/LiveCameraView';
import { ShutterControls } from './components/ShutterControls';
import { FilterSelector } from './components/FilterSelector';
import { StripCustomizer } from './components/StripCustomizer';
import { PhotostripPreview } from './components/PhotostripPreview';
import { MemoryGallery } from './components/MemoryGallery';
import { useCamera } from './hooks/useCamera';
import { usePeerSession } from './hooks/usePeerSession';
import { playCountdownBeep, playShutterSound, playSuccessChime } from './utils/sound';
import type {
  CapturedPhoto,
  CoupleProfile,
  FilterId,
  StripLayout,
} from './types/photobooth';
import { DEFAULT_COUPLE } from './utils/filters';

interface SavedMemory {
  id: string;
  dataUrl: string;
  timestamp: number;
}

export function App() {
  // Couple Profile state (persisted in localStorage)
  const [couple, setCouple] = useState<CoupleProfile>(() => {
    try {
      const saved = localStorage.getItem('ldr_booth_couple');
      return saved ? JSON.parse(saved) : DEFAULT_COUPLE;
    } catch {
      return DEFAULT_COUPLE;
    }
  });

  // Photobooth preferences state
  const [activeFilter, setActiveFilter] = useState<FilterId>('haru-pastel');
  const [layout, setLayout] = useState<StripLayout>('4-cut');
  const [frameColorId, setFrameColorId] = useState<string>('midnight-black');
  const [selectedStickers, setSelectedStickers] = useState<string[]>(['💕', '✨']);

  // Capture & Photos state
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedTimer, setSelectedTimer] = useState<number>(3);

  // Gallery memories state
  const [memories, setMemories] = useState<SavedMemory[]>(() => {
    try {
      const saved = localStorage.getItem('ldr_booth_memories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const countdownIntervalRef = useRef<number | null>(null);
  const isMultiShotActiveRef = useRef(false);

  // Save couple changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ldr_booth_couple', JSON.stringify(couple));
    } catch {
      // Ignore
    }
  }, [couple]);

  // Save memories to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ldr_booth_memories', JSON.stringify(memories));
    } catch {
      // Ignore
    }
  }, [memories]);

  // Camera hook
  const {
    videoRef: localVideoRef,
    stream: localStream,
    isMirrored,
    toggleFacingMode,
    toggleMirror,
    startCamera,
    captureFrame: captureLocalFrame,
  } = useCamera();

  // Reference to snap execution function
  const executeSnapCaptureRef = useRef<() => void>(() => {});

  // PeerJS real-time connection hook
  const {
    roomCode,
    peerStatus,
    remoteStream,
    remoteVideoRef,
    shareUrl,
    createRoom,
    joinRoom,
    disconnect,
    broadcastMessage,
    captureRemoteFrame,
  } = usePeerSession({
    localStream,
    onRemoteCountdownStart: (seconds) => {
      runCountdownSequence(seconds, false);
    },
    onRemoteSnapTrigger: () => {
      executeSnapCaptureRef.current();
    },
    onRemotePhotoReceived: (dataUrl) => {
      setPhotos((prev) => [
        ...prev,
        {
          id: `remote-${Date.now()}-${Math.random()}`,
          dataUrl,
          source: 'remote',
          timestamp: Date.now(),
          filter: activeFilter,
        },
      ]);
    },
    onRemoteFilterChange: (id) => {
      setActiveFilter(id);
    },
    onRemoteLayoutChange: (id) => {
      setLayout(id);
    },
  });

  // Execute snapshot capture from cameras
  const executeSnapCapture = useCallback(() => {
    setIsFlashing(true);
    playShutterSound();

    setTimeout(() => {
      setIsFlashing(false);
    }, 350);

    const localPhotoUrl = captureLocalFrame();
    const newPhotos: CapturedPhoto[] = [];

    if (localPhotoUrl) {
      newPhotos.push({
        id: `local-${Date.now()}-${Math.random()}`,
        dataUrl: localPhotoUrl,
        source: 'local',
        timestamp: Date.now(),
        filter: activeFilter,
      });

      // Send local photo to partner if connected
      if (peerStatus === 'connected') {
        broadcastMessage({
          type: 'photo-data',
          photoUrl: localPhotoUrl,
          timestamp: Date.now(),
        });
      }
    }

    // Capture remote partner video feed if available
    const remotePhotoUrl = captureRemoteFrame();
    if (remotePhotoUrl) {
      newPhotos.push({
        id: `remote-${Date.now()}-${Math.random()}`,
        dataUrl: remotePhotoUrl,
        source: 'remote',
        timestamp: Date.now(),
        filter: activeFilter,
      });
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
  }, [
    captureLocalFrame,
    captureRemoteFrame,
    activeFilter,
    peerStatus,
    broadcastMessage,
  ]);

  useEffect(() => {
    executeSnapCaptureRef.current = executeSnapCapture;
  }, [executeSnapCapture]);

  // Countdown sequence runner
  const runCountdownSequence = useCallback(
    (seconds: number, isInitiator = true) => {
      if (isCapturing) return;
      setIsCapturing(true);

      if (isInitiator && peerStatus === 'connected') {
        broadcastMessage({
          type: 'countdown-start',
          countdownSec: seconds,
        });
      }

      if (seconds <= 0) {
        executeSnapCapture();
        setIsCapturing(false);
        return;
      }

      let currentSec = seconds;
      setCountdown(currentSec);
      playCountdownBeep(false);

      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
      }

      countdownIntervalRef.current = window.setInterval(() => {
        currentSec -= 1;
        if (currentSec > 0) {
          setCountdown(currentSec);
          playCountdownBeep(false);
        } else {
          window.clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          setCountdown(null);
          playCountdownBeep(true);
          executeSnapCapture();
          setIsCapturing(false);
        }
      }, 1000);
    },
    [isCapturing, peerStatus, broadcastMessage, executeSnapCapture]
  );

  // Trigger single snapshot with timer
  const handleTriggerSnap = (timerSec: number) => {
    runCountdownSequence(timerSec, true);
  };

  // Start automated 4-shot photobooth session
  const handleStartMultiShotSession = async (shotsCount = 4) => {
    if (isCapturing) return;
    isMultiShotActiveRef.current = true;
    setPhotos([]);

    for (let i = 0; i < shotsCount; i++) {
      if (!isMultiShotActiveRef.current) break;

      // Run 3-second countdown before each pose
      await new Promise<void>((resolve) => {
        let count = 3;
        setCountdown(count);
        playCountdownBeep(false);

        const interval = window.setInterval(() => {
          count -= 1;
          if (count > 0) {
            setCountdown(count);
            playCountdownBeep(false);
          } else {
            window.clearInterval(interval);
            setCountdown(null);
            playCountdownBeep(true);
            executeSnapCapture();
            resolve();
          }
        }, 1000);
      });

      // Pause between shots if more remain
      if (i < shotsCount - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    isMultiShotActiveRef.current = false;
    playSuccessChime();
  };

  // Upload partner's photo fallback
  const handleUploadPartnerPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotos((prev) => [
        ...prev,
        {
          id: `upload-${Date.now()}`,
          dataUrl,
          source: 'upload',
          timestamp: Date.now(),
          filter: activeFilter,
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  // Change filter & sync to partner
  const handleSelectFilter = (id: FilterId) => {
    setActiveFilter(id);
    if (peerStatus === 'connected') {
      broadcastMessage({ type: 'filter-change', filterId: id });
    }
  };

  // Change layout & sync to partner
  const handleSelectLayout = (layoutId: StripLayout) => {
    setLayout(layoutId);
    if (peerStatus === 'connected') {
      broadcastMessage({ type: 'layout-change', layoutId });
    }
  };

  // Toggle stickers
  const handleToggleSticker = (sticker: string) => {
    setSelectedStickers((prev) =>
      prev.includes(sticker) ? prev.filter((s) => s !== sticker) : [...prev, sticker]
    );
  };

  // Save photostrip to gallery
  const handleSaveToGallery = (dataUrl: string) => {
    const newMemory: SavedMemory = {
      id: `mem-${Date.now()}`,
      dataUrl,
      timestamp: Date.now(),
    };
    setMemories((prev) => [newMemory, ...prev.slice(0, 24)]);
  };

  const handleDeleteMemory = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  // Determine target photos needed for current layout
  const targetPhotoCount = layout === '2-cut' || layout === 'split-duo' ? 2 : 4;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
      {/* Clean Minimal Header */}
      <Header
        peerStatus={peerStatus}
        roomCode={roomCode}
        shareUrl={shareUrl}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onDisconnect={disconnect}
      />

      {/* Main Studio Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        {/* Two-column layout on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Live Camera feeds & Controls (7 cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-3.5">
            <LiveCameraView
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
              hasRemoteStream={!!remoteStream}
              peerStatus={peerStatus}
              activeFilter={activeFilter}
              countdown={countdown}
              isFlashing={isFlashing}
              isMirrored={isMirrored}
              onToggleFacingMode={toggleFacingMode}
              onToggleMirror={toggleMirror}
              onRestartCamera={startCamera}
              onUploadPartnerPhoto={handleUploadPartnerPhoto}
            />

            <ShutterControls
              onTriggerSnap={handleTriggerSnap}
              onStartMultiShotSession={handleStartMultiShotSession}
              onClearPhotos={() => setPhotos([])}
              photoCount={photos.length}
              maxPhotos={targetPhotoCount}
              isCapturing={isCapturing}
              selectedTimer={selectedTimer}
              onSelectTimer={setSelectedTimer}
            />

            <FilterSelector
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
            />

            <StripCustomizer
              layout={layout}
              frameColorId={frameColorId}
              couple={couple}
              selectedStickers={selectedStickers}
              onSelectLayout={handleSelectLayout}
              onSelectFrameColor={setFrameColorId}
              onToggleSticker={handleToggleSticker}
              onUpdateCoupleNote={(note) => setCouple({ ...couple, loveNote: note })}
            />
          </div>

          {/* Right Column: Live Photostrip Preview & Download (5 cols on desktop) */}
          <div className="lg:col-span-5 flex flex-col gap-3.5 sticky top-16">
            <PhotostripPreview
              photos={photos}
              layout={layout}
              filterId={activeFilter}
              frameColorId={frameColorId}
              couple={couple}
              selectedStickers={selectedStickers}
              onSaveToGallery={handleSaveToGallery}
            />
          </div>
        </div>

        {/* Bottom Section: Couple Memory Gallery */}
        <MemoryGallery
          memories={memories}
          onDeleteMemory={handleDeleteMemory}
        />
      </main>
    </div>
  );
}

export default App;
