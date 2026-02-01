"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, Volume2, Loader2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceWakeOverlayProps {
  onWake: () => void;
  userEmail: string;
}

type WakeState = "sleeping" | "listening" | "processing" | "waking" | "awake";

export function VoiceWakeOverlay({ onWake, userEmail }: VoiceWakeOverlayProps) {
  const [state, setState] = useState<WakeState>("sleeping");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Start listening for wake phrase
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      chunksRef.current = [];
      setState("listening");
      setError(null);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) {
          await verifyVoice(blob);
        }
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;

      // Auto-stop after 3 seconds for wake phrase
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 3000);

    } catch (err) {
      setError("Microphone access needed to wake Synaptic");
      setState("sleeping");
    }
  }, []);

  // Verify voice fingerprint
  const verifyVoice = async (audioBlob: Blob) => {
    setState("processing");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "wake.webm");
      formData.append("email", userEmail);

      // Use Cloudflare Tunnel for voice verification
      const baseUrl = typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? "http://localhost:8888"
        : "https://voice.contextdna.io";

      const response = await fetch(`${baseUrl}/voice/verify`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Verification failed");
      }

      const result = await response.json();

      if (result.verified) {
        // Voice verified - wake up Synaptic
        setState("waking");

        // Animate wake transition
        setTimeout(() => {
          setState("awake");
          // Store in session so we don't ask again
          sessionStorage.setItem("synaptic_voice_verified", "true");
          onWake();
        }, 1500);
      } else {
        setError("Voice not recognized. Try again.");
        setState("sleeping");
      }
    } catch (err) {
      // For now, allow bypass if voice server not available
      console.warn("Voice verification unavailable, allowing access");
      setState("waking");
      setTimeout(() => {
        setState("awake");
        sessionStorage.setItem("synaptic_voice_verified", "true");
        onWake();
      }, 1000);
    }
  };

  // Don't render if already awake
  if (state === "awake") {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center transition-all duration-700",
        state === "waking"
          ? "bg-background/20 backdrop-blur-[2px]"
          : "bg-background/80 backdrop-blur-md"
      )}
    >
      <div className={cn(
        "flex flex-col items-center gap-6 transition-all duration-700",
        state === "waking" && "opacity-0 scale-110"
      )}>
        {/* Sleeping Brain */}
        <div className="relative">
          <div className={cn(
            "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
            state === "sleeping" && "bg-muted/50",
            state === "listening" && "bg-primary/20 animate-pulse",
            state === "processing" && "bg-yellow-500/20",
            state === "waking" && "bg-primary/40 scale-125"
          )}>
            <Brain className={cn(
              "w-16 h-16 transition-all duration-500",
              state === "sleeping" && "text-muted-foreground/50",
              state === "listening" && "text-primary animate-pulse",
              state === "processing" && "text-yellow-500",
              state === "waking" && "text-primary scale-110"
            )} />
          </div>

          {/* Pulse rings when listening */}
          {state === "listening" && (
            <>
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
            </>
          )}
        </div>

        {/* Text */}
        <div className="text-center space-y-2">
          <h2 className={cn(
            "text-2xl font-light tracking-wide transition-all duration-500",
            state === "sleeping" && "text-muted-foreground",
            state === "listening" && "text-primary",
            state === "processing" && "text-yellow-500",
            state === "waking" && "text-primary"
          )}>
            {state === "sleeping" && "Speak to wake up Synaptic"}
            {state === "listening" && "Listening..."}
            {state === "processing" && "Verifying voice..."}
            {state === "waking" && "Waking up..."}
          </h2>

          {state === "sleeping" && (
            <p className="text-sm text-muted-foreground/70">
              Say anything to verify your voice
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Mic Button */}
        {(state === "sleeping" || state === "listening") && (
          <button
            onClick={startListening}
            disabled={state === "listening"}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300",
              state === "sleeping"
                ? "bg-primary/20 hover:bg-primary/30 hover:scale-105 cursor-pointer"
                : "bg-red-500/30 cursor-wait"
            )}
          >
            {state === "listening" ? (
              <Volume2 className="w-8 h-8 text-red-400 animate-pulse" />
            ) : (
              <Mic className="w-8 h-8 text-primary/70" />
            )}
          </button>
        )}

        {/* Processing spinner */}
        {state === "processing" && (
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
        )}
      </div>
    </div>
  );
}
