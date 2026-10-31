import { useEffect, useRef, useState } from 'react';

/**
 * Captures system audio (WASAPI loopback) via getDisplayMedia and computes
 * a live frequency spectrum with the Web Audio API. Returns a stable array
 * of normalized band levels (0..1). When capture is unavailable it returns
 * null so callers can fall back gracefully.
 */
export default function useAudioSpectrum(active, bands = 5) {
  const [levels, setLevels] = useState(null);
  const rafRef = useRef(0);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!active) {
      // Stop capture when not needed.
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      setLevels(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // We only need the audio track; drop video.
        stream.getVideoTracks().forEach((t) => t.stop());
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) {
          stream.getTracks().forEach((t) => t.stop());
          setLevels(null);
          return;
        }

        streamRef.current = stream;
        const audioStream = new MediaStream(audioTracks);
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(audioStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        const freq = new Uint8Array(analyser.frequencyBinCount);

        const loop = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(freq);
          // Split the spectrum into `bands` groups and average each.
          const per = Math.floor(freq.length / bands);
          const out = new Array(bands).fill(0);
          for (let b = 0; b < bands; b++) {
            let sum = 0;
            for (let i = 0; i < per; i++) sum += freq[b * per + i];
            out[b] = Math.min(1, (sum / per) / 200);
          }
          setLevels(out);
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        // User denied or capture unsupported — stay silent, fall back.
        setLevels(null);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [active, bands]);

  return levels;
}
