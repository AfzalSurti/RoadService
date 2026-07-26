import { useEffect, useRef, useState } from "react";

export type CapturedShot = {
  blob: Blob;
  lat: number;
  lng: number;
  capturedAt: string;
};

type Props = {
  title?: string;
  onCapture: (shot: CapturedShot) => void;
  onCancel: () => void;
};

/**
 * Built-in camera only — no gallery / file picker.
 * GPS + timestamp recorded at shutter press.
 */
export function CameraCapture({ title = "Capture photo", onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError("Camera access is required. Gallery upload is not allowed.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("GPS not available"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not capture frame");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Capture failed"))), "image/jpeg", 0.85);
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture({
        blob,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        capturedAt: new Date().toISOString(),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Capture failed — allow camera + location");
      setBusy(false);
    }
  };

  return (
    <div className="camera-panel">
      <div className="camera-head">
        <strong>{title}</strong>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Built-in camera only · GPS + date captured on shutter
      </p>
      {error ? <div className="error">{error}</div> : null}
      <video ref={videoRef} playsInline muted className="camera-video" />
      <button className="btn" type="button" disabled={!ready || busy} onClick={capture}>
        {busy ? "Capturing…" : "Capture photo + GPS"}
      </button>
    </div>
  );
}
