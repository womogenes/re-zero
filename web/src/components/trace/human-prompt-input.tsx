"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { RemSpinner } from "@/components/rem-spinner";
import { TextInput } from "@/components/form/text-input";
import { GhostButton } from "@/components/form/ghost-button";

export function HumanPromptInput({
  promptId,
  question,
}: {
  promptId: string;
  question: string;
}) {
  const respond = useMutation(api.prompts.respond);
  const prompt = useQuery(api.prompts.get, {
    promptId: promptId as Id<"prompts">,
  });
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAnswered = prompt?.status === "answered";

  const handleSubmit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    await respond({
      promptId: promptId as Id<"prompts">,
      response: value.trim(),
    });
    setSubmitting(false);
  };

  return (
    <div className="ml-5 mr-2 my-2 border border-rem/30 bg-rem/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-rem/70 tracking-wider font-medium">
          REM NEEDS YOUR INPUT
        </span>
        {!isAnswered && <RemSpinner />}
      </div>
      <p className="text-sm text-foreground mb-3">{question}</p>
      {isAnswered ? (
        <div className="text-sm text-muted-foreground border-l-2 border-l-rem/30 pl-3">
          {prompt.response}
        </div>
      ) : (
        <div className="flex gap-2">
          <TextInput
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="type your response..."
            autoFocus
            className="flex-1"
          />
          <GhostButton
            onClick={handleSubmit}
            disabled={!value.trim() || submitting}
            className="text-sm px-4 py-2"
          >
            {submitting ? "sending..." : "send"}
          </GhostButton>
        </div>
      )}
    </div>
  );
}
