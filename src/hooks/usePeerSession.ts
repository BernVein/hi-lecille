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
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
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

  // Attach stream to remote video element helper
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    console.log('Attaching remote stream:', stream.id, 'video tracks:', stream.getVideoTracks().length);
    setRemoteStream(stream);
    setPeerStatus('connected');
    setStatusMessage('Connected with babe 💕');

    stream.getVideoTracks().forEach((track) => {
      track.enabled = true;
      track.onunmute = () => {
        console.log('Remote video track unmuted and active');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().catch(() => {});
        }
      };
    });

    stream.onaddtrack = () => {
      console.log('Track added to remote stream, total tracks:', stream.getTracks().length);
      setRemoteStream(new MediaStream(stream.getTracks()));
    };

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      const playPromise = remoteVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Remote video play prevented:', err);
        });
      }
    }
  }, []);

  // Call partner peer with media stream (only when stream has valid video tracks)
  const callPartner = useCallback((targetPeerId: string) => {
    if (!peerRef.current || peerRef.current.destroyed) return;
    const streamToSend = localStreamRef.current;

    // Don't call if we have no video tracks yet
    if (!streamToSend || streamToSend.getVideoTracks().length === 0) {
      console.log('Postponing call until local camera has video tracks');
      return;
    }

    try {
      if (mediaConnRef.current) {
        mediaConnRef.current.close();
      }

      console.log('Initiating media call to:', targetPeerId);
      const call = peerRef.current.call(targetPeerId, streamToSend);
      mediaConnRef.current = call;
      partnerPeerIdRef.current = targetPeerId;

      call.on('stream', (stream) => {
        console.log('Received remote stream via outgoing call, tracks:', stream.getTracks().length);
        attachRemoteStream(stream);
      });

      call.on('close', () => {
        setRemoteStream(null);
      });

      call.on('error', (err) => {
        console.warn('Outgoing call error:', err);
      });
    } catch (err) {
      console.error('Call partner failed:', err);
    }
  }, [attachRemoteStream]);

  // Handle incoming media call
  const handleIncomingCall = useCallback((call: MediaConnection) => {
    mediaConnRef.current = call;
    partnerPeerIdRef.current = call.peer;

    const streamToSend = localStreamRef.current;
    if (streamToSend && streamToSend.getVideoTracks().length > 0) {
      console.log('Answering incoming call with local camera stream');
      call.answer(streamToSend);
    } else {
      console.log('Answering incoming call without local tracks yet');
      call.answer();
    }

    call.on('stream', (stream) => {
      console.log('Received remote stream via incoming call, tracks:', stream.getTracks().length);
      attachRemoteStream(stream);
    });

    call.on('close', () => {
      setRemoteStream(null);
    });

    call.on('error', (err) => {
      console.warn('Media call error:', err);
    });
  }, [attachRemoteStream]);

  // Keep localStreamRef in sync with localStream prop & trigger call when ready
  useEffect(() => {
    localStreamRef.current = localStream;

    if (localStream && localStream.getVideoTracks().length > 0) {
      // If we know the partner's peer ID, initiate or refresh media call
      if (partnerPeerIdRef.current) {
        console.log('Local stream ready, initiating call to partner:', partnerPeerIdRef.current);
        callPartner(partnerPeerIdRef.current);
      }
    }
  }, [localStream, callPartner]);

  // Setup data connection listeners
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      dataConnRef.current = conn;
      partnerPeerIdRef.current = conn.peer;

      conn.on('open', () => {
        setPeerStatus('connected');
        setStatusMessage('Connected with your partner 💕');

        // Once data connection opens, initiate media call if not already active or no stream
        if ((!mediaConnRef.current || !remoteStream) && partnerPeerIdRef.current) {
          callPartner(partnerPeerIdRef.current);
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
            // If partner sent ping and we don't have active call, call them back with our stream
            if (!mediaConnRef.current && partnerPeerIdRef.current) {
              callPartner(partnerPeerIdRef.current);
            }
            break;
        }
      });

      conn.on('close', () => {
        setPeerStatus('disconnected');
        setStatusMessage('Babe disconnected');
        dataConnRef.current = null;
        setRemoteStream(null);
      });

      conn.on('error', (err) => {
        console.warn('Data connection error:', err);
      });
    },
    [
      callPartner,
      onRemoteCountdownStart,
      onRemoteSnapTrigger,
      onRemotePhotoReceived,
      onRemoteFilterChange,
      onRemoteLayoutChange,
      remoteStream,
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
    if (dataConnRef.current) {
      dataConnRef.current.close();
      dataConnRef.current = null;
    }
    if (mediaConnRef.current) {
      mediaConnRef.current.close();
      mediaConnRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    partnerPeerIdRef.current = null;
    setRemoteStream(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setPeerStatus('disconnected');
    setStatusMessage('Ready to connect');
  }, []);

  // Host a room
  const createRoom = useCallback(
    (customCode?: string) => {
      disconnect();
      const code = (customCode || generateRandomCode()).toUpperCase();
      setRoomCode(code);
      setIsHost(true);
      setPeerStatus('connecting');
      setStatusMessage(`Room ${code} created. Waiting for babe...`);

      const hostPeerId = `booth-${code}-host`;
      const peer = new Peer(hostPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        setStatusMessage(`Room ${code} active! Share code with babe.`);
      });

      // Guest connects data channel
      peer.on('connection', (conn) => {
        setupDataConnection(conn);
      });

      // Guest calls with media stream
      peer.on('call', (call) => {
        handleIncomingCall(call);
      });

      peer.on('error', (err) => {
        console.error('Host Peer error:', err);
        setPeerStatus('error');
        setStatusMessage(`Connection issue: ${err.type || 'Error'}`);
      });
    },
    [disconnect, handleIncomingCall, setupDataConnection]
  );

  // Join a room as guest
  const joinRoom = useCallback(
    (code: string) => {
      disconnect();
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) return;

      setRoomCode(cleanCode);
      setIsHost(false);
      setPeerStatus('connecting');
      setStatusMessage(`Joining Room ${cleanCode}...`);

      const guestPeerId = `booth-${cleanCode}-guest-${Math.random().toString(36).substring(2, 6)}`;
      const peer = new Peer(guestPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        const targetHostId = `booth-${cleanCode}-host`;
        partnerPeerIdRef.current = targetHostId;

        // Connect data
        const conn = peer.connect(targetHostId, { reliable: true });
        setupDataConnection(conn);

        // Also call host immediately
        callPartner(targetHostId);
      });

      // Listen for incoming call from host as well (bi-directional support)
      peer.on('call', (call) => {
        handleIncomingCall(call);
      });

      peer.on('error', (err) => {
        console.error('Guest Peer error:', err);
        setPeerStatus('error');
        setStatusMessage(`Cannot reach room ${cleanCode}. Check code!`);
      });
    },
    [callPartner, disconnect, handleIncomingCall, setupDataConnection]
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

  // Sync remote video element when stream arrives
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      const playPromise = remoteVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Remote video play prevented:', err);
        });
      }
    }
  }, [remoteStream]);

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
      joinRoom(roomParam);
    }
  }, [joinRoom]);

  const shareUrl = typeof window !== 'undefined' && roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  const retryMediaConnection = useCallback(() => {
    if (partnerPeerIdRef.current) {
      console.log('Manually retrying media connection to:', partnerPeerIdRef.current);
      callPartner(partnerPeerIdRef.current);
    }
  }, [callPartner]);

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
