"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import Link from "next/link";

export default function DashboardPage() {
  const { user, isLoaded } = useCurrentUser();
  const projects = useQuery(
    api.projects.list,
    user ? { userId: user._id } : "skip"
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-sm text-muted-foreground">loading...</p>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between mb-10">
        <h1 className="text-base font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          + new project
        </Link>
      </div>

      {projects && projects.length === 0 && (
        <div className="py-24 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            No projects yet.
          </p>
          <Link
            href="/projects/new"
            className="text-sm text-foreground hover:underline"
          >
            Create your first project
          </Link>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div>
          {/* Column headers */}
          <div className="flex items-baseline gap-4 pb-3 border-b border-border text-xs text-muted-foreground">
            <span className="flex-1">name</span>
            <span className="w-16">type</span>
            <span className="w-48 hidden sm:block">target</span>
            <span className="w-24 text-right">created</span>
          </div>

          {/* Rows */}
          {projects.map((project) => (
            <Link
              key={project._id}
              href={`/projects/${project._id}`}
              className="group flex items-baseline gap-4 py-3.5 border-b border-border hover:bg-accent/40 transition-colors duration-100 -mx-3 px-3"
            >
              <span className="flex-1 text-sm font-medium group-hover:underline truncate">
                {project.name}
              </span>
              <span className="w-16 text-xs text-muted-foreground">
                {project.targetType}
              </span>
              <span className="w-48 text-xs text-muted-foreground truncate hidden sm:block">
                {project.targetType === "oss" && project.targetConfig?.repoUrl}
                {project.targetType === "web" && project.targetConfig?.url}
                {project.targetType === "hardware" && project.targetConfig?.device}
                {project.targetType === "fpga" && "fpga target"}
              </span>
              <span className="w-24 text-xs text-muted-foreground text-right tabular-nums">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
