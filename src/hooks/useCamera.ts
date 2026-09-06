import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isActive: boolean;
  error: string | null;
  facingMode: 'user' | 'environment';
  isMirrored: boolean;
  toggleFacingMode: () => void;
  toggleMirror: () => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  captureFrame: () => string | null;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(true);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
          audio: false,
        });
      } catch (firstErr) {
        console.warn('High-res camera request failed, falling back to default camera:', firstErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
      setIsActive(true);
    } catch (err: unknown) {
      console.error('Camera access error:', err);
      const message = err instanceof Error ? err.message : 'Unable to access camera';
      setError(message);
      setIsActive(false);
    }
  }, [facingMode, stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, [stream]);

  const toggleFacingMode = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
    setIsMirrored((prev) => !prev);
  }, []);

  const toggleMirror = useCallback(() => {
    setIsMirrored((prev) => !prev);
  }, []);

  // Capture still image from current video element
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (isMirrored && facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, [isMirrored, facingMode]);

  // Initial camera start
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Update video element when stream or videoRef becomes available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return {
    videoRef,
    stream,
    isActive,
    error,
    facingMode,
    isMirrored,
    toggleFacingMode,
    toggleMirror,
    startCamera,
    stopCamera,
    captureFrame,
  };
}
