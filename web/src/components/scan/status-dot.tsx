import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function StatusDot() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block w-1.5 h-1.5 bg-rem animate-pulse shrink-0" />
      </TooltipTrigger>
      <TooltipContent>scan running</TooltipContent>
    </Tooltip>
  );
}
