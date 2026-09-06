import { useState, useEffect, useRef, useCallback } from 'react';
import { joinRoom as trysteroJoinRoom } from 'trystero';
import type { PeerStatus, PeerSyncMessage, FilterId, StripLayout } from '../types/photobooth';

interface UsePeerSessionProps {
  localStream: MediaStream | null;
  onRemoteSnapTrigger?: () => void;
  onRemoteCountdownStart?: (seconds: number) => void;
  onRemotePhotoReceived?: (dataUrl: string) => void;
  onRemoteFilterChange?: (filterId: FilterId) => void;
  onRemoteLayoutChange?: (layoutId: StripLayout) => void;
}

export interface UsePeerSessionReturn {
  roomCode: string;
  isHost: boolean;
  peerStatus: PeerStatus;
  statusMessage: string;
  remoteStream: MediaStream | null;
  remoteFrame: string | null;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  shareUrl: string;
  createRoom: (customCode?: string) => void;
  joinRoom: (code: string) => void;
  disconnect: () => void;
  broadcastMessage: (msg: PeerSyncMessage) => void;
  captureRemoteFrame: () => string | null;
  retryMediaConnection: () => void;
}

const APP_ID = 'hi-lecille-photobooth-v1';

// High-speed, censorship-resistant Nostr relays (tested and open)
const NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://purplerelay.com',
  'wss://relay.mostr.pub',
  'wss://chorus.pjv.me',
  'wss://bucket.coracle.social',
  'wss://relay.snort.social',
];

