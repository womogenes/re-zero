# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Re:Zero Is

Autonomous AI security scanning platform. Agent "Rem" red-teams source code and web apps. One platform, multiple scan types, AI-powered vulnerability discovery.

**Live services:**
- **Web dashboard**: Vercel (rezero.sh) — Next.js + Convex + Clerk
- **API server**: Railway (api.rezero.sh) — FastAPI, stateless orchestrator
- **Database**: Convex cloud (steady-mosquito-754) — all persistent state
- **Compute**: Modal (re-zero-sandbox) — sandboxed scan agents
- **Billing**: Autumn (usage-based, per-scan via Stripe)
- **Auth**: Clerk (OAuth, JWT)

## Monorepo Structure

```
re-zero/
├── web/            # Next.js dashboard + Convex backend (see web/CLAUDE.md)
├── server/         # FastAPI orchestrator (see server/CLAUDE.md)
├── cli/            # rem-scan npm package (Commander.js + TypeScript)
├── action/         # GitHub Actions composite action (action.yml)
├── training/       # RL training pipeline on Modal (see training/CLAUDE.md)
├── hardware/       # Hackathon hardware demos (inactive)
├── PLANNING.md     # Strategy, pricing, roadmap, competitive analysis
└── CLAUDE.md       # This file
```

Each subdirectory with a CLAUDE.md has detailed architecture docs. This file covers cross-cutting concerns.

## Commands

```bash
# Web (Next.js + Convex)
cd web && pnpm dev                    # Next.js dev server
cd web && pnpm exec convex dev        # Convex dev (separate terminal)

# Server (FastAPI)
cd server && uv run uvicorn main:app --reload

# CLI
cd cli && npm run build               # Compile TypeScript
cd cli && node dist/index.js <cmd>    # Run locally

# Training
cd training && .venv/bin/modal run deploy/train.py --config <config>.toml
```

## Architecture Flow

```
User → CLI (rem scan .) → POST /scans/launch → Railway server
  → Creates project + scan in Convex
  → Spawns Modal sandbox (run_oss_scan or run_web_scan)
    → Claude agent reads code / browses site
    → Agent writes actions directly to Convex (real-time)
    → Agent calls submit_findings → report saved to Convex
  → Frontend subscribes via Convex reactivity (live updates)
  → Autumn tracks usage on scan completion
```

Gate scans (CI): `POST /gate/scan` → Haiku single-shot on git diff → findings (no Modal, synchronous, <10s)

## API Endpoints (server)

| Route | Purpose |
|-------|---------|
| `POST /scans/launch` | All-in-one: create project, scan, launch Modal |
| `POST /scans/start` | Internal: launch Modal from existing scan |
| `GET /scans/{id}/poll` | Poll actions + report |
| `POST /scans/action` | Agent callback: push action to Convex |
| `POST /scans/report` | Agent callback: submit findings |
| `POST /scans/upload-url` | Presigned URL for tarball upload |
| `POST /scans/verify` | Validate API key |
| `POST /gate/scan` | Synchronous Haiku gate scan on diffs |
| `GET /health` | Health check |

## CLI Commands

| Command | Status |
|---------|--------|
| `rem init` | Built — interactive setup (.rem.yml, workflow, .remignore) |
| `rem scan [path]` | Built — local + remote scanning, --dry-run, --json, --ci |
| `rem login` | Built — API key auth |
| `rem status` | Built — check auth + server |
| `rem report` | Not built |
| `rem ignore` | Not built |
| `rem history` | Not built |
| `rem budget` | Not built |

## Convex Schema (key tables)

- **users** — synced from Clerk (clerkId, email, name)
- **projects** — scan targets (name, targetType, targetConfig, status)
- **scans** — individual runs (projectId, agent, status, timestamps)
- **actions** — real-time agent trace (scanId, type, payload)
- **reports** — structured findings with VN-XXX IDs
- **apiKeys** — re0_* format, prefix stored, hash validated

## Billing (Autumn)

- `autumn-js/react` AutumnProvider on frontend with Clerk auth
- `/api/autumn/[...path]` Next.js API route proxies to Autumn
- Server uses REST: `autumn_check(feature)` before scan, `autumn_track(feature, 1)` after completion
- Features: `scan` ($25/deep scan), `gate_scan` ($0.10/gate scan)
- Scan packs: 10 for $212.50 (15% off), 25 for $468.75 (25% off)
- Deep scans tracked on **completion** (not start) — user isn't charged for failed scans

## Agent Architecture

- **Claude (Opus/Sonnet/Haiku)** — Anthropic SDK, primary. Prompt caching enabled.
- **GLM-4.6V** — OpenCode SDK via OpenRouter. Agent ID: `glm`
- **Nemotron** — OpenCode SDK via custom Modal endpoint. OSS only.
- Modal functions route by agent: opus → `run_oss_scan`, others → `run_oss_scan_opencode`
- Gate scans always use Haiku directly (no Modal)

## Key Conventions

- **Package managers**: pnpm (web), uv (server, training), npm (cli)
- **Agent name**: Always "Rem" in UI, never "agent"
- **Finding IDs**: VN-XXX format, assigned by orchestrator
- **State**: ALL persistent state in Convex. Server and CLI are stateless.
- **Auth**: API keys (re0_*) via X-API-Key header. Clerk for web dashboard.
- **Bedrock toggle**: `USE_BEDROCK=true` switches Anthropic → Bedrock (same SDK, same pricing)
- **Tailwind**: v4, `bg-rem`/`text-rem`/`border-rem` all work (custom CSS var)

## What's Built vs Not Built

**Done**: CLI (scan/login/status/init), web dashboard, billing, API keys, OSS scanning, web scanning, gate scan (Haiku), GitHub Action, prompt caching, drift detection

**Not built**: rem report/ignore/history/budget, SARIF output, security badge, dep/CVE scanning tools, incremental scanning, exploit generation, Codex SDK harness, scan memory, profile hub, code graph (tree-sitter)

## Environment Variables

**Server (.env)**: `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `AUTUMN_SECRET_KEY`, `ANTHROPIC_API_KEY`
**Web (.env.local)**: `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, Clerk keys, `AUTUMN_SECRET_KEY`
**CLI**: `REM_API_KEY`, `REM_SERVER_URL` (or stored in `~/.rem/config.json`)
