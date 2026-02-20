"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function ScreenshotImage({ storageId }: { storageId: string }) {
  const url = useQuery(api.storage.getUrl, {
    storageId: storageId as Id<"_storage">,
  });

  if (!url) {
    return (
      <div className="ml-8 mr-2 mb-2 mt-1 h-32 border border-border bg-muted/30 flex items-center justify-center">
        <span className="text-xs text-muted-foreground/40">
          loading screenshot...
        </span>
      </div>
    );
  }

  return (
    <div className="ml-8 mr-2 mb-2 mt-1">
      <img
        src={url}
        alt="Screenshot"
        className="border border-border max-w-full max-h-80 object-contain"
      />
    </div>
  );
}
