"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "@/lib/types";
import { groupIntoTurns, computeStats } from "@/lib/scan-utils";
import { RemSpinner } from "@/components/rem-spinner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TurnBlock } from "./turn-block";

export function TracePanel({
  actions,
  isRunning,
  readOnly = false,
}: {
  actions: Action[] | undefined;
  isRunning: boolean;
  readOnly?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const turns = useMemo(() => groupIntoTurns(actions ?? []), [actions]);
  const stats = useMemo(() => computeStats(actions), [actions]);

  // Scroll to bottom — waits for layout, re-checks the ref so a
  // user scroll-up between the trigger and the rAF wins.
  const scrollToBottom = (force = false) => {
    requestAnimationFrame(() => {
      if (scrollRef.current && (force || autoScrollRef.current)) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  };

  // Auto-scroll when new actions arrive (after DOM update)
  useEffect(() => {
    if (autoScrollRef.current) {
      scrollToBottom();
    }
  }, [actions?.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    autoScrollRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
    setScrollProgress(
      scrollHeight > clientHeight
        ? scrollTop / (scrollHeight - clientHeight)
        : 0
    );
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Header + stats */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">trace</h2>
            {isRunning && <RemSpinner />}
          </div>
          <div className="flex items-baseline gap-4 text-xs text-muted-foreground tabular-nums">
            {stats ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild><span>{stats.turns} turns</span></TooltipTrigger>
                  <TooltipContent>reasoning cycles</TooltipContent>
                </Tooltip>
                {stats.filesRead > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild><span>{stats.filesRead} files</span></TooltipTrigger>
                    <TooltipContent>files read</TooltipContent>
                  </Tooltip>
                )}
                {stats.searches > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild><span>{stats.searches} searches</span></TooltipTrigger>
                    <TooltipContent>code searches</TooltipContent>
                  </Tooltip>
                )}
                {stats.browserActions > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild><span>{stats.browserActions} actions</span></TooltipTrigger>
                    <TooltipContent>browser interactions</TooltipContent>
                  </Tooltip>
                )}
                {stats.screenshots > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild><span>{stats.screenshots} screenshots</span></TooltipTrigger>
                    <TooltipContent>page captures</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild><span>{stats.duration}</span></TooltipTrigger>
                  <TooltipContent>elapsed time</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <span>0 actions</span>
            )}
          </div>
        </div>
        {/* Scroll progress bar */}
        <div className="h-px bg-border mt-3 -mb-px relative">
          <div
            className="absolute top-0 left-0 h-px bg-rem/60 transition-[width] duration-100"
            style={{ width: `${scrollProgress * 100}%` }}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="py-2">
          {(!actions || actions.length === 0) && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                {isRunning ? (
                  <>
                    <img
                      src="/rem-running.gif"
                      alt="rem"
                      className="w-20 h-20 mx-auto mb-3 object-contain"
                    />
                    <p className="text-sm text-rem">rem is suiting up...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      spinning up sandbox environment
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    waiting for rem...
                  </p>
                )}
              </div>
            </div>
          )}

          {turns.map((turn, i) => (
            <TurnBlock
              key={turn.index}
              turn={turn}
              isLatest={i === turns.length - 1}
              isRunning={isRunning}
              readOnly={readOnly}
            />
          ))}

          {isRunning && actions && actions.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-4 text-sm text-rem/80">
              <img
                src="/rem-running.gif"
                alt="rem"
                className="w-6 h-6 object-contain"
              />
              <RemSpinner />
              rem is investigating...
            </div>
          )}
        </div>
      </div>

      {showScrollButton && (
        <button
          className="absolute bottom-4 right-4 text-xs border border-border bg-background px-2.5 py-1.5 text-muted-foreground hover:text-rem hover:border-rem/40 transition-colors duration-100"
          onClick={() => {
            autoScrollRef.current = true;
            scrollToBottom(true);
          }}
        >
          scroll to bottom
        </button>
      )}
    </div>
  );
}
