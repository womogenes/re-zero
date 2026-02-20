"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { useMinLoading } from "@/hooks/use-min-loading";
import { TIER_CONFIG, type Tier } from "@/lib/scan-tiers";
import { LoadingState } from "@/components/loading-state";
import { SectionHeader } from "@/components/form/section-header";
import { GhostButton } from "@/components/form/ghost-button";
import { TextInput } from "@/components/form/text-input";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function SettingsPage() {
  const { user, isLoaded } = useCurrentUser();
  const { user: clerkUser } = useUser();
  const minTime = useMinLoading();
  const updateDefaultTier = useMutation(api.users.updateDefaultTier);
  const keys = useQuery(
    api.apiKeys.listByUser,
    user ? { userId: user._id } : "skip"
  );
  const createKey = useMutation(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);
  const getOrCreateDefault = useMutation(api.apiKeys.getOrCreateDefault);

  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  if (!isLoaded || !minTime) {
    return <LoadingState message="rem is loading settings..." />;
  }

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    const name = newKeyName.trim() || "default";
    const key = await createKey({ userId: user._id, name });
    setNewKeyValue(key);
    setNewKeyName("");
    setCreating(false);
  };

  const handleGetDefault = async () => {
    if (!user) return;
    const key = await getOrCreateDefault({ userId: user._id });
    setNewKeyValue(key);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (keyId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await revokeKey({ keyId: keyId as any });
  };

  const activeKeys = keys?.filter((k) => !k.revokedAt) || [];
  const revokedKeys = keys?.filter((k) => k.revokedAt) || [];

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-base font-semibold mb-8">settings</h1>

      {/* Default Scan Tier */}
      <section className="mb-12">
        <SectionHeader>DEFAULT SCAN MODE</SectionHeader>
        <p className="text-sm text-muted-foreground mb-4">
          new scans default to this tier. you can always override per-scan.
        </p>
        <div className="flex gap-2">
          {(Object.keys(TIER_CONFIG) as Tier[]).map((t) => {
            const isActive = (user?.defaultTier ?? "maid") === t;
            return (
              <button
                key={t}
                onClick={() => {
                  if (clerkUser) updateDefaultTier({ clerkId: clerkUser.id, defaultTier: t });
                }}
                className={`text-sm border px-4 py-2 transition-all duration-100 ${
                  isActive
                    ? "border-rem/30 bg-rem/5 text-rem"
                    : "border-border text-muted-foreground hover:border-rem/20 hover:text-foreground"
                }`}
              >
                <span className="block font-medium">{TIER_CONFIG[t].label}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">${TIER_CONFIG[t].price}/scan</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* API Keys Section */}
      <section>
        <SectionHeader>API KEYS</SectionHeader>
        <p className="text-sm text-muted-foreground mb-6">
          use API keys to authenticate the CLI.{" "}
          <span className="text-foreground">npm install -g rem-scan</span>, then{" "}
          <span className="text-foreground">rem login</span>.
        </p>

        {/* Newly created key banner */}
        {newKeyValue && (
          <div className="border border-rem/30 bg-rem/5 p-4 mb-6">
            <p className="text-xs text-muted-foreground mb-2">
              save this key now — you won&apos;t see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono flex-1 break-all">
                {newKeyValue}
              </code>
              <GhostButton
                variant="muted"
                onClick={() => handleCopy(newKeyValue)}
                className="shrink-0 border-border px-2 py-1 hover:border-rem/30"
              >
                {copied ? "copied" : "copy"}
              </GhostButton>
            </div>
            <button
              onClick={() => setNewKeyValue(null)}
              className="text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors duration-100"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Active keys list */}
        {activeKeys.length > 0 ? (
          <div className="border border-border divide-y divide-border mb-6">
            {activeKeys.map((k) => (
              <div
                key={k._id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-4">
                  <code className="text-xs text-muted-foreground font-mono">
                    {k.prefix}...
                  </code>
                  <span className="text-sm">{k.name}</span>
                  {k.lastUsedAt && (
                    <span className="text-xs text-muted-foreground">
                      used{" "}
                      {new Date(k.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setRevokeTarget({ id: k._id, name: k.name })}
                  className="text-xs text-destructive/70 hover:text-destructive transition-colors duration-100"
                >
                  revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border px-3 py-6 text-center mb-6">
            <p className="text-sm text-muted-foreground mb-3">
              no API keys yet.
            </p>
            <GhostButton onClick={handleGetDefault} className="text-sm px-3 py-1">
              generate default key
            </GhostButton>
          </div>
        )}

        {/* Create new key */}
        <div className="flex items-center gap-2">
          <TextInput
            placeholder="key name (optional)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1"
            inputSize="sm"
          />
          <GhostButton
            onClick={handleCreate}
            disabled={creating}
            className="text-sm px-3 py-1 shrink-0"
          >
            {creating ? "creating..." : "create key"}
          </GhostButton>
        </div>

        {/* Revoked keys */}
        {revokedKeys.length > 0 && (
          <div className="mt-8">
            <SectionHeader>REVOKED</SectionHeader>
            <div className="border border-border divide-y divide-border opacity-50">
              {revokedKeys.map((k) => (
                <div key={k._id} className="flex items-center gap-4 px-3 py-2">
                  <code className="text-xs text-muted-foreground font-mono line-through">
                    {k.prefix}...
                  </code>
                  <span className="text-sm line-through">{k.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="revoke API key"
        description={`"${revokeTarget?.name ?? ""}" will stop working immediately. any CLI sessions using this key will fail.`}
        confirmLabel="revoke"
        onConfirm={() => { if (revokeTarget) { handleRevoke(revokeTarget.id); setRevokeTarget(null); } }}
      />
    </div>
  );
}
