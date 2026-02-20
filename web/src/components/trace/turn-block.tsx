import type { Turn } from "@/lib/types";
import { BlinkingCursor } from "@/components/blinking-cursor";
import { ActionItem } from "./action-item";

export function TurnBlock({
  turn,
  isLatest,
  isRunning,
  readOnly = false,
}: {
  turn: Turn;
  isLatest: boolean;
  isRunning: boolean;
  readOnly?: boolean;
}) {
  const time = new Date(turn.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="animate-fade-slide-in">
      {/* Turn header */}
      <div className="flex items-center gap-3 px-5 py-2.5">
        <span className="text-xs text-rem/40 tabular-nums tracking-wider">
          TURN {String(turn.index).padStart(2, "0")}
        </span>
        <span className="flex-1 border-t border-rem/10" />
        <span className="text-xs text-muted-foreground/40 tabular-nums">
          {time}
        </span>
      </div>

      {/* Reasoning */}
      {turn.reasoning && (
        <div className="px-5 py-2">
          <div className="border-l-2 border-rem/25 pl-4">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {turn.reasoning}
            </p>
            {isLatest && isRunning && (
              <span className="inline-block mt-1">
                <BlinkingCursor />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {turn.actions.length > 0 && (
        <div className="px-5 py-1 space-y-0">
          {turn.actions.map((action) => (
            <ActionItem
              key={action._id}
              action={action}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}
