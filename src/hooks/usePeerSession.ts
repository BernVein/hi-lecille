import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import type { DataConnection, MediaConnection } from 'peerjs';
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

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.syncthing.net:3478' },
    ],
    iceCandidatePoolSize: 10,
  },
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
  const [statusMessage, setStatusMessage] = useState('Waiting to start session');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);

  const isHostRef = useRef(false);
  const peerRef = useRef<Peer | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const mediaConnRef = useRef<MediaConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const partnerPeerIdRef = useRef<string | null>(null);
  const hasReceivedStreamRef = useRef(false);
  const remoteFrameRef = useRef<string | null>(null);
  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Keep localStreamRef always synced and attached to offscreen video for frame fallback
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
  }, [localStream]);

  // Bind stream to video element cleanly without causing play() request interruptions
  const bindStreamToVideo = useCallback((stream: MediaStream) => {
    const video = remoteVideoRef.current;
    if (!video) return;

    // CRITICAL: NEVER reassign video.srcObject if it is already set to this stream!
    // Re-assigning aborts in-flight playback with:
    // "The play() request was interrupted by a new load request"
    if (video.srcObject !== stream) {
      console.log('[WebRTC] Setting video.srcObject to stream:', stream.id);
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;

    if (video.paused) {
      video
        .play()
        .then(() => {
          console.log('[WebRTC] ✅ Remote video playing successfully');
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('[WebRTC] Video play() error:', err.message);
          }
        });
    }
  }, []);

  // Attach received stream to state + video element
  const attachRemoteStream = useCallback(
    (stream: MediaStream) => {
      const videoTracks = stream.getVideoTracks();
      console.log('[WebRTC] attachRemoteStream called:', {
        streamId: stream.id,
        videoTracks: videoTracks.length,
      });

      hasReceivedStreamRef.current = true;

      videoTracks.forEach((track) => {
        track.enabled = true;
        track.onunmute = () => {
          console.log('[WebRTC] Video track unmuted:', track.id);
          bindStreamToVideo(stream);
        };
        track.onended = () => {
          console.log('[WebRTC] Video track ended:', track.id);
        };
      });

      stream.onaddtrack = (event) => {
        if (event.track.kind === 'video') {
          event.track.enabled = true;
          setRemoteStream(new MediaStream(stream.getTracks()));
          bindStreamToVideo(stream);
        }
      };

      setRemoteStream(stream);
      setPeerStatus('connected');
      setStatusMessage('Connected with babe 💕');
      bindStreamToVideo(stream);
    },
    [bindStreamToVideo]
  );

  // Monitor ICE state without endless auto-teardown loops
  const monitorConnection = useCallback((call: MediaConnection) => {
    const pc = (call as any).peerConnection as RTCPeerConnection | undefined;
    if (!pc) return;

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState, pc.connectionState);

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('[WebRTC] ✅ ICE Connected! Direct media path established.');
        setPeerStatus('connected');
        setStatusMessage('Connected with babe 💕');
      }

      if (pc.iceConnectionState === 'failed') {
        console.warn('[WebRTC] Direct ICE failed; live frame fallback keeps camera active.');
        setStatusMessage('Connected with babe 💕');
      }
    };
  }, []);

  // Create lightweight placeholder stream if camera is not ready yet
  const createPlaceholderStream = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, 320, 240);
    }
    return canvas.captureStream(1);
  }, []);

  // Initiate an outgoing media call (Guest -> Host)
  const initiateMediaCall = useCallback(
    (targetPeerId: string) => {
      if (!peerRef.current || peerRef.current.destroyed) {
        console.warn('[WebRTC] Cannot call - peer is null or destroyed');
        return;
      }

      const outgoingStream =
        localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0
          ? localStreamRef.current
          : createPlaceholderStream();

      try {
        console.log('[WebRTC] Initiating outgoing call to:', targetPeerId);
        const call = peerRef.current.call(targetPeerId, outgoingStream);

        if (!call) {
          console.error('[WebRTC] peer.call() returned null');
          return;
        }

        mediaConnRef.current = call;

        call.on('stream', (incomingStream) => {
          console.log('[WebRTC] 🎥 Received remote stream via call: ', incomingStream.id);
          attachRemoteStream(incomingStream);
        });

        call.on('close', () => {
          console.log('[WebRTC] Outgoing call closed');
        });

        call.on('error', (err) => {
          console.error('[WebRTC] Outgoing call error:', err);
        });

        setTimeout(() => monitorConnection(call), 500);
      } catch (err) {
        console.error('[WebRTC] initiateMediaCall error:', err);
      }
    },
    [attachRemoteStream, createPlaceholderStream, monitorConnection]
  );

  // Handle incoming media call (Host answers Guest)
  const handleIncomingCall = useCallback(
    (call: MediaConnection) => {
      console.log('[WebRTC] 📞 Incoming call from:', call.peer);
      partnerPeerIdRef.current = call.peer;

      if (mediaConnRef.current && mediaConnRef.current !== call) {
        try {
          mediaConnRef.current.close();
        } catch {}
      }
      mediaConnRef.current = call;

      const answerStream =
        localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0
          ? localStreamRef.current
          : createPlaceholderStream();

      call.answer(answerStream);

      call.on('stream', (incomingStream) => {
        console.log('[WebRTC] 🎥 Received remote stream via incoming answer:', incomingStream.id);
        attachRemoteStream(incomingStream);
      });

      call.on('close', () => {
        console.log('[WebRTC] Incoming call closed');
      });

      call.on('error', (err) => {
        console.error('[WebRTC] Incoming call error:', err);
      });

      setTimeout(() => monitorConnection(call), 500);
    },
    [attachRemoteStream, createPlaceholderStream, monitorConnection]
  );

  // Setup data connection listeners
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      dataConnRef.current = conn;
      partnerPeerIdRef.current = conn.peer;

      conn.on('open', () => {
        console.log('[WebRTC] ✅ Data connection OPEN with:', conn.peer);
        setPeerStatus('connected');
        setStatusMessage('Connected with babe 💕');

        // SINGLE INITIATOR RULE:
        // Guest calls Host; Host ONLY answers!
        // This eliminates call collisions, race conditions, and endless re-negotiation loops!
        if (!isHostRef.current) {
          console.log('[WebRTC] Guest initiating call to Host');
          setTimeout(() => {
            if (partnerPeerIdRef.current) {
              initiateMediaCall(partnerPeerIdRef.current);
            }
          }, 300);
        }
      });

      conn.on('data', (data: unknown) => {
        const msg = data as PeerSyncMessage;
        if (!msg || !msg.type) return;

        switch (msg.type) {
          case 'live-frame':
            if (msg.frame) {
              remoteFrameRef.current = msg.frame;
              setRemoteFrame(msg.frame);
              setPeerStatus('connected');
              setStatusMessage('Connected with babe 💕');
            }
            break;
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
          case 'request-call':
            if (!isHostRef.current && partnerPeerIdRef.current) {
              initiateMediaCall(partnerPeerIdRef.current);
            }
            break;
        }
      });

      conn.on('close', () => {
        console.log('[WebRTC] Data connection closed');
        setPeerStatus('disconnected');
        setStatusMessage('Babe disconnected');
        dataConnRef.current = null;
        setRemoteStream(null);
        setRemoteFrame(null);
        remoteFrameRef.current = null;
        hasReceivedStreamRef.current = false;
      });

      conn.on('error', (err) => {
        console.warn('[WebRTC] Data connection error:', err);
      });
    },
    [
      initiateMediaCall,
      onRemoteCountdownStart,
      onRemoteSnapTrigger,
      onRemotePhotoReceived,
      onRemoteFilterChange,
      onRemoteLayoutChange,
    ]
  );

  // Live frame streaming fallback over DataConnection
  // Guarantees camera video is NEVER blank even across restrictive mobile CGNAT/firewalls!
  useEffect(() => {
    if (peerStatus !== 'connected') return;

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 320;
    frameCanvas.height = 240;
    const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const interval = setInterval(() => {
      const conn = dataConnRef.current;
      if (!conn || !conn.open) return;

      const video = offscreenVideoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

      try {
        const aspect = video.videoHeight / video.videoWidth;
        frameCanvas.width = 320;
        frameCanvas.height = Math.round(320 * aspect) || 240;
        ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        const frame = frameCanvas.toDataURL('image/jpeg', 0.45);

        conn.send({
          type: 'live-frame',
          frame,
          timestamp: Date.now(),
        });
      } catch {}
    }, 125); // ~8 FPS smooth live camera sync

    return () => clearInterval(interval);
  }, [peerStatus]);

  // Broadcast data message to partner
  const broadcastMessage = useCallback((msg: PeerSyncMessage) => {
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send(msg);
    }
  }, []);

  // Cleanup all connections
  const disconnect = useCallback(() => {
    if (dataConnRef.current) {
      try {
        dataConnRef.current.close();
      } catch {}
      dataConnRef.current = null;
    }
    if (mediaConnRef.current) {
      try {
        mediaConnRef.current.close();
      } catch {}
      mediaConnRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
    }
    partnerPeerIdRef.current = null;
    hasReceivedStreamRef.current = false;
    remoteFrameRef.current = null;
    setRemoteStream(null);
    setRemoteFrame(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setPeerStatus('disconnected');
    setStatusMessage('Ready to connect');
  }, []);

  // Host a room
  const createRoom = useCallback(
    (customCode?: string | unknown) => {
      disconnect();
      const code = (
        typeof customCode === 'string' && customCode.trim()
          ? customCode.trim()
          : generateRandomCode()
      ).toUpperCase();

      setRoomCode(code);
      setIsHost(true);
      isHostRef.current = true;
      setPeerStatus('connecting');
      setStatusMessage(`Room ${code} created. Waiting for babe...`);

      const hostPeerId = `booth-${code}-host`;
      const peer = new Peer(hostPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('[WebRTC] Host peer opened with ID:', id);
        setStatusMessage(`Room ${code} active! Share code with babe.`);
      });

      peer.on('connection', (conn) => {
        console.log('[WebRTC] Host received data connection from:', conn.peer);
        setupDataConnection(conn);
      });

      peer.on('call', (call) => {
        console.log('[WebRTC] Host received media call from:', call.peer);
        handleIncomingCall(call);
      });

      peer.on('error', (err) => {
        console.error('[WebRTC] Host Peer error:', err);
        if (err.type === 'unavailable-id') {
          setStatusMessage(`Room ${code} already exists. Try another.`);
        } else {
          setPeerStatus('error');
          setStatusMessage(`Connection issue: ${err.type || 'Error'}`);
        }
      });

      peer.on('disconnected', () => {
        console.warn('[WebRTC] Host peer disconnected from signaling server');
        if (peerRef.current && !peerRef.current.destroyed) {
          peerRef.current.reconnect();
        }
      });
    },
    [disconnect, handleIncomingCall, setupDataConnection]
  );

  // Join a room as guest
  const joinRoom = useCallback(
    (code?: string | unknown) => {
      disconnect();
      const cleanCode = (typeof code === 'string' ? code : '').trim().toUpperCase();
      if (!cleanCode) return;

      setRoomCode(cleanCode);
      setIsHost(false);
      isHostRef.current = false;
      setPeerStatus('connecting');
      setStatusMessage(`Joining Room ${cleanCode}...`);

      const guestPeerId = `booth-${cleanCode}-guest-${Math.random().toString(36).substring(2, 6)}`;
      const peer = new Peer(guestPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('[WebRTC] Guest peer opened with ID:', id);
        const targetHostId = `booth-${cleanCode}-host`;
        partnerPeerIdRef.current = targetHostId;

        // Connect data channel first; media call will trigger automatically on conn.open
        const conn = peer.connect(targetHostId, { reliable: true });
        setupDataConnection(conn);
      });

      peer.on('call', (call) => {
        console.log('[WebRTC] Guest received media call from:', call.peer);
        handleIncomingCall(call);
      });

      peer.on('error', (err) => {
        console.error('[WebRTC] Guest Peer error:', err);
        if (err.type === 'peer-unavailable') {
          setPeerStatus('error');
          setStatusMessage(`Room ${cleanCode} not found. Check the code!`);
        } else {
          setPeerStatus('error');
          setStatusMessage(`Cannot reach room ${cleanCode}. Check code!`);
        }
      });

      peer.on('disconnected', () => {
        console.warn('[WebRTC] Guest peer disconnected from signaling server');
        if (peerRef.current && !peerRef.current.destroyed) {
          peerRef.current.reconnect();
        }
      });
    },
    [disconnect, handleIncomingCall, setupDataConnection]
  );

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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Read URL query parameter "?room=" on initial mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setTimeout(() => joinRoom(roomParam), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl =
    typeof window !== 'undefined' && roomCode
      ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
      : '';

  const retryMediaConnection = useCallback(() => {
    if (partnerPeerIdRef.current) {
      console.log('[WebRTC] Manual retry requested for:', partnerPeerIdRef.current);
      hasReceivedStreamRef.current = false;
      if (!isHostRef.current) {
        initiateMediaCall(partnerPeerIdRef.current);
      } else if (dataConnRef.current && dataConnRef.current.open) {
        dataConnRef.current.send({ type: 'request-call' });
      }
    } else {
      console.warn('[WebRTC] No partner peer ID known for retry');
    }
  }, [initiateMediaCall]);

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
