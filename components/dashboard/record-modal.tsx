'use client';

import React from "react"

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { recordLearning } from '@/lib/api';

type RecordType = 'win' | 'fix' | 'pattern';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: RecordType;
  onSuccess?: () => void;
}

const TYPE_CONFIG: Record<RecordType, { emoji: string; title: string; placeholder: string }> = {
  win: { emoji: '🏆', title: 'Record Win', placeholder: 'What did you accomplish?' },
  fix: { emoji: '🔧', title: 'Record Fix', placeholder: 'What issue did you fix?' },
  pattern: { emoji: '🔄', title: 'Record Pattern', placeholder: 'What pattern did you discover?' },
};

export function RecordModal({ isOpen, onClose, type, onSuccess }: RecordModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = TYPE_CONFIG[type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      await recordLearning(type, { title, content, tags });
      setTitle('');
      setContent('');
      setTagsInput('');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to record:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xl">{config.emoji}</span>
            <h2 className="text-lg font-semibold text-foreground">{config.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={config.placeholder}
              className="bg-input border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="content" className="text-sm font-medium text-foreground">
              Details
            </label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the details..."
              className="bg-input border-border min-h-[120px] resize-none"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="tags" className="text-sm font-medium text-foreground">
              Tags
            </label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="docker, devops, python (comma separated)"
              className="bg-input border-border"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim() || !content.trim()}
              className={cn(
                'bg-primary text-primary-foreground hover:bg-primary/90',
                type === 'win' && 'bg-type-win hover:bg-type-win/90',
                type === 'fix' && 'bg-type-fix hover:bg-type-fix/90',
                type === 'pattern' && 'bg-type-pattern hover:bg-type-pattern/90'
              )}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