// Open Relay Project (Metered.ca) global STUN & TURN servers for 100% NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  // Google Public STUN
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // Cloudflare Public STUN
  { urls: ['stun:stun.cloudflare.com:3478'] },
  // Open Relay Project STUN
  { urls: ['stun:openrelay.metered.ca:80'] },
  // Open Relay Project TURN (UDP + TCP + TLS over 80/443 for traversing CGNAT and restrictive cellular firewalls)
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 2,
};

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function usePeerSession({
  localStream,
  onRemoteSnapTrigger,
  onRemoteCountdownStart,
  onRemotePhotoReceived,
  onRemoteFilterChange,
  onRemoteLayoutChange,
}: UsePeerSessionProps): UsePeerSessionReturn {
  const [roomCode, setRoomCode] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [peerStatus, setPeerStatus] = useState<PeerStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState('Ready to connect');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);

  const roomRef = useRef<any>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const remoteFrameRef = useRef<string | null>(null);
  const partnerPeerIdRef = useRef<string | null>(null);
  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const sendSyncActionRef = useRef<((data: PeerSyncMessage) => Promise<void>) | null>(null);
  const sendFrameActionRef = useRef<((data: { frame: string; timestamp: number }) => Promise<void>) | null>(null);

  // Sync localStream to ref and offscreen video element for live frame capture
  useEffect(() => {
    localStreamRef.current = localStream;
    if (!offscreenVideoRef.current) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      offscreenVideoRef.current = v;
    }
    if (localStream && offscreenVideoRef.current) {
      offscreenVideoRef.current.srcObject = localStream;
      offscreenVideoRef.current.play().catch(() => {});
    }

    // If already in a room and local stream changes, share new stream
    if (roomRef.current && localStream) {
      try {
        roomRef.current.addStream(localStream);
      } catch (err) {
        console.warn('[Room] Could not add stream to room:', err);
      }
    }
  }, [localStream]);

  // Bind media stream to remote video element without play() interruptions
  const bindStreamToVideo = useCallback((stream: MediaStream) => {
    const video = remoteVideoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      console.log('[Room] Binding remote stream to video element:', stream.id);
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;

    if (video.paused) {
      video
        .play()
        .then(() => {
          console.log('[Room] ✅ Remote video playing successfully');
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('[Room] Remote video play error:', err.message);
          }
        });
    }
  }, []);

  // Cleanup active room
  const disconnect = useCallback(() => {
    if (roomRef.current) {
      try {
        roomRef.current.leave();
      } catch {}
      roomRef.current = null;
    }
    sendSyncActionRef.current = null;
    sendFrameActionRef.current = null;
    partnerPeerIdRef.current = null;
    remoteFrameRef.current = null;
    setRemoteStream(null);
    setRemoteFrame(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setPeerStatus('disconnected');
    setStatusMessage('Ready to connect');
  }, []);

  // Enter room (both Host and Guest use this same robust decentralized room)
  const enterRoom = useCallback(
    (code: string, hostMode: boolean) => {
      disconnect();

      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) return;

      setRoomCode(cleanCode);
      setIsHost(hostMode);
      setPeerStatus('connecting');
      setStatusMessage(
        hostMode
          ? `Room ${cleanCode} active! Waiting for babe...`
          : `Connecting to room ${cleanCode}...`
      );

      console.log('[Room] Joining decentralized room:', cleanCode);

      try {
        const room = trysteroJoinRoom(
          {
            appId: APP_ID,
            rtcConfig: RTC_CONFIG,
            relayConfig: {
              urls: NOSTR_RELAYS,
              redundancy: 5,
              warnOnRelayFailure: false,
            },
            trickleIce: true,
          },
          cleanCode,
          {
            onJoinError: (details: any) => {
              console.warn('[Room] onJoinError:', details);
            },
          }
        );

        roomRef.current = room;

        // Broadcast local camera stream if available
        if (localStreamRef.current) {
          try {
            room.addStream(localStreamRef.current);
          } catch (err) {
            console.warn('[Room] Initial addStream error:', err);
          }
        }

        // Actions: Real-time Camera Frame Fallback
        const frameAction = room.makeAction<{ frame: string; timestamp: number }>('live-frame');
        sendFrameActionRef.current = frameAction.send;

        frameAction.onMessage = (data: { frame: string; timestamp: number }) => {
          if (data && data.frame) {
            remoteFrameRef.current = data.frame;
            setRemoteFrame(data.frame);
            setPeerStatus('connected');
            setStatusMessage('Connected with babe 💕');
          }
        };

        // Actions: Synchronized photobooth messages (countdown, snaps, photos, filters)
        const syncAction = room.makeAction<any>('sync-msg');
        sendSyncActionRef.current = syncAction.send;

        syncAction.onMessage = (msg: PeerSyncMessage) => {
          if (!msg || !msg.type) return;

          switch (msg.type) {
            case 'countdown-start':
              onRemoteCountdownStart?.(msg.countdownSec ?? 3);
              break;
            case 'snap-trigger':
              onRemoteSnapTrigger?.();
              break;
            case 'photo-data':
              if (msg.photoUrl) {
                onRemotePhotoReceived?.(msg.photoUrl);
              }
              break;
            case 'filter-change':
              if (msg.filterId) {
                onRemoteFilterChange?.(msg.filterId);
              }
              break;
            case 'layout-change':
              if (msg.layoutId) {
                onRemoteLayoutChange?.(msg.layoutId);
              }
              break;
          }
        };

        // Peer Joined
        room.onPeerJoin = (peerId: string) => {
          console.log('[Room] 💕 Babe connected with peer ID:', peerId);
          partnerPeerIdRef.current = peerId;
          setPeerStatus('connected');
          setStatusMessage('Connected with babe 💕');

          // Immediately send our local stream to the new peer
          if (localStreamRef.current) {
            try {
              room.addStream(localStreamRef.current);
              room.addStream(localStreamRef.current, { target: peerId });
            } catch (err) {
              console.warn('[Room] Failed sending stream to peer:', err);
            }
          }
        };

        // Peer Video/Audio Stream received
        room.onPeerStream = (stream: MediaStream, peerId: string) => {
          console.log('[Room] 🎥 Received remote media stream from babe:', {
            peerId,
            streamId: stream.id,
            tracks: stream.getTracks().length,
          });

          partnerPeerIdRef.current = peerId;
          setRemoteStream(stream);
          setPeerStatus('connected');
          setStatusMessage('Connected with babe 💕');
          bindStreamToVideo(stream);
        };

        // Peer Track received (fallback for browsers emitting track events directly)
        room.onPeerTrack = (track: MediaStreamTrack, stream: MediaStream, peerId: string) => {
          console.log('[Room] 🎥 Received remote track from babe:', track.kind, peerId);
          partnerPeerIdRef.current = peerId;
          setRemoteStream(stream);
          setPeerStatus('connected');
          setStatusMessage('Connected with babe 💕');
          bindStreamToVideo(stream);
        };

        // Peer Left
        room.onPeerLeave = (peerId: string) => {
          console.log('[Room] Babe left room:', peerId);
          if (partnerPeerIdRef.current === peerId) {
            partnerPeerIdRef.current = null;
            setRemoteStream(null);
            setRemoteFrame(null);
            remoteFrameRef.current = null;
            setPeerStatus('connecting');
            setStatusMessage(`Babe disconnected. Waiting in room ${cleanCode}...`);
          }
        };
      } catch (err) {
        console.error('[Room] Failed to join room:', err);
        setPeerStatus('error');
        setStatusMessage('Connection failed. Please retry.');
      }
    },
    [
      disconnect,
      bindStreamToVideo,
      onRemoteCountdownStart,
      onRemoteSnapTrigger,
      onRemotePhotoReceived,
      onRemoteFilterChange,
      onRemoteLayoutChange,
    ]
  );

  // Host: Generate code and enter room
  const createRoom = useCallback(
    (customCode?: string | unknown) => {
      const code = (
        typeof customCode === 'string' && customCode.trim()
          ? customCode.trim()
          : generateRandomCode()
      ).toUpperCase();

      enterRoom(code, true);
    },
    [enterRoom]
  );

  // Guest: Enter existing room code
  const joinRoom = useCallback(
    (code?: string | unknown) => {
      const cleanCode = (typeof code === 'string' ? code : '').trim().toUpperCase();
      if (!cleanCode) return;

      enterRoom(cleanCode, false);
    },
    [enterRoom]
  );

  // Live frame sync fallback loop
  // Ensures partners can ALWAYS see each other live with zero blank screen!
  useEffect(() => {
    if (peerStatus !== 'connected') return;

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 320;
    frameCanvas.height = 240;
    const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const interval = setInterval(() => {
      const sendFrame = sendFrameActionRef.current;
      if (!sendFrame) return;

      const video = offscreenVideoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

      try {
        const aspect = video.videoHeight / video.videoWidth;
        frameCanvas.width = 320;
        frameCanvas.height = Math.round(320 * aspect) || 240;
        ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        const frame = frameCanvas.toDataURL('image/jpeg', 0.45);

        sendFrame({
          frame,
          timestamp: Date.now(),
        }).catch(() => {});
      } catch {}
    }, 125); // 8 FPS smooth live camera sync

    return () => clearInterval(interval);
  }, [peerStatus]);

  // Broadcast data message to partner
  const broadcastMessage = useCallback((msg: PeerSyncMessage) => {
    if (sendSyncActionRef.current) {
      sendSyncActionRef.current(msg).catch((err) => {
        console.warn('[Room] broadcastMessage error:', err);
      });
    }
  }, []);

  // Capture still image from remote video feed or live frame
  const captureRemoteFrame = useCallback((): string | null => {
    if (remoteVideoRef.current) {
      const video = remoteVideoRef.current;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.95);
        }
      }
    }
    if (remoteFrameRef.current) {
      return remoteFrameRef.current;
    }
    return null;
  }, []);

  // Sync remote video element when stream arrives
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      bindStreamToVideo(remoteStream);
    }
  }, [remoteStream, bindStreamToVideo]);

  // Read URL query parameter "?room=" on initial mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setTimeout(() => joinRoom(roomParam), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const shareUrl =
    typeof window !== 'undefined' && roomCode
      ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
      : '';

  const retryMediaConnection = useCallback(() => {
    if (roomRef.current && localStreamRef.current) {
      console.log('[Room] Re-sending local stream to room');
      try {
        roomRef.current.addStream(localStreamRef.current);
      } catch {}
    }
  }, []);

  return {
    roomCode,
    isHost,
    peerStatus,
    statusMessage,
    remoteStream,
    remoteFrame,
    remoteVideoRef,
    shareUrl,
    createRoom,
    joinRoom,
    disconnect,
    broadcastMessage,
    captureRemoteFrame,
    retryMediaConnection,
  };
}
