"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Volume2, Loader2, Brain, CheckCircle2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceWakeOverlayProps {
  onWake: () => void;
  userEmail: string;
}

type AuthMode = "loading" | "enroll" | "verify";
type WakeState =
  | "loading"           // Checking enrollment status
  | "sleeping"          // Ready to start verification
  | "listening"         // Recording audio
  | "processing"        // Verifying/enrolling
  | "waking"            // Success animation
  | "awake"             // Done
  // Enrollment-specific states
  | "enroll_intro"      // Show enrollment intro
  | "enroll_sample_1"   // Recording sample 1
  | "enroll_sample_2"   // Recording sample 2
  | "enroll_sample_3"   // Recording sample 3
  | "enroll_processing" // Processing enrollment
  | "enroll_success";   // Enrollment complete

function getBaseUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8000/api/contextdna";
  const hostname = window.location.hostname;

  // Local development - connect to local Django backend directly
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000/api/contextdna";
  }

  // Production - use Next.js API proxy routes (avoids browser CORS issues)
  // The proxy routes forward to api.ersimulator.com server-side
  return "/api";
}

export function VoiceWakeOverlay({ onWake, userEmail }: VoiceWakeOverlayProps) {
  const [state, setState] = useState<WakeState>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [enrollmentSamples, setEnrollmentSamples] = useState<Blob[]>([]);
  const [similarity, setSimilarity] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Check enrollment status on mount
  useEffect(() => {
    checkEnrollmentStatus();
  }, [userEmail]);

  const checkEnrollmentStatus = async () => {
    setState("loading");
    setError(null);

    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(
        `${baseUrl}/voice/enrollment-status?user_email=${encodeURIComponent(userEmail)}`
      );

      if (!response.ok) {
        throw new Error("Failed to check enrollment status");
      }

      const result = await response.json();

      if (result.enrolled) {
        setAuthMode("verify");
        setState("sleeping");
      } else {
        setAuthMode("enroll");
        setState("enroll_intro");
      }
    } catch (err) {
      // If server unavailable, block access (security)
      setError("Voice server unavailable. Cannot authenticate.");
      setState("loading");
    }
  };

  // Record audio for specified duration
  const recordAudio = useCallback(async (durationMs: number): Promise<Blob | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      return new Promise((resolve) => {
        chunksRef.current = [];

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

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          resolve(blob.size > 0 ? blob : null);
        };

        mediaRecorder.start(100);
        mediaRecorderRef.current = mediaRecorder;

        setTimeout(() => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }, durationMs);
      });
    } catch (err) {
      setError("Microphone access needed");
      return null;
    }
  }, []);

  // Start verification flow
  const startVerification = useCallback(async () => {
    setState("listening");
    setError(null);

    const audioBlob = await recordAudio(3000);
    if (!audioBlob) {
      setState("sleeping");
      return;
    }

    setState("processing");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "verify.webm");
      formData.append("user_email", userEmail);

      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/voice/verify`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Verification request failed");
      }

      const result = await response.json();
      setSimilarity(result.similarity);

      if (result.is_match) {
        setState("waking");
        setTimeout(() => {
          setState("awake");
          sessionStorage.setItem("synaptic_voice_verified", "true");
          onWake();
        }, 1500);
      } else {
        const simPercent = Math.round((result.similarity || 0) * 100);
        setError(`Voice not recognized (${simPercent}% match, need 70%). Try again.`);
        setState("sleeping");
      }
    } catch (err) {
      setError("Verification failed. Voice server may be offline.");
      setState("sleeping");
    }
  }, [userEmail, onWake, recordAudio]);

  // Start enrollment flow
  const startEnrollment = useCallback(async () => {
    setEnrollmentSamples([]);
    setError(null);

    // Record all 3 samples sequentially
    const samples: Blob[] = [];

    for (let i = 1; i <= 3; i++) {
      setState(`enroll_sample_${i}` as WakeState);

      // Brief pause before recording
      await new Promise(resolve => setTimeout(resolve, 500));

      const blob = await recordAudio(4000);
      if (!blob) {
        setState("enroll_intro");
        setError("Recording failed. Please try again.");
        return;
      }

      samples.push(blob);
      setEnrollmentSamples([...samples]);

      // Brief pause between samples
      if (i < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // All samples collected, process enrollment
    await processEnrollment(samples);
  }, [recordAudio]);

  // Process enrollment with 3 samples
  const processEnrollment = async (samples: Blob[]) => {
    setState("enroll_processing");
    setError(null);

    try {
      const formData = new FormData();
      samples.forEach((sample, i) => {
        formData.append(`audio${i + 1}`, sample, `sample${i + 1}.webm`);
      });
      formData.append("user_email", userEmail);

      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/voice/enroll`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Enrollment failed");
      }

      const result = await response.json();

      if (result.success) {
        setState("enroll_success");
        // After showing success, switch to verification
        setTimeout(() => {
          setAuthMode("verify");
          setState("sleeping");
        }, 2000);
      } else {
        throw new Error(result.message || "Enrollment failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
      setState("enroll_intro");
      setEnrollmentSamples([]);
    }
  };

  // Don't render if already awake
  if (state === "awake") {
    return null;
  }

  const isEnrolling = state.startsWith("enroll_sample_");
  const currentSampleNum = isEnrolling ? parseInt(state.split("_")[2]) : 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center transition-all duration-700",
        state === "waking" || state === "enroll_success"
          ? "bg-background/20 backdrop-blur-[2px]"
          : "bg-background/80 backdrop-blur-md"
      )}
    >
      <div className={cn(
        "flex flex-col items-center gap-6 transition-all duration-700 max-w-md px-4",
        (state === "waking" || state === "enroll_success") && "opacity-0 scale-110"
      )}>
        {/* Brain Icon */}
        <div className="relative">
          <div className={cn(
            "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
            state === "loading" && "bg-muted/30",
            state === "sleeping" && "bg-muted/50",
            state === "enroll_intro" && "bg-blue-500/20",
            (state === "listening" || isEnrolling) && "bg-primary/20 animate-pulse",
            (state === "processing" || state === "enroll_processing") && "bg-yellow-500/20",
            (state === "waking" || state === "enroll_success") && "bg-primary/40 scale-125"
          )}>
            {state === "enroll_success" ? (
              <CheckCircle2 className="w-16 h-16 text-green-500" />
            ) : authMode === "verify" && state === "sleeping" ? (
              <ShieldCheck className="w-16 h-16 text-muted-foreground/50" />
            ) : (
              <Brain className={cn(
                "w-16 h-16 transition-all duration-500",
                state === "loading" && "text-muted-foreground/30 animate-pulse",
                state === "sleeping" && "text-muted-foreground/50",
                state === "enroll_intro" && "text-blue-500",
                (state === "listening" || isEnrolling) && "text-primary animate-pulse",
                (state === "processing" || state === "enroll_processing") && "text-yellow-500",
                state === "waking" && "text-primary scale-110"
              )} />
            )}
          </div>

          {/* Pulse rings when listening/recording */}
          {(state === "listening" || isEnrolling) && (
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
            state === "loading" && "text-muted-foreground/50",
            state === "sleeping" && "text-muted-foreground",
            state === "enroll_intro" && "text-blue-500",
            (state === "listening" || isEnrolling) && "text-primary",
            (state === "processing" || state === "enroll_processing") && "text-yellow-500",
            (state === "waking" || state === "enroll_success") && "text-primary"
          )}>
            {state === "loading" && "Checking voice enrollment..."}
            {state === "sleeping" && "Speak to verify your voice"}
            {state === "listening" && "Listening..."}
            {state === "processing" && "Verifying voice..."}
            {state === "waking" && "Welcome back!"}
            {state === "enroll_intro" && "Set up your voice"}
            {state === "enroll_sample_1" && "Recording sample 1 of 3..."}
            {state === "enroll_sample_2" && "Recording sample 2 of 3..."}
            {state === "enroll_sample_3" && "Recording sample 3 of 3..."}
            {state === "enroll_processing" && "Creating voice fingerprint..."}
            {state === "enroll_success" && "Voice enrolled!"}
          </h2>

          <p className="text-sm text-muted-foreground/70">
            {state === "loading" && "Please wait..."}
            {state === "sleeping" && "Say anything to unlock Synaptic"}
            {state === "enroll_intro" && "We need 3 voice samples to create your unique fingerprint"}
            {isEnrolling && "Speak naturally for 4 seconds"}
            {state === "enroll_success" && "Now verify your voice to continue"}
            {similarity !== null && state === "waking" && `Voice match: ${Math.round(similarity * 100)}%`}
          </p>
        </div>

        {/* Enrollment progress */}
        {authMode === "enroll" && (state === "enroll_intro" || isEnrolling || state === "enroll_processing") && (
          <div className="flex gap-2">
            {[1, 2, 3].map((num) => (
              <div
                key={num}
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-300",
                  enrollmentSamples.length >= num
                    ? "bg-green-500"
                    : currentSampleNum === num && isEnrolling
                    ? "bg-primary animate-pulse"
                    : "bg-muted"
                )}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        {/* Action Buttons */}
        {state === "sleeping" && (
          <button
            onClick={startVerification}
            className="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 bg-primary/20 hover:bg-primary/30 hover:scale-105 cursor-pointer"
          >
            <Mic className="w-8 h-8 text-primary/70" />
          </button>
        )}

        {state === "listening" && (
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500/30">
            <Volume2 className="w-8 h-8 text-red-400 animate-pulse" />
          </div>
        )}

        {state === "enroll_intro" && (
          <button
            onClick={startEnrollment}
            className="px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-all duration-300 hover:scale-105"
          >
            Start Voice Setup
          </button>
        )}

        {isEnrolling && (
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500/30">
            <Volume2 className="w-8 h-8 text-red-400 animate-pulse" />
          </div>
        )}

        {(state === "processing" || state === "enroll_processing" || state === "loading") && (
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
        )}
      </div>
    </div>
  );
}
