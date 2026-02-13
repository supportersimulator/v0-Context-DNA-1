"use client";

/**
 * Unified Synaptic Chat View - Voice + Text Hybrid Interface
 *
 * COWORK UI STYLING: Warm coral accent (#d97857) on dark background
 *
 * UX Pattern (inspired by ChatGPT voice):
 * - Single unified chat thread for both voice and text
 * - Voice input: Speak -> process silently -> show only Synaptic's response
 * - Text input: Type -> show user message -> show Synaptic's response
 * - Both modes play TTS for Synaptic's responses
 * - No transcription clutter for voice input
 *
 * Mode Switcher: Option A
 * - Segmented pill control: [Synaptic | Claude]
 * - Synaptic: Local LLM (Qwen3-14B) via WebSocket
 * - Claude: Anthropic API (Claude Sonnet 4.5) via SSE streaming
 * - Conversation persists across mode switches
 * - Each message tagged with model metadata
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Brain, MessageCircle, Mic, Volume2, Loader2, Sun, Moon, Code2, AudioLines, Sparkles, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { parseAnthropicSSE, sanitizeMessagesForClaude } from "@/lib/chat/claude-stream";

// =============================================================================
// Theme Configuration - Warm Coral Cowork UI
// =============================================================================
type ThemeMode = "dark" | "light";

const THEME_KEY = "synaptic_theme_mode";
const DEV_MODE_KEY = "synaptic_dev_mode";
const CHAT_MODE_KEY = "synaptic_chat_mode";

// Warm coral accent used in both modes
const ACCENT = {
  primary: "#d97857",      // Warm coral
  hover: "#e8896a",        // Lighter coral
  muted: "rgba(217,120,87,0.15)",
  glow: "rgba(217,120,87,0.3)",
};

// Claude violet accent
const CLAUDE_ACCENT = {
  primary: "#a78bfa",      // Violet-400
  hover: "#c4b5fd",        // Violet-300
  muted: "rgba(167,139,250,0.15)",
  glow: "rgba(167,139,250,0.3)",
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

type ChatMode = "synaptic" | "claude";

interface ChatMessage {
  id: string;
  timestamp: string;
  sender: "user" | "synaptic";
  content: string;
  source: "text" | "voice"; // Track input method
  fullText?: string; // Full markdown text for dev mode
  isDevMode?: boolean; // Whether this response was in dev mode
  model?: string; // Which model generated this message
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
// Claude Chat Persistence (localStorage, matches existing pattern)
// =============================================================================

const CLAUDE_STORAGE_KEY = "contextdna_claude_chat_in_synaptic";
const MAX_STORED = 50;

function loadClaudeMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLAUDE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveClaudeMessages(msgs: ChatMessage[]) {
  try {
    const toSave = msgs.filter(m => m.content.trim() !== "");
    localStorage.setItem(CLAUDE_STORAGE_KEY, JSON.stringify(toSave.slice(-MAX_STORED)));
  } catch {
    // quota exceeded
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function SynapticChatView() {
  // Theme state (persisted to localStorage)
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Chat mode: synaptic (local LLM) vs claude (Anthropic API)
  const [chatMode, setChatMode] = useState<ChatMode>("synaptic");

  // Dev mode: VOICE (terse, spoken) vs DEV (full visual + brief narrator)
  const [devMode, setDevMode] = useState(false);

  // Chat state - separate message lists for each mode
  const [synapticMessages, setSynapticMessages] = useState<ChatMessage[]>([]);
  const [claudeMessages, setClaudeMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  // Connection state
  const [textConnected, setTextConnected] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [browserVoiceFallback, setBrowserVoiceFallback] = useState(false);

  // Claude state
  const [claudeStreaming, setClaudeStreaming] = useState(false);
  const [claudeApiAvailable, setClaudeApiAvailable] = useState<boolean | null>(null);

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  // Permission assistant state
  const [pendingPermissions, setPendingPermissions] = useState<Array<{
    tool_use_id: string;
    tool_name: string;
    explanation: string;
    detected_at: number;
  }>>([]);

  // Get current theme styles
  const t = THEMES[theme];

  // Active accent based on mode
  const activeAccent = chatMode === "claude" ? CLAUDE_ACCENT : ACCENT;

  // Current messages based on mode
  const messages = chatMode === "synaptic" ? synapticMessages : claudeMessages;
  const setMessages = chatMode === "synaptic" ? setSynapticMessages : setClaudeMessages;

  // Refs
  const textWsRef = useRef<WebSocket | null>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const claudeAbortRef = useRef<AbortController | null>(null);
  const voiceReconnectCount = useRef(0);
  const browserRecognitionRef = useRef<any>(null);

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
  // Text Chat WebSocket (Synaptic mode)
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
        setSynapticMessages(
          data.messages.map((m: any, i: number) => ({
            id: `hist-${i}`,
            timestamp: m.timestamp,
            sender: m.sender === "aaron" ? "user" : "synaptic",
            content: m.message,
            source: "text" as const,
            model: "Qwen3-14B",
          }))
        );
      } else if (data.type === "message") {
        // Only add if it's from Synaptic (user messages already added locally)
        if (data.sender === "synaptic") {
          setSynapticMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              timestamp: data.timestamp,
              sender: "synaptic",
              content: data.message,
              source: "text",
              model: "Qwen3-14B",
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
      voiceReconnectCount.current = 0;
      setBrowserVoiceFallback(false);
      console.log("[Voice] Connected");
    };

    ws.onclose = () => {
      setVoiceConnected(false);
      setVoiceState("idle");
      voiceReconnectCount.current++;
      // After 3 failed reconnects, activate browser voice fallback
      if (voiceReconnectCount.current >= 3 && !browserVoiceFallback) {
        console.log("[Voice] Server unreachable — activating browser voice fallback");
        setBrowserVoiceFallback(true);
      } else if (!browserVoiceFallback) {
        setTimeout(connectVoice, 3000);
      }
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
          setSynapticMessages(prev => [...prev, {
            id: `voice-${Date.now()}`,
            timestamp: new Date().toISOString(),
            sender: "synaptic",
            content: data.text,
            source: "voice",
            fullText: data.full_text, // Full markdown when dev_mode=true
            isDevMode: data.dev_mode,
            model: "Qwen3-14B",
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
            setSynapticMessages(prev => [...prev, {
              id: `sys-${Date.now()}`,
              timestamp: new Date().toISOString(),
              sender: "synaptic",
              content: `Switched to ${newMode ? "Dev Mode" : "Voice Mode"} (${newMode ? "full visual output" : "terse spoken output"})`,
              source: "voice",
              model: "Qwen3-14B",
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
  // Browser Voice Fallback (Web Speech API — no server needed)
  // ==========================================================================
  // Activated when synaptic_chat_server.py is unreachable after 3 retries.
  // Uses browser-native STT + TTS, sends text to text WebSocket for LLM response.

  const browserSpeechSupported = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );

  const startBrowserListening = useCallback(() => {
    if (!browserSpeechSupported || voiceState !== "idle") return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setVoiceState("listening");

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceState("processing");

      // Send transcript as text message through the text WebSocket
      if (textWsRef.current?.readyState === WebSocket.OPEN && transcript.trim()) {
        textWsRef.current.send(JSON.stringify({
          type: "message",
          content: transcript.trim(),
          sender: "aaron",
        }));

        // Add user message to chat (voice input shown as text)
        setSynapticMessages(prev => [...prev, {
          id: `browser-voice-${Date.now()}`,
          timestamp: new Date().toISOString(),
          sender: "user",
          content: transcript.trim(),
          source: "voice",
          model: "Browser STT",
        }]);
      }
      setVoiceState("idle");
    };

    recognition.onerror = () => setVoiceState("idle");
    recognition.onend = () => {
      if (voiceState === "listening") setVoiceState("idle");
    };

    browserRecognitionRef.current = recognition;
    recognition.start();
  }, [browserSpeechSupported, voiceState, textConnected]);

  const stopBrowserListening = useCallback(() => {
    if (browserRecognitionRef.current) {
      browserRecognitionRef.current.stop();
      browserRecognitionRef.current = null;
    }
  }, []);

  /** Browser TTS — speak Synaptic's response when in fallback mode */
  const browserSpeak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.onend = () => setVoiceState("idle");
    setVoiceState("speaking");
    window.speechSynthesis.speak(utterance);
  }, []);

  // In fallback mode, auto-speak Synaptic responses
  useEffect(() => {
    if (!browserVoiceFallback) return;
    const lastMsg = synapticMessages[synapticMessages.length - 1];
    if (lastMsg?.sender === "synaptic" && lastMsg.source === "text") {
      // Only speak recent messages (within last 2 seconds)
      const msgAge = Date.now() - new Date(lastMsg.timestamp).getTime();
      if (msgAge < 2000) {
        browserSpeak(lastMsg.content);
      }
    }
  }, [synapticMessages, browserVoiceFallback, browserSpeak]);

  // ==========================================================================
  // Send Text Message (Synaptic mode - via WebSocket)
  // ==========================================================================

  const sendSynapticMessage = useCallback(() => {
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
    setSynapticMessages(prev => [...prev, userMessage]);

    // Send to server
    textWsRef.current.send(JSON.stringify({ message: input.trim() }));
    setInput("");
  }, [input]);

  // ==========================================================================
  // Send Text Message (Claude mode - via SSE streaming)
  // ==========================================================================

  const sendClaudeMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || claudeStreaming) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sender: "user",
      content: text,
      source: "text",
    };

    const assistantMsg: ChatMessage = {
      id: `claude-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sender: "synaptic", // reuse "synaptic" sender for rendering (styled differently via model tag)
      content: "",
      source: "text",
      model: "Claude Sonnet 4.5",
    };

    const updated = [...claudeMessages, userMsg];
    setClaudeMessages([...updated, assistantMsg]);
    setInput("");
    setClaudeStreaming(true);

    // Build API messages - sanitize for Anthropic requirements
    const apiMessages = sanitizeMessagesForClaude(
      updated
        .filter(m => !m.content.startsWith("Error:"))
        .slice(-20)
        .map(m => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.content,
        }))
    );

    try {
      claudeAbortRef.current = new AbortController();

      const res = await fetch("/api/claude/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          system: "You are Claude, an AI assistant by Anthropic. You are helpful, harmless, and honest. You are embedded inside the Context DNA IDE — a VS Code-style admin dashboard for managing AI memory systems. Be concise and technical.",
        }),
        signal: claudeAbortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setClaudeMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${errText || res.statusText}` }
              : m
          )
        );
        setClaudeStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      let accumulated = "";

      for await (const chunk of parseAnthropicSSE(reader)) {
        accumulated += chunk;
        setClaudeMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id ? { ...m, content: accumulated } : m
          )
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
      } else {
        setClaudeMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${String(err)}` }
              : m
          )
        );
      }
    } finally {
      setClaudeStreaming(false);
      claudeAbortRef.current = null;
    }
  }, [input, claudeMessages, claudeStreaming]);

  // ==========================================================================
  // Unified send handler
  // ==========================================================================

  const sendTextMessage = useCallback(() => {
    if (chatMode === "claude") {
      sendClaudeMessage();
    } else {
      sendSynapticMessage();
    }
  }, [chatMode, sendClaudeMessage, sendSynapticMessage]);

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
  }, [synapticMessages, claudeMessages, chatMode]);

  // Check Claude API availability
  useEffect(() => {
    fetch("/api/claude/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    }).then(res => {
      setClaudeApiAvailable(res.status !== 503);
    }).catch(() => {
      setClaudeApiAvailable(false);
    });
  }, []);

  // Load Claude messages from localStorage
  useEffect(() => {
    setClaudeMessages(loadClaudeMessages());
  }, []);

  // Persist Claude messages (skip during streaming)
  useEffect(() => {
    if (!claudeStreaming) saveClaudeMessages(claudeMessages);
  }, [claudeMessages, claudeStreaming]);

  // ==========================================================================
  // Permission Assistant — poll for pending tool approvals
  // ==========================================================================

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const pollPermissions = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8080/api/permissions/pending");
        if (res.ok) {
          const data = await res.json();
          const prev = pendingPermissions;
          const next = data.pending || [];
          setPendingPermissions(next);

          // Auto-TTS for NEW permissions (speak explanation once)
          if (next.length > prev.length && chatMode === "synaptic") {
            const newest = next[next.length - 1];
            if (newest?.explanation) {
              browserSpeak?.(newest.explanation);
            }
          }
        }
      } catch {
        // agent_service down — ignore
      }
    };

    // Poll every 3s
    pollPermissions();
    interval = setInterval(pollPermissions, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMode, pendingPermissions.length]);

  const handlePermissionAction = useCallback(async (toolUseId: string, action: "approve" | "deny") => {
    try {
      await fetch(`http://127.0.0.1:8080/api/permissions/${toolUseId}/${action}`, { method: "POST" });
      setPendingPermissions(prev => prev.filter(p => p.tool_use_id !== toolUseId));
    } catch {
      // silent
    }
  }, []);

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
    // Load chat mode from localStorage
    const savedChatMode = localStorage.getItem(CHAT_MODE_KEY) as ChatMode | null;
    if (savedChatMode === "synaptic" || savedChatMode === "claude") {
      setChatMode(savedChatMode);
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

  // Switch chat mode
  const switchChatMode = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    localStorage.setItem(CHAT_MODE_KEY, mode);
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================

  const isConnected = chatMode === "synaptic"
    ? (textConnected || voiceConnected)
    : (claudeApiAvailable === true);

  const isBusy = chatMode === "synaptic"
    ? voiceState !== "idle"
    : claudeStreaming;

  const canSend = chatMode === "synaptic"
    ? (textConnected && voiceState === "idle" && input.trim() !== "")
    : (!claudeStreaming && claudeApiAvailable !== false && input.trim() !== "");

  return (
    <div className={cn("flex flex-col h-full transition-colors duration-300", t.bg)}>
      {/* Header */}
      <div className={cn("flex items-center gap-3 p-4 border-b", t.border, t.bgSecondary)}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200"
          style={{ backgroundColor: activeAccent.muted }}
        >
          {chatMode === "claude" ? (
            <Sparkles className="h-5 w-5" style={{ color: CLAUDE_ACCENT.primary }} />
          ) : (
            <Brain className="h-5 w-5" style={{ color: ACCENT.primary }} />
          )}
        </div>
        <div className="flex-1">
          <h2 className={cn("font-semibold", t.text)}>
            {chatMode === "claude" ? "Claude" : "Synaptic"}
          </h2>
          <p className={cn("text-xs", t.textMuted)}>
            {chatMode === "claude" ? (
              claudeStreaming ? "Responding..." :
              claudeApiAvailable === false ? "API key not configured" :
              "Anthropic Claude \u2022 Cloud AI"
            ) : (
              voiceState === "listening" ? "Listening..." :
              voiceState === "processing" ? "Thinking..." :
              voiceState === "speaking" ? "Speaking..." :
              "Voice + Text \u2022 Hold mic or type"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Dev mode toggle - only visible in Synaptic mode */}
          {chatMode === "synaptic" && (
            <button
              onClick={toggleDevMode}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative",
                t.bgMuted, t.bgHover,
                devMode && "ring-2 ring-offset-1"
              )}
              style={devMode ? { '--tw-ring-color': ACCENT.primary, '--tw-ring-offset-color': 'transparent' } as React.CSSProperties : {}}
              title={devMode ? "Dev mode: Full visual + brief narrator" : "Voice mode: Terse spoken output"}
            >
              {devMode ? (
                <Code2 className="h-4 w-4" style={{ color: ACCENT.primary }} />
              ) : (
                <AudioLines className="h-4 w-4" style={{ color: ACCENT.primary }} />
              )}
            </button>
          )}
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
              <Sun className="h-4 w-4" style={{ color: activeAccent.primary }} />
            ) : (
              <Moon className="h-4 w-4" style={{ color: activeAccent.primary }} />
            )}
          </button>
          {/* Connection indicator */}
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected
                ? "bg-emerald-500"
                : connecting && chatMode === "synaptic"
                ? "animate-pulse"
                : "bg-red-500"
            )} style={!isConnected && connecting && chatMode === "synaptic" ? { backgroundColor: ACCENT.primary } : {}} />
            <span className={cn("text-xs", t.textMuted)}>
              {isConnected ? "Connected" :
               chatMode === "claude" && claudeApiAvailable === false ? "No API key" :
               connecting ? "Connecting..." : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Mode Switcher — Sleek segmented pill */}
      <div className={cn("flex items-center justify-center py-2 border-b", t.border)} style={{ backgroundColor: theme === "dark" ? "rgba(15,15,18,0.8)" : "rgba(250,248,246,0.8)" }}>
        <div
          className="inline-flex items-center rounded-full p-0.5 gap-0"
          style={{ backgroundColor: theme === "dark" ? "#1a1a20" : "#eae6e2" }}
        >
          {/* Synaptic option */}
          <button
            onClick={() => switchChatMode("synaptic")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200",
              chatMode === "synaptic"
                ? "shadow-sm"
                : "hover:opacity-80"
            )}
            style={
              chatMode === "synaptic"
                ? {
                    backgroundColor: theme === "dark" ? "#2a2a32" : "#ffffff",
                    color: "#22c55e",
                  }
                : {
                    backgroundColor: "transparent",
                    color: theme === "dark" ? "#6b6b75" : "#999",
                  }
            }
          >
            <Brain className="h-3 w-3" />
            <span>Synaptic</span>
            <span className="text-[10px] opacity-60 hidden sm:inline">Qwen3-14B</span>
          </button>

          {/* Claude option */}
          <button
            onClick={() => switchChatMode("claude")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200",
              chatMode === "claude"
                ? "shadow-sm"
                : "hover:opacity-80"
            )}
            style={
              chatMode === "claude"
                ? {
                    backgroundColor: theme === "dark" ? "#2a2a32" : "#ffffff",
                    color: "#22c55e",
                  }
                : {
                    backgroundColor: "transparent",
                    color: theme === "dark" ? "#6b6b75" : "#999",
                  }
            }
          >
            <Sparkles className="h-3 w-3" />
            <span>Claude</span>
            <span className="text-[10px] opacity-60 hidden sm:inline">Sonnet 4.5</span>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className={cn("text-center py-12", t.textMuted)}>
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: activeAccent.muted }}
              >
                {chatMode === "claude" ? (
                  <Sparkles className="h-8 w-8" style={{ color: CLAUDE_ACCENT.primary, opacity: 0.7 }} />
                ) : (
                  <MessageCircle className="h-8 w-8" style={{ color: ACCENT.primary, opacity: 0.7 }} />
                )}
              </div>
              <p className={cn("text-lg font-medium mb-2", t.text)}>
                {chatMode === "claude" ? "Chat with Claude" : "Talk to Synaptic"}
              </p>
              <p className="text-sm opacity-70">
                {chatMode === "claude"
                  ? "Cloud-powered AI for complex tasks"
                  : "Hold the mic to speak, or type a message"}
              </p>
              {chatMode === "claude" && claudeApiAvailable === false && (
                <div
                  className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171" }}
                >
                  <span>Add ANTHROPIC_API_KEY to enable</span>
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              const isBoxMessage = isSynapticBoxMessage(msg.content);
              const isClaude = msg.model === "Claude Sonnet 4.5";
              const bubbleAccent = isClaude ? CLAUDE_ACCENT : ACCENT;

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
                        ? cn("px-4 py-3", isClaude ? "bg-[#a78bfa] text-white" : t.userBubble)
                        : cn("px-4 py-3", t.synapticBubble)
                    )}
                    style={isBoxMessage ? {
                      backgroundColor: ACCENT.muted,
                      borderColor: `rgba(217,120,87,0.3)`,
                    } : {}}
                  >
                    {/* Sender indicator for assistant messages (non-box) */}
                    {msg.sender === "synaptic" && !isBoxMessage && (
                      <div className={cn("flex items-center gap-2 mb-1 text-xs", t.textMuted)}>
                        {isClaude ? (
                          <Sparkles className="h-3 w-3" style={{ color: CLAUDE_ACCENT.primary }} />
                        ) : (
                          <Brain className="h-3 w-3" style={{ color: ACCENT.primary }} />
                        )}
                        <span>{isClaude ? "Claude" : "Synaptic"}</span>
                        {msg.source === "voice" && !isClaude && (
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
                    ) : msg.content ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      // Streaming placeholder (empty content during Claude streaming)
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" style={{ color: bubbleAccent.primary }} />
                        <span className={cn("text-sm", t.textMuted)}>Thinking...</span>
                      </div>
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

          {/* Permission approval cards */}
          {pendingPermissions.map((perm) => (
            <div key={perm.tool_use_id} className="flex justify-start">
              <div
                className="rounded-2xl px-4 py-3 max-w-[85%] border"
                style={{
                  backgroundColor: "rgba(251,191,36,0.08)",
                  borderColor: "rgba(251,191,36,0.3)",
                }}
              >
                <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: "#f59e0b" }}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="font-medium">Permission Request</span>
                  <span className={cn("ml-auto", t.textMuted)}>
                    {perm.tool_name}
                  </span>
                </div>
                <p className="text-sm mb-3" style={{ color: t === THEMES.dark ? "#e5e5e5" : "#1a1a1a" }}>
                  {perm.explanation || `Claude wants to use ${perm.tool_name}`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePermissionAction(perm.tool_use_id, "approve")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: "rgba(34,197,94,0.15)",
                      color: "#22c55e",
                    }}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Approve
                  </button>
                  <button
                    onClick={() => handlePermissionAction(perm.tool_use_id, "deny")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: "rgba(239,68,68,0.15)",
                      color: "#ef4444",
                    }}
                  >
                    <ShieldX className="h-3 w-3" />
                    Deny
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Processing indicator (Synaptic voice mode) */}
          {chatMode === "synaptic" && voiceState === "processing" && (
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

      {/* Input Area - Hybrid Voice + Text with accent color */}
      <div className={cn("p-4 border-t backdrop-blur", t.border, t.bgSecondary)}>
        <div className="max-w-3xl mx-auto">
          {/* Browser voice fallback banner */}
          {chatMode === "synaptic" && browserVoiceFallback && voiceState === "idle" && (
            <div
              className="flex items-center justify-center gap-2 mb-3 py-2 rounded-lg border text-xs"
              style={{
                backgroundColor: "rgba(251,191,36,0.08)",
                borderColor: "rgba(251,191,36,0.25)",
                color: "rgb(251,191,36)",
              }}
            >
              <AudioLines className="h-3.5 w-3.5" />
              <span>Browser voice mode — server offline</span>
            </div>
          )}

          {/* Voice recording indicator (Synaptic mode only) */}
          {chatMode === "synaptic" && voiceState === "listening" && (
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

          {chatMode === "synaptic" && voiceState === "speaking" && (
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
            {/* Voice Button - only visible in Synaptic mode */}
            {chatMode === "synaptic" && (
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
                disabled={
                  (!voiceConnected && !(browserVoiceFallback && browserSpeechSupported))
                  || (voiceState !== "idle" && voiceState !== "listening")
                }
                onMouseDown={() => {
                  if (voiceState !== "idle") return;
                  browserVoiceFallback ? startBrowserListening() : startRecording();
                }}
                onMouseUp={() => {
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
                onMouseLeave={() => {
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (voiceState !== "idle") return;
                  browserVoiceFallback ? startBrowserListening() : startRecording();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
                onPointerDown={() => {
                  if (voiceState !== "idle") return;
                  browserVoiceFallback ? startBrowserListening() : startRecording();
                }}
                onPointerUp={() => {
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
                onPointerLeave={() => {
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
                onPointerCancel={() => {
                  if (voiceState !== "listening") return;
                  browserVoiceFallback ? stopBrowserListening() : stopRecording();
                }}
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
            )}

            {/* Text Input */}
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  chatMode === "claude"
                    ? (claudeApiAvailable === false ? "API key required..." : "Ask Claude anything...")
                    : "Type a message..."
                }
                disabled={
                  chatMode === "synaptic"
                    ? (!textConnected || voiceState !== "idle")
                    : (claudeStreaming || claudeApiAvailable === false)
                }
                className={cn(
                  "pr-12 h-12 rounded-full border transition-colors",
                  t.inputBg, t.text, t.border,
                  "focus:outline-none"
                )}
                style={{
                  // @ts-ignore - custom focus style
                  "--tw-ring-color": activeAccent.muted,
                }}
              />
              <Button
                size="sm"
                onClick={sendTextMessage}
                disabled={!canSend}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full p-0 border-0"
                style={{ backgroundColor: activeAccent.primary }}
              >
                {claudeStreaming && chatMode === "claude" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Send className="h-4 w-4 text-white" />
                )}
              </Button>
            </div>
          </div>

          {/* Help text */}
          <p className={cn("text-xs text-center mt-3", t.textMuted)}>
            {chatMode === "claude" ? (
              claudeStreaming ? "Claude is responding..." : "Claude Sonnet 4.5 \u2022 Streaming responses"
            ) : (
              voiceState === "idle" ? (
                browserVoiceFallback
                  ? "Browser voice mode (offline) \u2022 Hold mic to speak"
                  : "Hold mic to speak \u2022 Type to chat"
              ) : voiceState === "listening" ? (
                browserVoiceFallback
                  ? "Listening via browser... Release to send"
                  : "Release when done speaking"
              ) : voiceState === "processing" ? (
                "Processing your request..."
              ) : (
                "Synaptic is responding..."
              )
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
