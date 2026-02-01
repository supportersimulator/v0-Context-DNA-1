"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Brain, Zap, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getVoiceSessionToken } from "@/components/auth/voice-gate";

type VoiceState = "idle" | "recording" | "processing" | "speaking";

// Determine WebSocket URL based on environment
// Includes EC2-issued session_token for authentication ("1 stream" model)
function getVoiceWebSocketUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8888/voice";

  const hostname = window.location.hostname;
  let baseUrl: string;

  // Local development - connect directly
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    baseUrl = "ws://localhost:8888/voice";
  } else {
    // Production/preview - use Cloudflare Tunnel
    baseUrl = "wss://voice.contextdna.io/voice";
  }

  // Append session token if available (for EC2-verified voice sessions)
  const sessionToken = getVoiceSessionToken();
  if (sessionToken) {
    return `${baseUrl}?session_token=${encodeURIComponent(sessionToken)}`;
  }

  return baseUrl;
}

interface AudioChunk {
  data: ArrayBuffer;
  timestamp: number;
}

export function VoiceChatView() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    setConnecting(true);
    setError(null);

    const wsUrl = getVoiceWebSocketUrl();

    try {
      const ws = new WebSocket(wsUrl);

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        setError(null);
      };

      ws.onclose = (event) => {
        setConnected(false);
        setConnecting(false);
        setVoiceState("idle");

        // Reconnect after 3s if not a clean close
        if (event.code !== 1000) {
          setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setError("Connection failed. Is the voice server running?");
        setConnected(false);
        setConnecting(false);
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Audio data received - play it
          await playAudioChunk(event.data);
        } else {
          // JSON message
          try {
            const data = JSON.parse(event.data);

            if (data.type === "transcript") {
              setTranscript(data.text);
              setVoiceState("processing");
            } else if (data.type === "response") {
              setResponse(data.text);
              setVoiceState("speaking");
            } else if (data.type === "audio_start") {
              setVoiceState("speaking");
            } else if (data.type === "audio_end") {
              // Wait for audio queue to finish
              if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
                setVoiceState("idle");
              }
            } else if (data.type === "error") {
              setError(data.message);
              setVoiceState("idle");
            }
          } catch {
            // Ignore parse errors
          }
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setError("Failed to create WebSocket connection");
      setConnecting(false);
    }
  }, []);

  // Initialize AudioContext lazily
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play audio chunk
  const playAudioChunk = useCallback(async (audioData: ArrayBuffer) => {
    try {
      const audioContext = getAudioContext();

      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));

      // Add to queue
      audioQueueRef.current.push(audioBuffer);

      // Start playing if not already
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    } catch (err) {
      console.error("Error decoding audio:", err);
    }
  }, [getAudioContext]);

  // Play next audio buffer in queue
  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      // Check if we should return to idle
      if (voiceState === "speaking") {
        setVoiceState("idle");
      }
      return;
    }

    isPlayingRef.current = true;
    const audioContext = getAudioContext();
    const buffer = audioQueueRef.current.shift()!;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    source.onended = () => {
      playNextInQueue();
    };

    source.start();
  }, [getAudioContext, voiceState]);

  // Request microphone permission
  const requestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop()); // Stop immediately, we just need permission
      setPermissionGranted(true);
      return true;
    } catch (err) {
      setPermissionGranted(false);
      setError("Microphone access denied. Please enable microphone permission.");
      return false;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!connected) {
      setError("Not connected to voice server");
      return;
    }

    // Check/request permission
    if (permissionGranted === null || permissionGranted === false) {
      const granted = await requestMicPermission();
      if (!granted) return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Resume audio context if suspended (required on mobile)
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

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

      mediaRecorder.onstop = async () => {
        // Stop the stream tracks
        stream.getTracks().forEach((track) => track.stop());

        // Create blob from chunks
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        // Send to server
        if (wsRef.current?.readyState === WebSocket.OPEN && blob.size > 0) {
          const arrayBuffer = await blob.arrayBuffer();
          wsRef.current.send(arrayBuffer);
          setVoiceState("processing");
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder;
      setVoiceState("recording");
      setError(null);
      setTranscript("");
      setResponse("");
    } catch (err) {
      setError("Failed to start recording");
      console.error("Recording error:", err);
    }
  }, [connected, permissionGranted, requestMicPermission]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // Handle hold-to-talk
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (voiceState === "idle") {
        startRecording();
      }
    },
    [voiceState, startRecording]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (voiceState === "recording") {
        stopRecording();
      }
    },
    [voiceState, stopRecording]
  );

  // Handle pointer leaving the button while recording
  const handlePointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (voiceState === "recording") {
        stopRecording();
      }
    },
    [voiceState, stopRecording]
  );

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close(1000);
      audioContextRef.current?.close();
    };
  }, [connect]);

  // Status indicator
  const getStatusConfig = () => {
    if (connecting) {
      return {
        color: "text-yellow-500",
        text: "Connecting...",
        icon: <Zap className="h-3 w-3 animate-pulse" />,
      };
    }
    if (!connected) {
      return {
        color: "text-red-500",
        text: "Disconnected",
        icon: null,
      };
    }
    return {
      color: "text-green-500",
      text: "Connected",
      icon: <Zap className="h-3 w-3" />,
    };
  };

  const status = getStatusConfig();

  // Button state config
  const getButtonConfig = () => {
    switch (voiceState) {
      case "recording":
        return {
          className: "bg-red-500 hover:bg-red-600 scale-110 shadow-lg shadow-red-500/50",
          icon: <Mic className="h-16 w-16 animate-pulse" />,
          text: "Recording...",
          pulseRing: true,
        };
      case "processing":
        return {
          className: "bg-yellow-500 hover:bg-yellow-500 cursor-wait",
          icon: <Loader2 className="h-16 w-16 animate-spin" />,
          text: "Processing...",
          pulseRing: false,
        };
      case "speaking":
        return {
          className: "bg-blue-500 hover:bg-blue-500 cursor-wait",
          icon: <Volume2 className="h-16 w-16 animate-pulse" />,
          text: "Speaking...",
          pulseRing: false,
        };
      default:
        return {
          className: "bg-primary hover:bg-primary/90",
          icon: connected ? <Mic className="h-16 w-16" /> : <MicOff className="h-16 w-16" />,
          text: connected ? "Hold to Talk" : "Disconnected",
          pulseRing: false,
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h2 className="font-semibold">Voice Chat with Synaptic</h2>
          <p className="text-xs text-muted-foreground">
            Hold to speak, release to send
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn("text-xs flex items-center gap-1", status.color)}>
            {status.icon}
            {status.text}
          </span>
        </div>
      </div>

      {/* Main Content - Centered mic button */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        {/* Error display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 max-w-md text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Big Mic Button */}
        <div className="relative">
          {/* Pulse ring animation when recording */}
          {buttonConfig.pulseRing && (
            <>
              <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
              <div className="absolute -inset-4 rounded-full bg-red-500/20 animate-pulse" />
            </>
          )}

          <Button
            className={cn(
              "w-40 h-40 rounded-full transition-all duration-200 touch-none select-none",
              buttonConfig.className
            )}
            disabled={!connected || voiceState === "processing" || voiceState === "speaking"}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerLeave}
          >
            {buttonConfig.icon}
          </Button>
        </div>

        {/* Status Text */}
        <p className="text-lg font-medium text-muted-foreground">
          {buttonConfig.text}
        </p>

        {/* Transcript/Response Display */}
        <div className="w-full max-w-md space-y-4">
          {transcript && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">You said:</p>
              <p className="text-sm">{transcript}</p>
            </div>
          )}

          {response && (
            <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
              <p className="text-xs text-primary/70 mb-1">Synaptic:</p>
              <p className="text-sm whitespace-pre-wrap">{response}</p>
            </div>
          )}
        </div>

        {/* Instructions */}
        {voiceState === "idle" && !transcript && !response && connected && (
          <div className="text-center text-muted-foreground max-w-sm">
            <p className="text-sm">
              Press and hold the microphone button to speak with Synaptic.
              Release when you're done speaking.
            </p>
            <p className="text-xs mt-2 opacity-70">
              Works best on mobile - use your phone for hands-free interaction
            </p>
          </div>
        )}
      </div>

      {/* Footer - Connection info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className={cn("w-2 h-2 rounded-full", connected ? "bg-green-500" : "bg-red-500")} />
          <span>WebSocket: {typeof window !== "undefined" ? getVoiceWebSocketUrl() : "..."}</span>
        </div>
      </div>
    </div>
  );
}
