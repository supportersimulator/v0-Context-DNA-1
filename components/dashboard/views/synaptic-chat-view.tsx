"use client";

/**
 * Unified Synaptic Chat View - Voice + Text Hybrid Interface
 *
 * COWORK UI STYLING: Warm coral accent (#d97857) on dark background
 *
 * UX Pattern (inspired by ChatGPT voice):
 * - Single unified chat thread for both voice and text
 * - Voice input: Speak → process silently → show only Synaptic's response
 * - Text input: Type → show user message → show Synaptic's response
 * - Both modes play TTS for Synaptic's responses
 * - No transcription clutter for voice input
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Brain, MessageCircle, Mic, Volume2, Loader2, Sun, Moon, Code2, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// =============================================================================
// Theme Configuration - Warm Coral Cowork UI
// =============================================================================
type ThemeMode = "dark" | "light";

const THEME_KEY = "synaptic_theme_mode";
const DEV_MODE_KEY = "synaptic_dev_mode";

// Warm coral accent used in both modes
const ACCENT = {
  primary: "#d97857",      // Warm coral
  hover: "#e8896a",        // Lighter coral
  muted: "rgba(217,120,87,0.15)",
  glow: "rgba(217,120,87,0.3)",
};

// Theme-specific styles
const THEMES = {
  dark: {
    bg: "bg-[#0f0f12]",
    bgSecondary: "bg-[#161619]",
    bgHover: "hover:bg-[#1e1e22]",
    bgMuted: "bg-[#1e1e22]",
    text: "text-[#f5f5f5]",
    textMuted: "text-[#a0a0a5]",
    border: "border-[#2a2a2e]",
    userBubble: "bg-[#d97857] text-white",
    synapticBubble: "bg-[#1e1e22] text-[#f5f5f5]",
    inputBg: "bg-[#1e1e22]/80",
  },
  light: {
    bg: "bg-[#faf8f6]",
    bgSecondary: "bg-white",
    bgHover: "hover:bg-[#f0ece8]",
    bgMuted: "bg-[#f5f1ed]",
    text: "text-[#1a1a1a]",
    textMuted: "text-[#6b6b6b]",
    border: "border-[#e5e0db]",
    userBubble: "bg-[#d97857] text-white",
    synapticBubble: "bg-white text-[#1a1a1a] border border-[#e5e0db]",
    inputBg: "bg-white",
  },
};

// Import session token getter for WebSocket auth
import { getVoiceSessionToken } from "@/components/auth/voice-gate";

// =============================================================================
// Types
// =============================================================================

interface ChatMessage {
  id: string;
  timestamp: string;
  sender: "user" | "synaptic";
  content: string;
  source: "text" | "voice"; // Track input method
  fullText?: string; // Full markdown text for dev mode
  isDevMode?: boolean; // Whether this response was in dev mode
}

type VoiceState = "idle" | "listening" | "processing" | "speaking";

// =============================================================================
// Utility Functions
// =============================================================================

// Box-drawing character detection for 8th Intelligence messages
const BOX_DRAWING_REGEX = /[\u2500-\u257F]/;

function containsBoxDrawing(text: string): boolean {
  return BOX_DRAWING_REGEX.test(text);
}

function isSynapticBoxMessage(text: string): boolean {
  const hasBoxChars = containsBoxDrawing(text);
  const hasSynapticMarker = /\[START:\s*Synaptic\s+to\s+(Aaron|Atlas)\]/i.test(text) ||
                            /\[END:\s*Synaptic\s+to\s+(Aaron|Atlas)\]/i.test(text);
  return hasBoxChars && hasSynapticMarker;
}

// WebSocket URL with session token
function getVoiceWebSocketUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8888/voice";
  const hostname = window.location.hostname;
  let baseUrl: string;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    baseUrl = "ws://localhost:8888/voice";
  } else {
    baseUrl = "wss://voice.contextdna.io/voice";
  }

  const sessionToken = getVoiceSessionToken();
  if (sessionToken) {
    return `${baseUrl}?session_token=${encodeURIComponent(sessionToken)}`;
  }

  return baseUrl;
}

function getTextWebSocketUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8888/chat";
  const hostname = window.location.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://localhost:8888/chat";
  }

  return "wss://voice.contextdna.io/chat";
}

// =============================================================================
// Main Component
// =============================================================================

export function SynapticChatView() {
  // Theme state (persisted to localStorage)
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Dev mode: VOICE (terse, spoken) vs DEV (full visual + brief narrator)
  const [devMode, setDevMode] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  // Connection state
  const [textConnected, setTextConnected] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  // Get current theme styles
  const t = THEMES[theme];

  // Refs
  const textWsRef = useRef<WebSocket | null>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ==========================================================================
  // Audio Context
  // ==========================================================================

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play base64-encoded MP3 audio
  const playBase64Audio = useCallback(async (base64Audio: string) => {
    try {
      const audioContext = getAudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => setVoiceState("idle");
      source.start();
    } catch (err) {
      console.error("[Audio] Playback failed:", err);
      setVoiceState("idle");
    }
  }, [getAudioContext]);

  // ==========================================================================
  // Text Chat WebSocket
  // ==========================================================================

  const connectTextChat = useCallback(() => {
    const ws = new WebSocket(getTextWebSocketUrl());

    ws.onopen = () => {
      setTextConnected(true);
      setConnecting(false);
    };

    ws.onclose = () => {
      setTextConnected(false);
      setTimeout(connectTextChat, 3000);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "history") {
        setMessages(
          data.messages.map((m: any, i: number) => ({
            id: `hist-${i}`,
            timestamp: m.timestamp,
            sender: m.sender === "aaron" ? "user" : "synaptic",
            content: m.message,
            source: "text" as const,
          }))
        );
      } else if (data.type === "message") {
        // Only add if it's from Synaptic (user messages already added locally)
        if (data.sender === "synaptic") {
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              timestamp: data.timestamp,
              sender: "synaptic",
              content: data.message,
              source: "text",
            },
          ]);
        }
      }
    };

    textWsRef.current = ws;
  }, []);

  // ==========================================================================
  // Voice WebSocket
  // ==========================================================================

  const connectVoice = useCallback(() => {
    const ws = new WebSocket(getVoiceWebSocketUrl());

    ws.onopen = () => {
      setVoiceConnected(true);
      console.log("[Voice] Connected");
    };

    ws.onclose = () => {
      setVoiceConnected(false);
      setVoiceState("idle");
      setTimeout(connectVoice, 3000);
    };

    ws.onerror = (err) => {
      console.error("[Voice] WebSocket error:", err);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "transcript") {
          // User's speech transcribed - DON'T show in chat (silent processing)
          console.log("[Voice] Transcript (silent):", data.text);
          setVoiceState("processing");
        } else if (data.type === "response") {
          // Synaptic's response - ADD to messages
          // In dev mode, full_text has markdown; content has voice summary
          setMessages(prev => [...prev, {
            id: `voice-${Date.now()}`,
            timestamp: new Date().toISOString(),
            sender: "synaptic",
            content: data.text,
            source: "voice",
            fullText: data.full_text, // Full markdown when dev_mode=true
            isDevMode: data.dev_mode,
          }]);

          // Play TTS audio if present
          if (data.audio && data.audio_format === "mp3") {
            setVoiceState("speaking");
            await playBase64Audio(data.audio);
          } else {
            setVoiceState("idle");
          }
        } else if (data.type === "dev_mode_updated") {
          // Mode switched (via voice command or UI toggle)
          const newMode = data.enabled;
          setDevMode(newMode);
          localStorage.setItem(DEV_MODE_KEY, String(newMode));
          console.log(`[Voice] Mode switched to ${newMode ? "DEV" : "VOICE"} via ${data.trigger || "server"}`);
          // Add system message for visibility
          if (data.trigger === "voice_command") {
            setMessages(prev => [...prev, {
              id: `sys-${Date.now()}`,
              timestamp: new Date().toISOString(),
              sender: "synaptic",
              content: `🎛️ Switched to ${newMode ? "Dev Mode" : "Voice Mode"} (${newMode ? "full visual output" : "terse spoken output"})`,
              source: "voice",
            }]);
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
  }, [playBase64Audio]);

  // ==========================================================================
  // Recording
  // ==========================================================================

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

      // Resume audio context (required on mobile)
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

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
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (voiceWsRef.current?.readyState === WebSocket.OPEN && blob.size > 0) {
          const arrayBuffer = await blob.arrayBuffer();
          voiceWsRef.current.send(arrayBuffer);
          setVoiceState("processing");
        } else {
          setVoiceState("idle");
        }
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setVoiceState("listening");
    } catch (err) {
      console.error("[Voice] Microphone access failed:", err);
      setVoiceState("idle");
    }
  }, [voiceConnected, voiceState]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // ==========================================================================
  // Send Text Message
  // ==========================================================================

  const sendTextMessage = useCallback(() => {
    if (!input.trim() || !textWsRef.current || textWsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Add user message to chat immediately
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sender: "user",
      content: input.trim(),
      source: "text",
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to server
    textWsRef.current.send(JSON.stringify({ message: input.trim() }));
    setInput("");
  }, [input]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Connect on mount
  useEffect(() => {
    connectTextChat();
    connectVoice();

    return () => {
      textWsRef.current?.close();
      voiceWsRef.current?.close();
      audioContextRef.current?.close();
    };
  }, [connectTextChat, connectVoice]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ==========================================================================
  // Theme persistence
  // ==========================================================================

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
    // Load dev mode from localStorage
    const savedDevMode = localStorage.getItem(DEV_MODE_KEY);
    if (savedDevMode === "true") {
      setDevMode(true);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev: ThemeMode) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  // Toggle dev mode and notify server
  const toggleDevMode = useCallback(() => {
    setDevMode((prev) => {
      const next = !prev;
      localStorage.setItem(DEV_MODE_KEY, String(next));
      // Send to voice WebSocket server
      if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
        voiceWsRef.current.send(JSON.stringify({
          type: "set_dev_mode",
          enabled: next
        }));
      }
      console.log(`[Synaptic] Dev mode ${next ? "enabled" : "disabled"} (${next ? "DEV" : "VOICE"} projection)`);
      return next;
    });
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================

  const isConnected = textConnected || voiceConnected;

  return (
    <div className={cn("flex flex-col h-full transition-colors duration-300", t.bg)}>
      {/* Header - Warm coral accent */}
      <div className={cn("flex items-center gap-3 p-4 border-b", t.border, t.bgSecondary)}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: ACCENT.muted }}
        >
          <Brain className="h-5 w-5" style={{ color: ACCENT.primary }} />
        </div>
        <div className="flex-1">
          <h2 className={cn("font-semibold", t.text)}>Synaptic</h2>
          <p className={cn("text-xs", t.textMuted)}>
            {voiceState === "listening" ? "Listening..." :
             voiceState === "processing" ? "Thinking..." :
             voiceState === "speaking" ? "Speaking..." :
             "Voice + Text • Hold mic or type"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Dev mode toggle - VOICE vs DEV projection */}
          <button
            onClick={toggleDevMode}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative",
              t.bgMuted, t.bgHover,
              devMode && "ring-2 ring-offset-1"
            )}
            style={devMode ? { ringColor: ACCENT.primary, ringOffsetColor: 'transparent' } : {}}
            title={devMode ? "Dev mode: Full visual + brief narrator" : "Voice mode: Terse spoken output"}
          >
            {devMode ? (
              <Code2 className="h-4 w-4" style={{ color: ACCENT.primary }} />
            ) : (
              <AudioLines className="h-4 w-4" style={{ color: ACCENT.primary }} />
            )}
          </button>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              t.bgMuted, t.bgHover
            )}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" style={{ color: ACCENT.primary }} />
            ) : (
              <Moon className="h-4 w-4" style={{ color: ACCENT.primary }} />
            )}
          </button>
          {/* Connection indicator */}
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected
                ? "bg-emerald-500"
                : connecting
                ? "animate-pulse"
                : "bg-red-500"
            )} style={!isConnected && connecting ? { backgroundColor: ACCENT.primary } : {}} />
            <span className={cn("text-xs", t.textMuted)}>
              {isConnected ? "Connected" : connecting ? "Connecting..." : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className={cn("text-center py-12", t.textMuted)}>
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: ACCENT.muted }}
              >
                <MessageCircle className="h-8 w-8" style={{ color: ACCENT.primary, opacity: 0.7 }} />
              </div>
              <p className={cn("text-lg font-medium mb-2", t.text)}>Talk to Synaptic</p>
              <p className="text-sm opacity-70">
                Hold the mic to speak, or type a message
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isBoxMessage = isSynapticBoxMessage(msg.content);

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl max-w-[85%]",
                      isBoxMessage
                        ? "p-0 border"
                        : msg.sender === "user"
                        ? cn("px-4 py-3", t.userBubble)
                        : cn("px-4 py-3", t.synapticBubble)
                    )}
                    style={isBoxMessage ? {
                      backgroundColor: ACCENT.muted,
                      borderColor: `rgba(217,120,87,0.3)`,
                    } : {}}
                  >
                    {/* Sender indicator for Synaptic (non-box messages) */}
                    {msg.sender === "synaptic" && !isBoxMessage && (
                      <div className={cn("flex items-center gap-2 mb-1 text-xs", t.textMuted)}>
                        <Brain className="h-3 w-3" style={{ color: ACCENT.primary }} />
                        <span>Synaptic</span>
                        {msg.source === "voice" && (
                          <Volume2 className="h-3 w-3" style={{ color: ACCENT.primary }} />
                        )}
                      </div>
                    )}

                    {/* Message content */}
                    {isBoxMessage ? (
                      <div className="synaptic-box-message p-4">
                        <pre className={cn("whitespace-pre-wrap font-mono text-sm leading-relaxed", t.text)}>
                          {msg.content}
                        </pre>
                      </div>
                    ) : msg.isDevMode && msg.fullText ? (
                      // Dev mode: Show full markdown text with code styling
                      <div className="text-sm">
                        <div className={cn("text-xs mb-2 px-2 py-1 rounded inline-flex items-center gap-1", t.bgMuted)}>
                          <Code2 className="h-3 w-3" style={{ color: ACCENT.primary }} />
                          <span style={{ color: ACCENT.primary }}>Dev Mode</span>
                        </div>
                        <pre className={cn("whitespace-pre-wrap font-mono text-xs leading-relaxed mt-2", t.text)}>
                          {msg.fullText}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {/* Box message footer */}
                    {isBoxMessage && (
                      <div className={cn("flex items-center gap-2 px-4 pb-3 text-xs", t.textMuted)}>
                        <Brain className="h-3 w-3" style={{ color: ACCENT.primary }} />
                        <span>8th Intelligence</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Processing indicator */}
          {voiceState === "processing" && (
            <div className="flex justify-start">
              <div
                className={cn("rounded-2xl px-4 py-3 flex items-center gap-2", t.synapticBubble)}
              >
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: ACCENT.primary }} />
                <span className={cn("text-sm", t.textMuted)}>Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area - Hybrid Voice + Text with warm coral accent */}
      <div className={cn("p-4 border-t backdrop-blur", t.border, t.bgSecondary)}>
        <div className="max-w-3xl mx-auto">
          {/* Voice recording indicator */}
          {voiceState === "listening" && (
            <div
              className="flex items-center justify-center gap-3 mb-4 py-3 rounded-lg border"
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                borderColor: "rgba(239,68,68,0.3)"
              }}
            >
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 font-medium">Listening... Release to send</span>
            </div>
          )}

          {voiceState === "speaking" && (
            <div
              className="flex items-center justify-center gap-3 mb-4 py-3 rounded-lg border"
              style={{
                backgroundColor: ACCENT.muted,
                borderColor: `rgba(217,120,87,0.3)`
              }}
            >
              <Volume2 className="h-4 w-4 animate-pulse" style={{ color: ACCENT.primary }} />
              <span className="font-medium" style={{ color: ACCENT.primary }}>Speaking...</span>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-3">
            {/* Voice Button - Warm coral when idle - Mobile & Desktop compatible */}
            <Button
              size="lg"
              className={cn(
                "w-14 h-14 rounded-full shrink-0 transition-all duration-200 border-0",
                voiceState === "listening"
                  ? "bg-red-500 hover:bg-red-600 scale-110 shadow-lg shadow-red-500/30"
                  : voiceState === "processing"
                  ? "cursor-wait"
                  : voiceState === "speaking"
                  ? "cursor-wait"
                  : ""
              )}
              style={
                voiceState === "idle"
                  ? { backgroundColor: ACCENT.primary, touchAction: "none" }
                  : voiceState === "processing"
                  ? { backgroundColor: ACCENT.hover, touchAction: "none" }
                  : voiceState === "speaking"
                  ? { backgroundColor: ACCENT.primary, touchAction: "none" }
                  : { touchAction: "none" }
              }
              disabled={!voiceConnected || (voiceState !== "idle" && voiceState !== "listening")}
              onMouseDown={() => voiceState === "idle" && startRecording()}
              onMouseUp={() => voiceState === "listening" && stopRecording()}
              onMouseLeave={() => voiceState === "listening" && stopRecording()}
              onTouchStart={(e) => {
                e.preventDefault();
                voiceState === "idle" && startRecording();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                voiceState === "listening" && stopRecording();
              }}
              onTouchCancel={(e) => {
                e.preventDefault();
                voiceState === "listening" && stopRecording();
              }}
              onPointerDown={() => voiceState === "idle" && startRecording()}
              onPointerUp={() => voiceState === "listening" && stopRecording()}
              onPointerLeave={() => voiceState === "listening" && stopRecording()}
              onPointerCancel={() => voiceState === "listening" && stopRecording()}
            >
              {voiceState === "listening" ? (
                <Mic className="h-6 w-6 animate-pulse text-white" />
              ) : voiceState === "processing" ? (
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              ) : voiceState === "speaking" ? (
                <Volume2 className="h-6 w-6 animate-pulse text-white" />
              ) : (
                <Mic className="h-6 w-6 text-white" />
              )}
            </Button>

            {/* Text Input */}
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                disabled={!textConnected || voiceState !== "idle"}
                className={cn(
                  "pr-12 h-12 rounded-full border transition-colors",
                  t.inputBg, t.text, t.border,
                  "focus:outline-none"
                )}
                style={{
                  // @ts-ignore - custom focus style
                  "--tw-ring-color": ACCENT.muted,
                }}
              />
              <Button
                size="sm"
                onClick={sendTextMessage}
                disabled={!textConnected || !input.trim() || voiceState !== "idle"}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full p-0 border-0"
                style={{ backgroundColor: ACCENT.primary }}
              >
                <Send className="h-4 w-4 text-white" />
              </Button>
            </div>
          </div>

          {/* Help text */}
          <p className={cn("text-xs text-center mt-3", t.textMuted)}>
            {voiceState === "idle" ? (
              "Hold mic to speak • Type to chat"
            ) : voiceState === "listening" ? (
              "Release when done speaking"
            ) : voiceState === "processing" ? (
              "Processing your request..."
            ) : (
              "Synaptic is responding..."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
