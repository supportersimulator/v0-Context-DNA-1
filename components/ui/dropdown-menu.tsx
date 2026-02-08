'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function DropdownMenu({ open, onOpenChange, children }: DropdownMenuProps) {
  return (
    <div className='relative inline-block'>
      {React.Children.map(children, (child) => child)}
    </div>
  );
}

interface DropdownMenuContentProps {
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

export function DropdownMenuContent({
  align = 'start',
  className,
  children,
}: DropdownMenuContentProps) {
  return (
    <div
      className={cn(
        'absolute z-50 min-w-[200px] rounded-md border border-border bg-background p-2 shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        'top-full mt-1',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <div className='px-2 py-1.5 text-sm font-semibold'>{children}</div>;
}

export function DropdownMenuSeparator() {
  return <div className='my-1 h-px bg-border/50' />;
}

interface DropdownMenuCheckboxItemProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  className,
}: DropdownMenuCheckboxItemProps) {
  return (
    <button
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-2 rounded text-sm hover:bg-secondary/50 transition-colors',
        className
      )}
    >
      <input
        type='checkbox'
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className='w-4 h-4'
      />
      <span>{children}</span>
    </button>
  );
}

interface DropdownMenuItemProps {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuItem({
  onClick,
  children,
  className,
}: DropdownMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-center px-2 py-2 rounded text-sm hover:bg-secondary/50 transition-colors',
        className
      )}
    >
      {children}
    </button>
  );
}
