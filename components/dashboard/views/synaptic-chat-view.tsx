"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Send, Zap, Brain, MessageCircle, Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessage {
  id: string;
  timestamp: string;
  sender: "aaron" | "synaptic";
  message: string;
}

type VoiceState = "idle" | "recording" | "processing" | "speaking";

// Box-drawing character detection regex
// Matches Unicode box-drawing block (U+2500-U+257F)
const BOX_DRAWING_REGEX = /[\u2500-\u257F]/;

// Detects if a message contains 8th Intelligence formatted box
function containsBoxDrawing(text: string): boolean {
  return BOX_DRAWING_REGEX.test(text);
}

// Check for specific Synaptic markers
function isSynapticBoxMessage(text: string): boolean {
  const hasBoxChars = containsBoxDrawing(text);
  const hasSynapticMarker = /\[START:\s*Synaptic\s+to\s+(Aaron|Atlas)\]/i.test(text) ||
                            /\[END:\s*Synaptic\s+to\s+(Aaron|Atlas)\]/i.test(text);
  return hasBoxChars && hasSynapticMarker;
}

// Render message with special box styling
function renderMessageContent(message: string, isNew: boolean = false) {
  if (isSynapticBoxMessage(message)) {
    return (
      <div className={`synaptic-box-message ${isNew ? 'is-new' : ''}`}>
        {message}
      </div>
    );
  }

  // Regular message with basic box detection
  if (containsBoxDrawing(message)) {
    return (
      <div className="synaptic-box-message">
        {message}
      </div>
    );
  }

  // Standard message rendering
  return <span className="whitespace-pre-wrap">{message}</span>;
}

// Determine voice WebSocket URL based on environment
function getVoiceWebSocketUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8888/voice";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://localhost:8888/voice";
  }
  return "wss://voice.contextdna.io/voice";
}

