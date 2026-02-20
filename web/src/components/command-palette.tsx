"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatRelativeTime, getScanModelLabel, getScanShort } from "@/lib/scan-tiers";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { theme, setTheme } = useTheme();
  const { user: clerkUser } = useUser();
  const { user } = useCurrentUser();
  const updateTheme = useMutation(api.users.updateTheme);

  // Fetch projects for search
  const projects = useQuery(
    api.projects.list,
    user ? { userId: user._id } : "skip"
  );

  // Fetch scans for current project (if on a project page)
  const projectId = params?.id as string | undefined;
  const scans = useQuery(
    api.scans.listByProject,
    projectId ? { projectId: projectId as any } : "skip"
  );

  // Global Cmd+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  // Current project context
  const currentProject = useMemo(() => {
    if (!projectId || !projects) return null;
    return projects.find((p) => p._id === projectId) ?? null;
  }, [projectId, projects]);

  // Running scans in current project
  const runningScans = useMemo(() => {
    if (!scans) return [];
    return scans.filter((s) => s.status === "running" || s.status === "queued");
  }, [scans]);

  // Recent scans (completed/failed, for quick jump)
  const recentScans = useMemo(() => {
    if (!scans) return [];
    return scans.filter((s) => s.status !== "running" && s.status !== "queued").slice(0, 8);
  }, [scans]);

  const isOnProject = !!pathname?.startsWith("/projects/") && !!projectId;
  const isOnScan = !!pathname?.includes("/scan/");
  const scanId = params?.scanId as string | undefined;

  // Watchable scans (running but not the one we're already viewing)
  const watchableScans = useMemo(() => {
    return runningScans.filter((s) => !(isOnScan && s._id === scanId));
  }, [runningScans, isOnScan, scanId]);

  const hasProjectActions = (!isOnScan && scans && scans.length > 0) || watchableScans.length > 0;

  const handleToggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (clerkUser) {
      updateTheme({ clerkId: clerkUser.id, theme: next });
    }
    setOpen(false);
  }, [theme, setTheme, clerkUser, updateTheme]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="command palette"
      description="search commands, navigate, or perform actions"
      showCloseButton={false}
    >
      <CommandInput
        placeholder="where to?"
        icon={<img src="/rem-running.gif" alt="rem" className="w-5 h-5 object-contain opacity-60 shrink-0" />}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-2">
            <img
              src="/rem-running.gif"
              alt="rem"
              className="w-8 h-8 object-contain opacity-40"
            />
            <span className="text-muted-foreground text-xs">rem can&apos;t find that</span>
          </div>
        </CommandEmpty>

        {/* Context-aware: project actions */}
        {isOnProject && currentProject && hasProjectActions && (
          <CommandGroup heading="actions">
            {/* View trace — when on project page (not scan page) */}
            {!isOnScan && scans && scans.length > 0 && (
              <CommandItem
                onSelect={() => {
                  const first = scans[0];
                  if (first) go(`/projects/${projectId}/scan/${first._id}`);
                }}
              >
                view trace
                <CommandShortcut>open scan view</CommandShortcut>
              </CommandItem>
            )}
            {/* Watch live scans */}
            {watchableScans.length === 1 && (
              <CommandItem
                value={`watch-${watchableScans[0]._id}`}
                onSelect={() => go(`/projects/${projectId}/scan/${watchableScans[0]._id}`)}
              >
                <span className="w-1.5 h-1.5 bg-rem animate-pulse shrink-0" />
                watch live scan
                <CommandShortcut>{getScanShort(watchableScans[0])} {getScanModelLabel(watchableScans[0])}</CommandShortcut>
              </CommandItem>
            )}
            {watchableScans.length > 1 && watchableScans.map((scan) => (
              <CommandItem
                key={scan._id}
                value={`watch-${scan._id}`}
                onSelect={() => go(`/projects/${projectId}/scan/${scan._id}`)}
              >
                <span className="w-1.5 h-1.5 bg-rem animate-pulse shrink-0" />
                watch {getScanShort(scan)} {getScanModelLabel(scan)}
                <CommandShortcut>running</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Current scan actions */}
        {isOnScan && scanId && projectId && (
          <CommandGroup heading="this scan">
            <CommandItem onSelect={() => go(`/projects/${projectId}`)}>
              back to project
            </CommandItem>
          </CommandGroup>
        )}

        {/* Scans for current project */}
        {isOnProject && (runningScans.length > 0 || recentScans.length > 0) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="scans">
              {recentScans.map((scan) => {
                const isFailed = scan.status === "failed";
                const isCurrent = isOnScan && scan._id === scanId;
                return (
                  <CommandItem
                    key={scan._id}
                    value={`scan-${scan._id}`}
                    onSelect={() => go(`/projects/${projectId}/scan/${scan._id}`)}
                  >
                    <span className={`w-1.5 h-1.5 shrink-0 ${
                      isCurrent ? "bg-rem" : isFailed ? "bg-destructive/60" : "bg-muted-foreground/30"
                    }`} />
                    {getScanShort(scan)} · {getScanModelLabel(scan)}
                    <CommandShortcut>{isCurrent ? "current" : formatRelativeTime(scan.startedAt)}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading="navigate">
          <CommandItem onSelect={() => go("/dashboard")}>
            dashboard
            <CommandShortcut>projects</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/projects/new")}>
            new project
          </CommandItem>
          <CommandItem onSelect={() => go("/billing")}>
            billing
            <CommandShortcut>usage</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            settings
            <CommandShortcut>keys</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Projects */}
        {projects && projects.length > 0 && (
          <CommandGroup heading="projects">
            {projects.map((project) => (
              <CommandItem
                key={project._id}
                value={`project-${project._id}-${project.name}`}
                onSelect={() => go(`/projects/${project._id}`)}
              >
                {project.name}
                <CommandShortcut>{project.targetType}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Preferences */}
        <CommandGroup heading="preferences">
          <CommandItem onSelect={handleToggleTheme}>
            {theme === "dark" ? "switch to light mode" : "switch to dark mode"}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
