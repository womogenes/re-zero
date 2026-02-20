"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormLabel } from "@/components/form/form-label";
import { TextInput } from "@/components/form/text-input";
import { SelectionCard } from "@/components/form/selection-card";

const TARGET_TYPES = [
  { value: "oss" as const, label: "source code", description: "clone and audit a public GitHub repository" },
  { value: "web" as const, label: "web application", description: "browser-based pentesting of a live URL" },
];

type TargetType = "oss" | "web";

export default function NewProjectPage() {
  const { user } = useCurrentUser();
  const createProject = useMutation(api.projects.create);
  const router = useRouter();

  const [name, setName] = useState("");
  const [targetType, setTargetType] = useState<TargetType | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [webUsername, setWebUsername] = useState("");
  const [webPassword, setWebPassword] = useState("");
  const [webContext, setWebContext] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !targetType || !name.trim()) return;
    setSubmitting(true);

    let targetConfig: Record<string, unknown> = {};
    if (targetType === "oss") targetConfig = { repoUrl };
    if (targetType === "web") targetConfig = {
      url: webUrl,
      ...(webUsername ? { testAccount: { username: webUsername, password: webPassword } } : {}),
      ...(webContext.trim() ? { context: webContext.trim() } : {}),
    };
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
      <div className="mb-8">
        <Breadcrumb segments={[
          { label: "projects", href: "/dashboard" },
          { label: "new project" },
        ]} />
      </div>
      <p className="text-sm text-muted-foreground mb-10">
        define an attack surface for rem to analyze.
      </p>

      <div className="space-y-10">
        {/* Name */}
        <div>
          <FormLabel htmlFor="name">project name</FormLabel>
          <TextInput
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-security-audit"
            className="w-full"
          />
        </div>

        {/* Target type */}
        <div>
          <FormLabel>attack surface</FormLabel>
          <div className="grid grid-cols-2 gap-3">
            {TARGET_TYPES.map((t) => (
              <SelectionCard
                key={t.value}
                active={targetType === t.value}
                onClick={() => setTargetType(t.value)}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {t.description}
                </div>
              </SelectionCard>
            ))}
          </div>
        </div>

        {/* Conditional fields */}
        {targetType === "oss" && (
          <div>
            <FormLabel htmlFor="repo">repository URL</FormLabel>
            <TextInput
              id="repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full"
            />
          </div>
        )}

        {targetType === "web" && (
          <div className="space-y-6">
            <div>
              <FormLabel htmlFor="url">target URL</FormLabel>
              <TextInput
                id="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full"
              />
            </div>

            <div>
              <FormLabel>
                test credentials <span className="text-muted-foreground/40">— optional</span>
              </FormLabel>
              <p className="text-xs text-muted-foreground/60 mb-3">
                provide a test account so rem can scan authenticated surfaces. rem will test both unauthenticated and authenticated attack surfaces.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  value={webUsername}
                  onChange={(e) => setWebUsername(e.target.value)}
                  placeholder="username or email"
                />
                <TextInput
                  type="password"
                  value={webPassword}
                  onChange={(e) => setWebPassword(e.target.value)}
                  placeholder="password"
                />
              </div>
            </div>

            <div>
              <FormLabel>
                context for rem <span className="text-muted-foreground/40">— optional</span>
              </FormLabel>
              <textarea
                value={webContext}
                onChange={(e) => setWebContext(e.target.value)}
                placeholder={"e.g. \"there's a hidden /admin route not in the sitemap. the app uses JWT stored in localStorage. try the GraphQL endpoint at /api/graphql.\""}
                rows={3}
                className="w-full text-sm bg-transparent border border-border px-3 py-2.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-rem transition-colors duration-150 resize-y"
              />
              <p className="text-xs text-muted-foreground/40 mt-1.5">
                anything rem should know — hidden routes, tech stack, areas of concern, how to use the test account.
              </p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !targetType || submitting}
          className="w-full text-sm bg-rem text-white py-2.5 hover:brightness-110 transition-all duration-150 disabled:opacity-30 active:translate-y-px"
        >
          {submitting ? "creating..." : "create project & deploy rem"}
        </button>
      </div>
    </div>
  );
}
