"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import Link from "next/link";
import { useMinLoading } from "@/hooks/use-min-loading";
import { LoadingState } from "@/components/loading-state";
import { ghostButtonClass } from "@/components/form/ghost-button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function DashboardPage() {
  const { user, isLoaded } = useCurrentUser();
  const projects = useQuery(
    api.projects.list,
    user ? { userId: user._id } : "skip"
  );

  const minTime = useMinLoading();

  if (!isLoaded || !minTime) {
    return <LoadingState message="rem is fetching your projects..." />;
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between mb-10">
        <h1 className="text-sm font-semibold">projects</h1>
        <Link
          href="/projects/new"
          className={ghostButtonClass()}
        >
          + new project
        </Link>
      </div>

      {projects && projects.length === 0 && (
        <div className="py-24 text-center">
          <img src="/rem-running.gif" alt="rem" className="w-20 h-20 mx-auto mb-4 object-contain" />
          <p className="text-sm text-foreground mb-1">
            rem is ready to hunt.
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            give her an attack surface and she&apos;ll find what&apos;s hiding.
          </p>
          <Link
            href="/projects/new"
            className="text-sm text-rem hover:underline"
          >
            create your first project
          </Link>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="-mx-3">
          {/* Column headers */}
          <div className="flex items-baseline gap-4 pb-3 border-b border-border text-xs text-muted-foreground px-3 border-l-2 border-l-transparent">
            <span className="flex-1">name</span>
            <span className="w-20">type</span>
            <span className="w-56 hidden sm:block">target</span>
            <span className="w-24 text-right">created</span>
          </div>

          {/* Rows */}
          {projects.map((project) => (
            <Link
              key={project._id}
              href={`/projects/${project._id}`}
              className="group flex items-baseline gap-4 py-3.5 border-b border-border border-l-2 border-l-transparent hover:border-l-rem hover:bg-accent/40 transition-all duration-100 px-3"
            >
              <span className="flex-1 text-sm font-medium group-hover:underline truncate">
                {project.name}
              </span>
              <span className="w-20 text-xs text-muted-foreground">
                {project.targetType}
              </span>
              <span className="w-56 text-xs text-muted-foreground truncate hidden sm:block">
                {project.targetType === "oss" && project.targetConfig?.repoUrl}
                {project.targetType === "web" && project.targetConfig?.url}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-24 text-xs text-muted-foreground text-right tabular-nums">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{new Date(project.createdAt).toLocaleString()}</TooltipContent>
              </Tooltip>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
