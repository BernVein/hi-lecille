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

interface UsePeerSessionReturn {
  roomCode: string;
  isHost: boolean;
  peerStatus: PeerStatus;
  statusMessage: string;
  remoteStream: MediaStream | null;
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
  debug: 2, // Increase debug level for better diagnostics
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelay',
        credential: 'openrelay',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelay',
        credential: 'openrelay',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelay',
        credential: 'openrelay',
      },
    ],
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

  const peerRef = useRef<Peer | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const mediaConnRef = useRef<MediaConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const partnerPeerIdRef = useRef<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const hasReceivedStreamRef = useRef(false);

  // Keep localStreamRef always in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Bind stream to video element reliably
  const bindStreamToVideo = useCallback((stream: MediaStream) => {
    const video = remoteVideoRef.current;
    if (!video) {
      console.warn('[WebRTC] No remote video element ref available');
      return;
    }

    console.log('[WebRTC] Binding stream to video element:', {
      streamId: stream.id,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    // Always re-set srcObject even if it looks the same
    video.srcObject = stream;
    video.muted = true; // Muted is required for autoplay to work
    video.playsInline = true;

    // Force play
    const tryPlay = () => {
      video.play().then(() => {
        console.log('[WebRTC] ✅ Remote video playing successfully');
      }).catch((err) => {
        console.warn('[WebRTC] Video play() failed, retrying in 500ms:', err.message);
        setTimeout(tryPlay, 500);
      });
    };
    tryPlay();
  }, []);

  // Attach stream to state + video element
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    const videoTracks = stream.getVideoTracks();
    console.log('[WebRTC] attachRemoteStream called:', {
      streamId: stream.id,
      totalTracks: stream.getTracks().length,
      videoTracks: videoTracks.length,
      videoTrackStates: videoTracks.map(t => ({
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      })),
    });

    hasReceivedStreamRef.current = true;

    // Enable all video tracks
    videoTracks.forEach((track) => {
      track.enabled = true;

      // Listen for track becoming live (unmuting)
      track.onunmute = () => {
        console.log('[WebRTC] Video track unmuted:', track.id);
        bindStreamToVideo(stream);
      };

      track.onended = () => {
        console.log('[WebRTC] Video track ended:', track.id);
      };
    });

    // Listen for new tracks being added to the stream
    stream.onaddtrack = (event) => {
      console.log('[WebRTC] Track added:', event.track.kind, event.track.id);
      if (event.track.kind === 'video') {
        event.track.enabled = true;
        // Create new MediaStream to trigger React re-render
        setRemoteStream(new MediaStream(stream.getTracks()));
        bindStreamToVideo(stream);
      }
    };

    stream.onremovetrack = (event) => {
      console.log('[WebRTC] Track removed:', event.track.kind);
    };

    setRemoteStream(stream);
    setPeerStatus('connected');
    setStatusMessage('Connected with babe 💕');
    bindStreamToVideo(stream);
  }, [bindStreamToVideo]);

  // Monitor ICE connection state for a media call
  const monitorConnection = useCallback((call: MediaConnection) => {
    // PeerJS wraps the RTCPeerConnection - try to access it
    const pc = (call as any).peerConnection as RTCPeerConnection | undefined;
    if (!pc) {
      console.warn('[WebRTC] Cannot access RTCPeerConnection for ICE monitoring');
      return;
    }

    const logIceState = () => {
      console.log('[WebRTC] ICE state:', {
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
      });
    };

    pc.oniceconnectionstatechange = () => {
      logIceState();

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('[WebRTC] ✅ ICE Connected! Media path is established.');
        setPeerStatus('connected');
        setStatusMessage('Connected with babe 💕');
      }

      if (pc.iceConnectionState === 'failed') {
        console.error('[WebRTC] ❌ ICE Connection FAILED - media cannot flow');
        setStatusMessage('Video connection failed. Tap retry.');
        // Auto-retry after 3 seconds
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = window.setTimeout(() => {
          if (partnerPeerIdRef.current) {
            console.log('[WebRTC] Auto-retrying media call after ICE failure...');
            initiateMediaCall(partnerPeerIdRef.current);
          }
        }, 3000);
      }

      if (pc.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC] ⚠️ ICE Disconnected (may recover)');
        setStatusMessage('Reconnecting video...');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
    };

    // Log ICE candidates for debugging
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate:', event.candidate.type, event.candidate.protocol);
      }
    };
  }, []);

  // Initiate an outgoing media call to partner
  const initiateMediaCall = useCallback((targetPeerId: string) => {
    if (!peerRef.current || peerRef.current.destroyed) {
      console.warn('[WebRTC] Cannot call - peer is null or destroyed');
      return;
    }

    const streamToSend = localStreamRef.current;

    // Create a stream to send - if we have local video, use it; otherwise send an empty stream
    // so the remote peer's call.on('stream') still fires
    let outgoingStream: MediaStream;
    if (streamToSend && streamToSend.getVideoTracks().length > 0) {
      outgoingStream = streamToSend;
      console.log('[WebRTC] Calling with local video stream:', outgoingStream.getVideoTracks().length, 'tracks');
    } else {
      // Create a canvas-based "placeholder" stream so the call goes through
      console.log('[WebRTC] No local video yet, calling with placeholder canvas stream');
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 640, 480);
      }
      outgoingStream = canvas.captureStream(1); // 1 FPS placeholder
    }

    try {
      // Close existing media connection if any
      if (mediaConnRef.current) {
        try { mediaConnRef.current.close(); } catch {}
        mediaConnRef.current = null;
      }

      console.log('[WebRTC] Initiating outgoing call to:', targetPeerId);
      const call = peerRef.current.call(targetPeerId, outgoingStream);

      if (!call) {
        console.error('[WebRTC] peer.call() returned null/undefined');
        return;
      }

      mediaConnRef.current = call;

      call.on('stream', (incomingStream) => {
        console.log('[WebRTC] 🎥 Received remote stream via OUTGOING call:', {
          streamId: incomingStream.id,
          tracks: incomingStream.getTracks().length,
          videoTracks: incomingStream.getVideoTracks().length,
        });
        attachRemoteStream(incomingStream);
      });

      call.on('close', () => {
        console.log('[WebRTC] Outgoing call closed');
      });

      call.on('error', (err) => {
        console.error('[WebRTC] Outgoing call error:', err);
      });

      // Monitor ICE states after a small delay to let PeerConnection initialize
      setTimeout(() => monitorConnection(call), 500);

    } catch (err) {
      console.error('[WebRTC] initiateMediaCall crashed:', err);
    }
  }, [attachRemoteStream, monitorConnection]);

  // Handle incoming media call
  const handleIncomingCall = useCallback((call: MediaConnection) => {
    console.log('[WebRTC] 📞 Incoming call from:', call.peer);
    partnerPeerIdRef.current = call.peer;

    // Answer with our local stream or empty stream
    const streamToSend = localStreamRef.current;
    let answerStream: MediaStream;

    if (streamToSend && streamToSend.getVideoTracks().length > 0) {
      answerStream = streamToSend;
      console.log('[WebRTC] Answering with local video stream');
    } else {
      console.log('[WebRTC] Answering with placeholder canvas stream');
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 640, 480);
      }
      answerStream = canvas.captureStream(1);
    }

    // Close any existing media connection
    if (mediaConnRef.current) {
      try { mediaConnRef.current.close(); } catch {}
    }
    mediaConnRef.current = call;

    call.answer(answerStream);

    call.on('stream', (incomingStream) => {
      console.log('[WebRTC] 🎥 Received remote stream via INCOMING call:', {
        streamId: incomingStream.id,
        tracks: incomingStream.getTracks().length,
        videoTracks: incomingStream.getVideoTracks().length,
      });
      attachRemoteStream(incomingStream);
    });

    call.on('close', () => {
      console.log('[WebRTC] Incoming call closed');
    });

    call.on('error', (err) => {
      console.error('[WebRTC] Incoming call error:', err);
    });

    // Monitor ICE states
    setTimeout(() => monitorConnection(call), 500);

  }, [attachRemoteStream, monitorConnection]);

  // Replace local stream tracks in an existing RTCPeerConnection (renegotiation-free update)
  const replaceTracksInCall = useCallback((newStream: MediaStream) => {
    if (!mediaConnRef.current) return;
    const pc = (mediaConnRef.current as any).peerConnection as RTCPeerConnection | undefined;
    if (!pc) return;

    const senders = pc.getSenders();
    const newVideoTrack = newStream.getVideoTracks()[0];

    if (newVideoTrack) {
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (videoSender) {
        console.log('[WebRTC] Replacing video track in existing call');
        videoSender.replaceTrack(newVideoTrack).catch(err => {
          console.warn('[WebRTC] Failed to replace track:', err);
          // Fallback: re-call the partner
          if (partnerPeerIdRef.current) {
            initiateMediaCall(partnerPeerIdRef.current);
          }
        });
      } else {
        // No existing video sender, need to re-call
        console.log('[WebRTC] No existing video sender, re-initiating call');
        if (partnerPeerIdRef.current) {
          initiateMediaCall(partnerPeerIdRef.current);
        }
      }
    }
  }, [initiateMediaCall]);

  // When localStream becomes available/changes, update existing call or start new one
  useEffect(() => {
    if (!localStream || localStream.getVideoTracks().length === 0) return;

    if (mediaConnRef.current && hasReceivedStreamRef.current) {
      // Already in a call — try to replace the track seamlessly
      replaceTracksInCall(localStream);
    } else if (partnerPeerIdRef.current && !hasReceivedStreamRef.current) {
      // We know our partner but haven't gotten their stream yet — call them
      console.log('[WebRTC] Local stream ready, calling partner:', partnerPeerIdRef.current);
      initiateMediaCall(partnerPeerIdRef.current);
    }
  }, [localStream, replaceTracksInCall, initiateMediaCall]);

  // Setup data connection listeners
  // IMPORTANT: No remoteStream in deps to prevent cascading re-creation
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      dataConnRef.current = conn;
      partnerPeerIdRef.current = conn.peer;

      conn.on('open', () => {
        console.log('[WebRTC] ✅ Data connection OPEN with:', conn.peer);
        setPeerStatus('connected');
        setStatusMessage('Connected with babe 💕');

        // Once data connection opens, initiate media call
        if (partnerPeerIdRef.current && !hasReceivedStreamRef.current) {
          setTimeout(() => {
            if (partnerPeerIdRef.current) {
              initiateMediaCall(partnerPeerIdRef.current);
            }
          }, 500); // Small delay to let signaling settle
        }
      });

      conn.on('data', (data: unknown) => {
        const msg = data as PeerSyncMessage;
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
          case 'ping':
            // If partner pinged and we don't have their stream, try calling
            if (!hasReceivedStreamRef.current && partnerPeerIdRef.current) {
              initiateMediaCall(partnerPeerIdRef.current);
            }
            break;
          case 'request-call':
            // Partner is requesting we call them (they may have a new stream)
            if (partnerPeerIdRef.current) {
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

  // Broadcast data to connected partner
  const broadcastMessage = useCallback((msg: PeerSyncMessage) => {
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send(msg);
    }
  }, []);

  // Cleanup peer connections
  const disconnect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (dataConnRef.current) {
      try { dataConnRef.current.close(); } catch {}
      dataConnRef.current = null;
    }
    if (mediaConnRef.current) {
      try { mediaConnRef.current.close(); } catch {}
      mediaConnRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    partnerPeerIdRef.current = null;
    hasReceivedStreamRef.current = false;
    setRemoteStream(null);
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
      const code = (typeof customCode === 'string' && customCode.trim() ? customCode.trim() : generateRandomCode()).toUpperCase();
      setRoomCode(code);
      setIsHost(true);
      setPeerStatus('connecting');
      setStatusMessage(`Room ${code} created. Waiting for babe...`);

      const hostPeerId = `booth-${code}-host`;
      const peer = new Peer(hostPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('[WebRTC] Host peer opened with ID:', id);
        setStatusMessage(`Room ${code} active! Share code with babe.`);
      });

      // Guest connects data channel
      peer.on('connection', (conn) => {
        console.log('[WebRTC] Host received data connection from:', conn.peer);
        setupDataConnection(conn);
      });

      // Guest calls with media stream
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
        // Try to reconnect to signaling server
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
      setPeerStatus('connecting');
      setStatusMessage(`Joining Room ${cleanCode}...`);

      const guestPeerId = `booth-${cleanCode}-guest-${Math.random().toString(36).substring(2, 6)}`;
      const peer = new Peer(guestPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('[WebRTC] Guest peer opened with ID:', id);
        const targetHostId = `booth-${cleanCode}-host`;
        partnerPeerIdRef.current = targetHostId;

        // Connect data channel first
        const conn = peer.connect(targetHostId, { reliable: true });
        setupDataConnection(conn);

        // Then call host with media after short delay
        setTimeout(() => {
          initiateMediaCall(targetHostId);
        }, 1000);
      });

      // Listen for incoming call from host (bi-directional)
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
    [disconnect, handleIncomingCall, initiateMediaCall, setupDataConnection]
  );

  // Capture still image from remote video feed
  const captureRemoteFrame = useCallback((): string | null => {
    if (!remoteVideoRef.current) return null;
    const video = remoteVideoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  // Sync remote video element when stream arrives (backup for React re-renders)
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
      // Small delay to ensure camera is ready before joining
      setTimeout(() => joinRoom(roomParam), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl = typeof window !== 'undefined' && roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  const retryMediaConnection = useCallback(() => {
    if (partnerPeerIdRef.current) {
      console.log('[WebRTC] Manual retry requested for:', partnerPeerIdRef.current);
      hasReceivedStreamRef.current = false;
      initiateMediaCall(partnerPeerIdRef.current);
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
