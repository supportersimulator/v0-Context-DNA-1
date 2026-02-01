"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Send, Zap, Brain, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessage {
  id: string;
  timestamp: string;
  sender: "aaron" | "synaptic";
  message: string;
}

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

export function SynapticChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  useEffect(() => {
    // Auto-scroll to bottom
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
            Full Memory Access • WebSocket • Sub-10ms
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {connecting ? (
            <span className="text-yellow-500 text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 animate-pulse" />
              Connecting...
            </span>
          ) : connected ? (
            <span className="text-green-500 text-xs flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Connected
            </span>
          ) : (
            <span className="text-red-500 text-xs">Disconnected</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Start a conversation with Synaptic</p>
              <p className="text-xs mt-1">
                Try: patterns, history, status, search [topic]
              </p>
            </div>
          )}
          {messages.map((msg, index) => {
            const isBoxMessage = containsBoxDrawing(msg.message);
            const isNew = index === messages.length - 1;

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

      {/* Input */}
      <div className="p-4 border-t border-border">
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
      </div>
    </div>
  );
}
