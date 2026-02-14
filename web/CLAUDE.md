# Web — Re:Zero

## What this is
Next.js dashboard for the Re:Zero security platform. Auth via Clerk, state via Convex (real-time), UI via shadcn (all components installed, fully custom theme).

## Package management
- **pnpm only**. Never use npm or yarn.
- `pnpm add <package>` / `pnpm remove <package>`
- shadcn components: `pnpm dlx shadcn@latest add <component>`

## Running
```bash
pnpm dev          # Next.js dev server
pnpm exec convex dev  # Convex dev (in separate terminal)
```

## Architecture
```
web/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing (unauthed → sign in, authed → redirect)
│   │   ├── layout.tsx                  # Root layout (Clerk + Convex + Tooltip providers)
│   │   └── (app)/                      # Authed routes
│   │       ├── layout.tsx              # App shell (header, nav, SyncUser)
│   │       ├── dashboard/page.tsx      # Project list
│   │       ├── projects/new/page.tsx   # Create project wizard
│   │       ├── projects/[id]/page.tsx  # Project detail + scans + reports
│   │       └── projects/[id]/scan/[scanId]/page.tsx  # Live scan view
│   ├── components/
│   │   ├── ui/                         # shadcn components (57 installed)
│   │   ├── convex-provider.tsx         # ConvexProviderWithClerk
│   │   └── sync-user.tsx               # Syncs Clerk user → Convex users table
│   └── hooks/
│       └── use-current-user.ts         # Returns Convex user from Clerk session
├── convex/
│   ├── schema.ts                       # Tables: users, projects, scans, actions, reports, gateways
│   ├── users.ts                        # getOrCreate, getByClerkId
│   ├── projects.ts                     # list, get, create, archive
│   ├── scans.ts                        # listByProject, get, create, updateStatus
│   ├── actions.ts                      # listByScan, push
│   └── reports.ts                      # getByScan, listByProject, submit
```

## Convex schema
- **users**: synced from Clerk (clerkId, email, name, imageUrl)
- **projects**: user's security audit projects (name, targetType, targetConfig, status)
- **scans**: individual scan runs (projectId, agent, sandboxId, status, timestamps)
- **actions**: real-time agent action feed (scanId, type, payload, timestamp)
- **reports**: structured findings (scanId, findings[], summary)
- **gateways**: hardware/FPGA gateway connections (projectId, type, endpoint, status)

## Key patterns
- **SyncUser**: On app load, syncs Clerk user to Convex users table via `getOrCreate` mutation
- **useCurrentUser**: Hook that returns the Convex user doc from the Clerk session
- **Real-time actions**: Scan page subscribes to `actions.listByScan` — Convex pushes updates automatically
- **Target types**: oss, web, hardware, fpga — each has different targetConfig shape

## Brand & design system

**Concept**: Re:Zero = "Return from zero." Named after the anime where the protagonist iterates through death, accumulating knowledge. For security: agents probe, fail, learn, return. Each scan is a "life."

**Palette**: Warm monochrome + one accent (muted red).
- Base colors have subtle warmth — cream/sepia tones, not pure gray
- Light: #f7f5f2 bg, #1a1815 text, #ddd9d3 borders
- Dark: #0e0d0c bg, #e8e4de text, #2a2826 borders
- Red accent (#b5392b light / #c94a3a dark): ONLY for critical/high severity, running states, and the brand colon in "re:zero"
- Everything else is foreground/muted-foreground — no other colors

**Typography**: Geist Mono as body font. Hierarchy through weight + size, not color.
- Page titles: text-base font-semibold
- Section labels: text-xs text-muted-foreground
- Body: text-sm
- Metadata: text-xs tabular-nums

**Shape**: 1px border radius everywhere. Sharp corners. No rounded anything.

**Space**: Intentional vertical rhythm. Generous spacing between sections (mb-12), tight within (gap-3). Space IS the design.

**Decoration rules**:
- 2px red brand line at viewport top (body::before)
- Left borders (border-l-2) for reasoning blocks and recommendations
- Horizontal rules between sections
- No gradients, no shadows, no glows, no icons (Lucide icons banned from app pages)
- Subtle hover states: bg-accent/40, underline on names, translate-y-px on click

**Layout**:
- Scan page is full viewport width (no max-w constraint)
- Other pages self-constrain (max-w-4xl or max-w-lg)
- App layout provides only header + flex-1 main — pages handle their own padding

**Microinteractions**: duration-100 for interactive (snappy), duration-150 for navigation (deliberate). active:translate-y-px for press feedback.

**References**: usgraphics.com, ghostty.org, opencode.ai, bearblog, polar.sh/company

## Rules
- Never use npm or yarn
- Keep components small and focused
- All state in Convex — no local state for persistent data
- Use shadcn components as building blocks, customize heavily via CSS variables
- Convex queries use "skip" pattern when args aren't ready yet