export function SynapticChatView() {
  // Text chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice mode state
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceConnected, setVoiceConnected] = useState(false);

  // Voice refs
  const voiceWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Filter messages for display - voice mode shows only Synaptic responses
  const displayMessages = useMemo(() => {
    if (voiceMode) {
      return messages.filter(msg => msg.sender === "synaptic");
    }
    return messages;
  }, [messages, voiceMode]);

  // Text chat WebSocket connection
  const connect = useCallback(() => {
    setConnecting(true);
    const ws = new WebSocket("ws://localhost:8888/chat");

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "history") {
        setMessages(
          data.messages.map((m: any, i: number) => ({
            id: `hist-${i}`,
            timestamp: m.timestamp,
            sender: m.sender,
            message: m.message,
          }))
        );
      } else if (data.type === "message") {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            timestamp: data.timestamp,
            sender: data.sender,
            message: data.message,
          },
        ]);
      }
    };

    wsRef.current = ws;
  }, []);

  // Audio context getter
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play base64-encoded MP3 audio from TTS
  const playBase64Audio = useCallback(async (base64Audio: string) => {
    try {
      const audioContext = getAudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode and play audio
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => setVoiceState("idle");
      source.start();
    } catch (err) {
      console.error("[Voice] Audio playback failed:", err);
      setVoiceState("idle");
    }
  }, [getAudioContext]);

  // Voice WebSocket connection
  const connectVoice = useCallback(() => {
    const ws = new WebSocket(getVoiceWebSocketUrl());

    ws.onopen = () => {
      setVoiceConnected(true);
      console.log("[Voice] Connected to", getVoiceWebSocketUrl());
    };

    ws.onclose = () => {
      setVoiceConnected(false);
      setVoiceState("idle");
      console.log("[Voice] Disconnected");
      // Reconnect if voice mode still active
      if (voiceMode) {
        setTimeout(connectVoice, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error("[Voice] WebSocket error:", err);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "ready") {
          console.log("[Voice] Server ready:", data);
        } else if (data.type === "transcript") {
          // User's transcribed speech - don't add to messages in voice mode
          console.log("[Voice] Transcript:", data.text);
          setVoiceState("processing");
        } else if (data.type === "processing") {
          // Processing stage update (stt/llm/tts)
          console.log("[Voice] Processing stage:", data.stage);
        } else if (data.type === "response") {
          // Synaptic's response - ADD to messages
          setMessages(prev => [...prev, {
            id: `voice-${Date.now()}`,
            timestamp: new Date().toISOString(),
            sender: "synaptic",
            message: data.text
          }]);

          // Play audio if present
          if (data.audio && data.audio_format === "mp3") {
            setVoiceState("speaking");
            await playBase64Audio(data.audio);
          } else {
            setVoiceState("idle");
          }
        } else if (data.type === "error") {
          console.error("[Voice] Server error:", data.message);
          setVoiceState("idle");
        }
      } catch (err) {
        console.error("[Voice] Message parse error:", err);
      }
    };

    voiceWsRef.current = ws;
  }, [voiceMode, playBase64Audio]);

  // Start recording audio
  const startRecording = useCallback(async () => {
    if (!voiceConnected || voiceState !== "idle") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());

        // Send audio to server
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (voiceWsRef.current?.readyState === WebSocket.OPEN && blob.size > 0) {
          const arrayBuffer = await blob.arrayBuffer();
          voiceWsRef.current.send(arrayBuffer);
          setVoiceState("processing");
        } else {
          setVoiceState("idle");
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder;
      setVoiceState("recording");
    } catch (err) {
      console.error("[Voice] Microphone access failed:", err);
      setVoiceState("idle");
    }
  }, [voiceConnected, voiceState]);

  // Stop recording audio
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // Text chat connection effect
  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  // Voice WebSocket connection effect
  useEffect(() => {
    if (voiceMode) {
      connectVoice();
    } else {
      if (voiceWsRef.current) {
        voiceWsRef.current.close(1000);
        voiceWsRef.current = null;
      }
      setVoiceConnected(false);
      setVoiceState("idle");
    }
    return () => {
      if (voiceWsRef.current) {
        voiceWsRef.current.close();
      }
    };
  }, [voiceMode, connectVoice]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    if (input.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message: input }));
      setInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") send();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h2 className="font-semibold">Synaptic Fast Chat</h2>
          <p className="text-xs text-muted-foreground">
            {voiceMode ? "Voice Mode • STT → LLM → TTS" : "Full Memory Access • WebSocket • Sub-10ms"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Connection Status */}
          {connecting ? (
            <span className="text-yellow-500 text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 animate-pulse" />
              Connecting...
            </span>
          ) : connected ? (
            <span className="text-green-500 text-xs flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {voiceMode && voiceConnected ? "Voice Ready" : "Connected"}
            </span>
          ) : (
            <span className="text-red-500 text-xs">Disconnected</span>
          )}

          {/* Voice Mode Toggle */}
          <Button
            variant={voiceMode ? "default" : "outline"}
            size="sm"
            onClick={() => setVoiceMode(!voiceMode)}
            className="ml-2"
            title={voiceMode ? "Switch to Text Mode" : "Switch to Voice Mode"}
          >
            {voiceMode ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {displayMessages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              {voiceMode ? (
                <>
                  <p>Voice Mode Active</p>
                  <p className="text-xs mt-1">
                    Hold the mic button to speak with Synaptic
                  </p>
                </>
              ) : (
                <>
                  <p>Start a conversation with Synaptic</p>
                  <p className="text-xs mt-1">
                    Try: patterns, history, status, search [topic]
                  </p>
                </>
              )}
            </div>
          )}
          {displayMessages.map((msg, index) => {
            const isBoxMessage = containsBoxDrawing(msg.message);
            const isNew = index === displayMessages.length - 1;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "aaron" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`rounded-lg ${
                    isBoxMessage
                      ? "max-w-[95%] p-0" // Box messages get more width, padding handled by CSS
                      : `max-w-[80%] p-3 ${
                          msg.sender === "aaron"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`
                  }`}
                >
                  {!isBoxMessage && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">
                        {msg.sender === "aaron" ? "You" : "🧠 Synaptic"}
                      </span>
                      <span className="text-xs opacity-50">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  <div className="text-sm">
                    {renderMessageContent(msg.message, isNew)}
                  </div>
                  {isBoxMessage && (
                    <div className="flex items-center gap-2 mt-2 px-4 pb-2 text-muted-foreground">
                      <span className="text-xs font-semibold text-primary/80">
                        🧠 8th Intelligence
                      </span>
                      <span className="text-xs opacity-50">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        {voiceMode ? (
          /* Voice Mode UI - Hold to Talk */
          <div className="flex items-center justify-center gap-4 py-2">
            <Button
              className={`w-16 h-16 rounded-full transition-all duration-200 ${
                voiceState === "recording"
                  ? "bg-red-500 hover:bg-red-600 scale-110 shadow-lg shadow-red-500/50"
                  : voiceState === "processing"
                  ? "bg-yellow-500 hover:bg-yellow-600 cursor-wait"
                  : voiceState === "speaking"
                  ? "bg-blue-500 hover:bg-blue-600 cursor-wait"
                  : "bg-primary hover:bg-primary/90"
              }`}
              disabled={!voiceConnected || (voiceState !== "idle" && voiceState !== "recording")}
              onPointerDown={() => voiceState === "idle" && startRecording()}
              onPointerUp={() => voiceState === "recording" && stopRecording()}
              onPointerLeave={() => voiceState === "recording" && stopRecording()}
            >
              {voiceState === "recording" ? (
                <Mic className="h-6 w-6 animate-pulse text-white" />
              ) : voiceState === "processing" ? (
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              ) : voiceState === "speaking" ? (
                <Volume2 className="h-6 w-6 animate-pulse text-white" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
            <div className="text-sm text-muted-foreground min-w-[100px]">
              {voiceState === "idle" && "Hold to speak"}
              {voiceState === "recording" && (
                <span className="text-red-500 font-medium">Recording...</span>
              )}
              {voiceState === "processing" && (
                <span className="text-yellow-500 font-medium">Processing...</span>
              )}
              {voiceState === "speaking" && (
                <span className="text-blue-500 font-medium">Speaking...</span>
              )}
            </div>
          </div>
        ) : (
          /* Text Mode UI - Standard Input */
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Talk to Synaptic..."
              disabled={!connected}
              className="flex-1"
            />
            <Button onClick={send} disabled={!connected || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
