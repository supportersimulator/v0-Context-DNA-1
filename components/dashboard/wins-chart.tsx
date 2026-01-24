'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchDailyWins } from '@/lib/api';
import type { DailyWins, Learning } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface WinsChartProps {
  onDaySelect?: (date: string, wins: Learning[]) => void;
}

export function WinsChart({ onDaySelect }: WinsChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  const { data: dailyWins, isLoading } = useSWR('dailyWins', () => fetchDailyWins(14), {
    refreshInterval: 60000,
  });

  const selectedDay = dailyWins?.find(d => d.date === selectedDate);

  const handleBarClick = (data: DailyWins) => {
    setSelectedDate(data.date);
    onDaySelect?.(data.date, data.wins);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="glass rounded-lg p-6 space-y-4">
        <div className="h-5 w-32 skeleton rounded" />
        <div className="h-48 skeleton rounded" />
      </div>
    );
  }

  const chartData = dailyWins || [];
  const maxCount = Math.max(...chartData.map(d => d.count), 1);

  return (
    <div className="glass rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Wins Per Day
        </h3>
        <span className="text-xs text-muted-foreground">
          Last 14 days
        </span>
      </div>

      {/* Bar Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis 
              dataKey="date" 
              tickFormatter={formatShortDate}
              tick={{ fill: '#6b6b75', fontSize: 10 }}
              axisLine={{ stroke: '#2a2a35' }}
              tickLine={false}
              interval={1}
            />
            <YAxis 
              tick={{ fill: '#6b6b75', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, Math.ceil(maxCount * 1.2)]}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(34, 197, 94, 0.1)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as DailyWins;
                  return (
                    <div className="glass rounded-lg px-3 py-2 border border-border">
                      <p className="text-xs text-muted-foreground">{formatDate(data.date)}</p>
                      <p className="text-sm font-semibold text-type-win">{data.count} wins</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar 
              dataKey="count" 
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(data) => handleBarClick(data as unknown as DailyWins)}
            >
              {chartData.map((entry) => (
                <Cell 
                  key={entry.date}
                  fill={selectedDate === entry.date ? '#22c55e' : 'rgba(34, 197, 94, 0.4)'}
                  className="transition-colors duration-200"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Wins Detail Panel */}
      {selectedDay && (
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              {formatDate(selectedDay.date)}
            </h4>
            <span className="text-xs px-2 py-1 rounded-full bg-type-win/10 text-type-win font-medium">
              {selectedDay.count} wins
            </span>
          </div>
          
          <ScrollArea className="h-48 pr-4">
            <div className="space-y-2">
              {selectedDay.wins.length > 0 ? (
                selectedDay.wins.map((win) => (
                  <div 
                    key={win.id}
                    className="p-3 rounded-lg bg-card/50 border border-border hover:border-type-win/30 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm shrink-0">&#127942;</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {win.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(win.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No wins recorded on this day
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {!selectedDay && (
        <p className="text-center text-xs text-muted-foreground py-4">
          Click a bar to see wins for that day
        </p>
      )}
    </div>
  );
}

export function WinsChartSkeleton() {
  return (
    <div className="glass rounded-lg p-6 space-y-4">
      <div className="h-5 w-32 skeleton rounded" />
      <div className="h-48 skeleton rounded" />
    </div>
  );
}
