'use client';

import React from "react"

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { consultProfessor } from '@/lib/api';
import type { ConsultResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Loader2 } from 'lucide-react';

const QUICK_CHIPS = ['debugging', 'deployment', 'database', 'api', 'performance'];

export function ProfessorView() {
  const [task, setTask] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ConsultResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleConsult = async () => {
    if (!task.trim() || isLoading) return;
    
    setIsLoading(true);
    try {
      const result = await consultProfessor(task);
      setResponse(result);
    } catch (error) {
      console.error('Failed to consult:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (chip: string) => {
    setTask((prev) => {
      if (prev.toLowerCase().includes(chip)) return prev;
      return prev ? `${prev} ${chip}` : chip;
    });
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(section);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAllToClipboard = async () => {
    if (!response) return;
    const { context } = response;
    const formatted = `THE ONE THING:\n${context.the_one_thing}\n\nLANDMINES:\n${context.landmines.map((l) => `- ${l}`).join('\n')}\n\nPATTERNS:\n${context.patterns.map((p) => `- ${p}`).join('\n')}\n\nCONTEXT:\n${context.context}`;
    await navigator.clipboard.writeText(formatted);
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Ask the Professor</h1>
        <p className="text-sm text-muted-foreground">
          Get wisdom from your accumulated learnings
        </p>
      </div>

      {/* Input Area */}
      <div className="space-y-4">
        <div className="relative">
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What are you working on?"
            className="bg-card border-border min-h-[120px] resize-none text-base p-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                handleConsult();
              }
            }}
          />
        </div>

        {/* Quick Chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-all',
                'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
              )}
            >
              {chip}
            </button>
          ))}
        </div>

        <Button
          onClick={handleConsult}
          disabled={!task.trim() || isLoading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium py-6"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Consulting...
            </>
          ) : (
            'Get Wisdom'
          )}
        </Button>
      </div>

      {/* Response Area */}
      {response && (
        <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          {/* Copy All Button */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={copyAllToClipboard}
              className="text-xs bg-transparent"
            >
              {copied === 'all' ? (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy All
                </>
              )}
            </Button>
          </div>

          {/* The One Thing */}
          <ResponseSection
            icon="🎯"
            title="THE ONE THING"
            variant="highlight"
            onCopy={() => copyToClipboard(response.context.the_one_thing, 'one-thing')}
            copied={copied === 'one-thing'}
          >
            <p className="text-foreground font-medium">{response.context.the_one_thing}</p>
          </ResponseSection>

          {/* Landmines */}
          {response.context.landmines.length > 0 && (
            <ResponseSection
              icon="💣"
              title="LANDMINES"
              variant="danger"
              onCopy={() => copyToClipboard(response.context.landmines.join('\n'), 'landmines')}
              copied={copied === 'landmines'}
            >
              <ul className="space-y-2">
                {response.context.landmines.map((landmine, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-destructive">•</span>
                    {landmine}
                  </li>
                ))}
              </ul>
            </ResponseSection>
          )}

          {/* Patterns */}
          {response.context.patterns.length > 0 && (
            <ResponseSection
              icon="🔄"
              title="THE PATTERN"
              variant="info"
              onCopy={() => copyToClipboard(response.context.patterns.join('\n'), 'patterns')}
              copied={copied === 'patterns'}
            >
              <ul className="space-y-2">
                {response.context.patterns.map((pattern, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-mono text-foreground">
                    <span className="text-info">→</span>
                    {pattern}
                  </li>
                ))}
              </ul>
            </ResponseSection>
          )}

          {/* Context */}
          {response.context.context && (
            <ResponseSection
              icon="📍"
              title="CONTEXT"
              variant="muted"
              onCopy={() => copyToClipboard(response.context.context, 'context')}
              copied={copied === 'context'}
            >
              <p className="text-sm text-muted-foreground">{response.context.context}</p>
            </ResponseSection>
          )}
        </div>
      )}
    </div>
  );
}

interface ResponseSectionProps {
  icon: string;
  title: string;
  variant: 'highlight' | 'danger' | 'info' | 'muted';
  children: React.ReactNode;
  onCopy: () => void;
  copied: boolean;
}

function ResponseSection({ icon, title, variant, children, onCopy, copied }: ResponseSectionProps) {
  return (
    <div
      className={cn(
        'glass rounded-lg p-4 border-l-2',
        variant === 'highlight' && 'border-l-primary bg-primary/5',
        variant === 'danger' && 'border-l-destructive bg-destructive/5',
        variant === 'info' && 'border-l-info bg-info/5',
        variant === 'muted' && 'border-l-muted-foreground'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </div>
        <button
          onClick={onCopy}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          {copied ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>
      {children}
    </div>
  );
}
