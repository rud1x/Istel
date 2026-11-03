import { useEffect, useMemo, useRef, useState } from 'react';

// ~30 updates per second is plenty for 5 bars with an 80 ms CSS transition
// and halves the paint work of the transparent overlay window.
const FRAME_MS = 33;

/**
 * Captures system audio (WASAPI loopback) via getDisplayMedia and computes
 * a live frequency spectrum with the Web Audio API.
 *
 * Levels are NOT kept in React state: pushing a new array into state on
 * every animation frame re-rendered the whole island ~60 times a second.
 * Instead the hook returns a stable source that consumers subscribe to and
 * apply directly to the DOM (see SoundWave). Only `available` is state, so
 * the owner re-renders just when capture starts or stops.
 *
 * @returns {{ available: boolean, subscribe: (fn: (levels: number[]) => void) => () => void }}
 */
export default function useAudioSpectrum(active, bands = 5) {
  const [available, setAvailable] = useState(false);
  const listenersRef = useRef(new Set());
  const rafRef = useRef(0);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    const release = () => {
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

    if (!active) {
      // Stop capture when not needed.
      release();
      setAvailable(false);
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
          setAvailable(false);
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
        const per = Math.floor(freq.length / bands);
        const out = new Array(bands).fill(0);
        let last = 0;

        const loop = (now) => {
          if (cancelled) return;
          rafRef.current = requestAnimationFrame(loop);
          if (now - last < FRAME_MS || listenersRef.current.size === 0) return;
          last = now;
          analyser.getByteFrequencyData(freq);
          // Split the spectrum into `bands` groups and average each.
          for (let b = 0; b < bands; b++) {
            let sum = 0;
            for (let i = 0; i < per; i++) sum += freq[b * per + i];
            out[b] = Math.min(1, (sum / per) / 200);
          }
          listenersRef.current.forEach((fn) => fn(out));
        };
        setAvailable(true);
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        // User denied or capture unsupported — stay silent, fall back.
        setAvailable(false);
      }
    })();

    return () => {
      cancelled = true;
      release();
    };
  }, [active, bands]);

  return useMemo(() => ({
    available,
    subscribe(fn) {
      listenersRef.current.add(fn);
      return () => listenersRef.current.delete(fn);
    },
  }), [available]);
}
