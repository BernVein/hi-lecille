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
}

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

  // Setup data connection listeners
  const setupDataConnection = useCallback(
    (conn: DataConnection) => {
      dataConnRef.current = conn;

      conn.on('open', () => {
        setPeerStatus('connected');
        setStatusMessage('Connected with your love 💕');
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
        }
      });

      conn.on('close', () => {
        setPeerStatus('disconnected');
        setStatusMessage('Partner disconnected');
        dataConnRef.current = null;
      });

      conn.on('error', (err) => {
        console.warn('Data connection error:', err);
      });
    },
    [
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
      setStatusMessage(`Room ${code} created. Waiting for partner...`);

      const hostPeerId = `ldr-booth-${code}-host`;
      const peer = new Peer(hostPeerId, {
        debug: 1,
      });
      peerRef.current = peer;

      peer.on('open', () => {
        setStatusMessage(`Room ${code} active! Share code or link.`);
      });

      // Guest connects data channel
      peer.on('connection', (conn) => {
        setupDataConnection(conn);
      });

      // Guest calls with media stream
      peer.on('call', (call) => {
        mediaConnRef.current = call;
        if (localStream) {
          call.answer(localStream);
        } else {
          call.answer();
        }

        call.on('stream', (stream) => {
          setRemoteStream(stream);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch(() => {});
          }
        });
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setPeerStatus('error');
        setStatusMessage(`Connection issue: ${err.type || 'Error'}`);
      });
    },
    [disconnect, localStream, setupDataConnection]
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

      const guestPeerId = `ldr-booth-${cleanCode}-guest-${Math.random().toString(36).substring(2, 6)}`;
      const peer = new Peer(guestPeerId, {
        debug: 1,
      });
      peerRef.current = peer;

      peer.on('open', () => {
        const targetHostId = `ldr-booth-${cleanCode}-host`;
        // Connect data
        const conn = peer.connect(targetHostId, { reliable: true });
        setupDataConnection(conn);

        // Call host with video stream
        if (localStream) {
          const call = peer.call(targetHostId, localStream);
          mediaConnRef.current = call;
          call.on('stream', (stream) => {
            setRemoteStream(stream);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
              remoteVideoRef.current.play().catch(() => {});
            }
          });
        }
      });

      peer.on('error', (err) => {
        console.error('Guest Peer error:', err);
        setPeerStatus('error');
        setStatusMessage(`Cannot reach room ${cleanCode}. Check code!`);
      });
    },
    [disconnect, localStream, setupDataConnection]
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
      remoteVideoRef.current.play().catch(() => {});
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
  };
}
