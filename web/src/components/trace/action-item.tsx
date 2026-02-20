"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScreenshotImage } from "@/components/screenshot-image";
import { JsonBlock } from "./json-block";
import { HumanPromptInput } from "./human-prompt-input";
import type { Action } from "@/lib/types";

function Timestamp({
  time,
  opacity = "/40",
}: {
  time: string;
  opacity?: string;
}) {
  return (
    <span
      className={`text-xs text-muted-foreground${opacity} shrink-0 w-16 text-right tabular-nums`}
    >
      {time}
    </span>
  );
}

export function ActionItem({
  action,
  readOnly = false,
}: {
  action: Action;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const payload = action.payload;
  const isObject = typeof payload === "object" && payload !== null;

  const time = new Date(action.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Observation
  if (action.type === "observation") {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="w-3 shrink-0" />
        <span className="text-xs text-muted-foreground/70 flex-1 min-w-0 truncate">
          {typeof payload === "string" ? payload : JSON.stringify(payload)}
        </span>
        <Timestamp time={time} />
      </div>
    );
  }

  // Tool call
  if (action.type === "tool_call") {
    const tool = isObject
      ? String((payload as Record<string, unknown>).tool)
      : "?";
    const summary = isObject
      ? (payload as Record<string, unknown>).summary
      : null;
    const input = isObject
      ? (payload as Record<string, unknown>).input
      : null;

    return (
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left flex items-center gap-3 py-1 hover:bg-rem/5 transition-colors duration-100 cursor-pointer">
            <span className="text-xs text-muted-foreground/50 shrink-0 w-3 tabular-nums">
              {expanded ? "\u2212" : "+"}
            </span>
            <span className="text-xs text-rem/70 border border-rem/20 px-1.5 py-px shrink-0">
              {tool}
            </span>
            <span className="text-sm text-foreground/70 truncate flex-1 min-w-0">
              {summary ? String(summary) : ""}
            </span>
            <Timestamp time={time} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-8 mr-2 mb-2 mt-1">
            {input != null && <JsonBlock data={input} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Tool result
  if (action.type === "tool_result") {
    const summary = isObject
      ? (payload as Record<string, unknown>).summary
      : null;
    const content = isObject
      ? (payload as Record<string, unknown>).content
      : null;
    const storageId = isObject
      ? ((payload as Record<string, unknown>).storageId as string | undefined)
      : undefined;

    // Screenshot result
    if (storageId) {
      return (
        <div>
          <div className="flex items-center gap-3 py-0.5">
            <span className="w-3 shrink-0" />
            <span className="text-xs text-muted-foreground/50 flex-1 min-w-0 truncate">
              {summary ? String(summary) : "screenshot captured"}
            </span>
            <Timestamp time={time} opacity="/30" />
          </div>
          <ScreenshotImage storageId={storageId} />
        </div>
      );
    }

    if (content) {
      return (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <button className="w-full text-left flex items-center gap-3 py-0.5 hover:bg-rem/5 transition-colors duration-100 cursor-pointer">
              <span className="text-xs text-muted-foreground/50 shrink-0 w-3 tabular-nums">
                {expanded ? "\u2212" : "+"}
              </span>
              <span className="text-xs text-muted-foreground/50 flex-1 min-w-0 truncate">
                {summary ? String(summary) : "result"}
              </span>
              <Timestamp time={time} opacity="/30" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-8 mr-2 mb-2 mt-1">
              <pre className="text-xs bg-muted/60 border border-border px-3 py-2 whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto text-foreground/60 leading-relaxed">
                {String(content)}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <div className="flex items-center gap-3 py-0.5">
        <span className="w-3 shrink-0" />
        <span className="text-xs text-muted-foreground/50 flex-1 min-w-0 truncate">
          {summary
            ? String(summary)
            : typeof payload === "string"
              ? payload
              : JSON.stringify(payload)}
        </span>
        <Timestamp time={time} opacity="/30" />
      </div>
    );
  }

  // Human input request
  if (action.type === "human_input_request") {
    const promptId = isObject
      ? ((payload as Record<string, unknown>).promptId as string)
      : null;
    const question = isObject
      ? ((payload as Record<string, unknown>).question as string)
      : String(payload);

    if (readOnly || !promptId) {
      return (
        <div className="ml-5 mr-2 my-2 border border-rem/30 bg-rem/5 p-4">
          <span className="text-xs text-rem/70 tracking-wider font-medium">
            OPERATOR INPUT REQUESTED
          </span>
          <p className="text-sm text-foreground mt-2">{question}</p>
        </div>
      );
    }

    return <HumanPromptInput promptId={promptId} question={question} />;
  }

  // Fallback
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-3 shrink-0" />
      <span className="text-xs text-foreground/60 flex-1 min-w-0 truncate">
        {typeof payload === "string" ? payload : JSON.stringify(payload)}
      </span>
      <Timestamp time={time} />
    </div>
  );
}
