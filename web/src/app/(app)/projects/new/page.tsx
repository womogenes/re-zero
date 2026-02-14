"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";

const TARGET_TYPES = [
  { value: "oss" as const, label: "Source code", description: "Clone and audit a public GitHub repository" },
  { value: "web" as const, label: "Web application", description: "Browser-based pentesting of a live URL" },
  { value: "hardware" as const, label: "Hardware", description: "ESP32, drones, serial protocol analysis" },
  { value: "fpga" as const, label: "FPGA", description: "Side-channel analysis and voltage glitching" },
];

type TargetType = "oss" | "web" | "hardware" | "fpga";

export default function NewProjectPage() {
  const { user } = useCurrentUser();
  const createProject = useMutation(api.projects.create);
  const router = useRouter();

  const [name, setName] = useState("");
  const [targetType, setTargetType] = useState<TargetType | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [device, setDevice] = useState<"esp32" | "drone">("esp32");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !targetType || !name.trim()) return;
    setSubmitting(true);

    let targetConfig: Record<string, unknown> = {};
    if (targetType === "oss") targetConfig = { repoUrl };
    if (targetType === "web") targetConfig = { url: webUrl };
    if (targetType === "hardware") targetConfig = { device };
    if (targetType === "fpga") targetConfig = {};

    const id = await createProject({
      userId: user._id,
      name: name.trim(),
      targetType,
      targetConfig,
    });

    router.push(`/projects/${id}`);
  };

  return (
    <div className="px-8 py-8 max-w-lg mx-auto">
      <h1 className="text-base font-semibold mb-10">New project</h1>

      <div className="space-y-10">
        {/* Name */}
        <div>
          <label htmlFor="name" className="text-xs text-muted-foreground block mb-3">
            Project name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-security-audit"
            className="w-full text-sm bg-transparent border border-border px-3 py-2.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors duration-150"
          />
        </div>

        {/* Target type */}
        <div>
          <label className="text-xs text-muted-foreground block mb-3">
            Target type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {TARGET_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTargetType(t.value)}
                className={`border text-left p-4 transition-colors duration-100 ${
                  targetType === t.value
                    ? "border-foreground bg-accent"
                    : "border-border hover:border-muted-foreground/40 hover:bg-accent/40"
                }`}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conditional fields */}
        {targetType === "oss" && (
          <div>
            <label htmlFor="repo" className="text-xs text-muted-foreground block mb-3">
              Repository URL
            </label>
            <input
              id="repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full text-sm bg-transparent border border-border px-3 py-2.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors duration-150"
            />
          </div>
        )}

        {targetType === "web" && (
          <div>
            <label htmlFor="url" className="text-xs text-muted-foreground block mb-3">
              Target URL
            </label>
            <input
              id="url"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full text-sm bg-transparent border border-border px-3 py-2.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors duration-150"
            />
          </div>
        )}

        {targetType === "hardware" && (
          <div>
            <label className="text-xs text-muted-foreground block mb-3">Device</label>
            <div className="flex gap-3">
              {(["esp32", "drone"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`border px-4 py-2.5 text-sm transition-colors duration-100 ${
                    device === d
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !targetType || submitting}
          className="w-full text-sm border border-foreground bg-foreground text-background py-2.5 hover:opacity-80 transition-opacity duration-150 disabled:opacity-30 active:translate-y-px"
        >
          {submitting ? "Creating..." : "Create project"}
        </button>
      </div>
    </div>
  );
}
