"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

const Dithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.Dithering),
  { ssr: false }
);

/* ── Simulated scan for the terminal ─────────────────── */
const SCAN_LINES: { type: string; text: string }[] = [
  { type: "cmd", text: "$ rem deploy --target github.com/acme/payments-api" },
  { type: "sys", text: "  indexing 1,247 files \u00b7 building dependency graph" },
  { type: "blank", text: "" },
  { type: "reason", text: "\u2502 Payments API \u2014 starting with auth middleware and transaction endpoints." },
  { type: "tool", text: "\u2192 read_file  src/middleware/auth.ts" },
  { type: "tool", text: "\u2192 read_file  src/routes/transactions.ts" },
  { type: "reason", text: "\u2502 JWT secret from env without validation. Missing var = silent auth bypass." },
  { type: "finding-critical", text: "\u25a0 VN-001  CRITICAL  Auth bypass via missing JWT secret" },
  { type: "blank", text: "" },
  { type: "tool", text: "\u2192 search_code  \"query(\" \"raw(\" \"execute(\"" },
  { type: "reason", text: "\u2502 Raw SQL in transaction search. User input flows into WHERE clause." },
  { type: "finding-high", text: "\u25a0 VN-002  HIGH      SQL injection in /api/transactions" },
  { type: "blank", text: "" },
  { type: "tool", text: "\u2192 read_file  src/utils/crypto.ts" },
  { type: "reason", text: "\u2502 AES-ECB mode for card numbers. Same card \u2192 same ciphertext." },
  { type: "finding-critical", text: "\u25a0 VN-003  CRITICAL  Deterministic encryption (AES-ECB)" },
  { type: "blank", text: "" },
  { type: "sys", text: "  complete \u2014 3 findings \u00b7 2 critical \u00b7 1 high" },
];

/* ── Attack surfaces ─────────────────────────────────── */
const SURFACES = [
  {
    name: "SOURCE CODE",
    desc: "Deep static analysis. Injection, auth bypass, hardcoded secrets, logic flaws. Rem reads every file she deems relevant.",
    tags: "static \u00b7 secrets \u00b7 logic \u00b7 auth",
  },
  {
    name: "WEB APPS",
    desc: "Browser-based pentesting with full page interaction. XSS, CSRF, SSRF, IDOR, broken auth. Rem navigates like a human.",
    tags: "xss \u00b7 csrf \u00b7 ssrf \u00b7 idor",
  },
  {
    name: "HARDWARE",
    desc: "ESP32, drones, serial protocols. Firmware extraction and protocol fuzzing over UART, SPI, I2C via gateway.",
    tags: "uart \u00b7 spi \u00b7 i2c \u00b7 firmware",
  },
  {
    name: "FPGA",
    desc: "Side-channel analysis, voltage glitching, timing attacks. Extract secrets from hardware implementations.",
    tags: "sca \u00b7 glitch \u00b7 timing \u00b7 dpa",
  },
];

export function LandingContent() {
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const animated = useRef(new Set<string>());

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ── Scroll-triggered animations ───────────────────── */
  const setupScrollAnimations = useCallback(
    async (rootEl: HTMLDivElement) => {
      const { animate, stagger } = await import("animejs");

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = (entry.target as HTMLElement).dataset.section;
            if (!id || animated.current.has(id)) return;
            animated.current.add(id);

            if (id === "terminal") {
              const lines = entry.target.querySelectorAll(".scan-line");
              animate(lines, {
                opacity: [0, 1],
                translateX: ["-0.5rem", "0rem"],
                delay: stagger(120, { start: 200 }),
                duration: 350,
                ease: "outQuart",
              });
              const cursor = entry.target.querySelector(".term-cursor");
              if (cursor) {
                animate(cursor, {
                  opacity: [0, 1],
                  delay: 120 * lines.length + 600,
                  duration: 1,
                });
              }
            }

            if (id === "surfaces") {
              const rows = entry.target.querySelectorAll(".surface-row");
              rows.forEach((row, i) => {
                animate(row, {
                  opacity: [0, 1],
                  translateY: ["3rem", "0rem"],
                  delay: i * 200,
                  duration: 1000,
                  ease: "outExpo",
                });
              });
            }

            if (id === "closing") {
              animate(entry.target.querySelectorAll(".close-inner"), {
                opacity: [0, 1],
                translateY: ["1.5rem", "0rem"],
                duration: 1000,
                ease: "outExpo",
              });
            }

            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.1 }
      );

      rootEl.querySelectorAll("[data-section]").forEach((el) => {
        if ((el as HTMLElement).dataset.section !== "hero") {
          observer.observe(el);
        }
      });

      return observer;
    },
    []
  );

  /* ── Hero entrance ─────────────────────────────────── */
  useEffect(() => {
    if (!mounted || !root.current) return;

    let observer: IntersectionObserver | null = null;

    (async () => {
      const { createTimeline } = await import("animejs");

      createTimeline({ defaults: { ease: "outExpo" } })
        .add(".hero-gif-wrap", {
          opacity: [0, 1],
          scale: [1.03, 1],
          duration: 1200,
        })
        .add(
          ".hero-title",
          { opacity: [0, 1], translateY: ["1rem", "0rem"], duration: 800 },
          "-=600"
        )
        .add(
          ".hero-tagline",
          { opacity: [0, 1], translateY: ["0.75rem", "0rem"], duration: 800 },
          "-=400"
        )
        .add(
          ".hero-cta",
          { opacity: [0, 1], translateY: ["0.5rem", "0rem"], duration: 700 },
          "-=400"
        );

      observer = await setupScrollAnimations(root.current!);
    })();

    return () => observer?.disconnect();
  }, [mounted, setupScrollAnimations]);

  return (
    <div ref={root} className="flex min-h-screen flex-col overflow-x-hidden">
      {/* ═══ HERO ═══════════════════════════════════════ */}
      <section
        data-section="hero"
        className="relative min-h-screen flex flex-col"
      >
        {mounted && (
          <div className="absolute inset-0 z-0 overflow-hidden">
            <Dithering
              colorBack="#f7f7fc"
              colorFront="#4f68e8"
              shape="simplex"
              type="4x4"
              size={2}
              speed={0.15}
              scale={0.8}
              style={{ width: "100%", height: "100%", opacity: 0.1 }}
            />
          </div>
        )}

        <header className="relative z-10 px-8 h-11 flex items-center justify-between border-b border-border mt-[2px]">
          <span className="text-sm">
            <span className="font-semibold">re</span>
            <span className="text-destructive font-semibold">:</span>
            <span className="font-semibold">zero</span>
          </span>
          <SignInButton mode="modal">
            <button className="text-sm text-muted-foreground hover:text-rem transition-colors duration-150">
              sign in
            </button>
          </SignInButton>
        </header>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 pb-16">
          <div className="hero-gif-wrap relative w-full max-w-[720px] aspect-[500/281] mb-12 opacity-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rem-hero.gif"
              alt="Rem"
              className="w-full h-full object-cover"
            />
            {mounted && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ mixBlendMode: "overlay", opacity: 0.2 }}
              >
                <Dithering
                  colorBack="#000000"
                  colorFront="#ffffff"
                  shape="simplex"
                  type="4x4"
                  size={3}
                  speed={0.2}
                  scale={1.0}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )}
            <div className="absolute inset-0 border border-border pointer-events-none" />
          </div>

          <h1 className="hero-title text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight text-center leading-none opacity-0">
            <span>re</span>
            <span className="text-destructive">:</span>
            <span>zero</span>
          </h1>

          <p className="hero-tagline text-lg text-muted-foreground mt-6 text-center max-w-md leading-relaxed opacity-0">
            deploy Rem to red team any attack surface.
          </p>

          <div className="hero-cta mt-10 flex flex-col items-center gap-3 opacity-0">
            <SignInButton mode="modal">
              <button className="text-sm bg-rem text-white px-8 py-3 hover:brightness-110 transition-all duration-150 active:translate-y-px">
                deploy Rem
              </button>
            </SignInButton>
            <span className="text-xs text-muted-foreground/50">
              autonomous security analysis in minutes
            </span>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <div className="w-px h-8 bg-border animate-pulse" />
        </div>
      </section>

      {/* ═══ DARK ZONE — terminal + surfaces ═══════════ */}
      <div className="relative bg-[#0c0e1a] border-y border-[#222645]">
        {mounted && (
          <div className="absolute inset-0 z-0 overflow-hidden">
            <Dithering
              colorBack="#0c0e1a"
              colorFront="#4f68e8"
              shape="simplex"
              type="4x4"
              size={2}
              speed={0.05}
              scale={0.5}
              style={{ width: "100%", height: "100%", opacity: 0.07 }}
            />
          </div>
        )}

        {/* ── Terminal ─────────────────────────────── */}
        <section
          data-section="terminal"
          className="relative z-10 max-w-4xl mx-auto px-8 pt-20 pb-16"
        >
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-[7px] h-[7px] rounded-full bg-[#c53528]/60" />
            <div className="w-[7px] h-[7px] rounded-full bg-[#c5a028]/60" />
            <div className="w-[7px] h-[7px] rounded-full bg-[#28c55a]/60" />
            <span className="text-[11px] text-[#cfd2e3]/20 ml-3 font-mono">
              rem &mdash; live scan
            </span>
          </div>

          <div className="font-mono text-[13px] leading-[1.9] overflow-x-auto">
            {SCAN_LINES.map((line, i) => (
              <div
                key={i}
                className={`scan-line opacity-0 whitespace-pre ${
                  line.type === "blank"
                    ? "h-3"
                    : line.type === "cmd"
                      ? "text-white"
                      : line.type === "sys"
                        ? "text-[#cfd2e3]/25"
                        : line.type === "reason"
                          ? "text-[#6b82ff]/60"
                          : line.type === "tool"
                            ? "text-[#cfd2e3]/20"
                            : line.type === "finding-critical"
                              ? "text-[#dc4242]"
                              : line.type === "finding-high"
                                ? "text-[#e8a84f]"
                                : "text-[#cfd2e3]/30"
                }`}
              >
                {line.text}
              </div>
            ))}
            <span className="term-cursor opacity-0 inline-block w-[7px] h-[14px] bg-[#6b82ff] animate-pulse mt-1" />
          </div>
        </section>

        {/* ── Attack surfaces ──────────────────────── */}
        <section
          data-section="surfaces"
          className="relative z-10 border-t border-[#222645] px-8 pb-20 pt-16"
        >
          <div className="max-w-5xl mx-auto">
            <span className="text-[11px] text-[#cfd2e3]/15 font-mono tracking-widest uppercase">
              Attack surfaces
            </span>

            <div className="mt-14">
              {SURFACES.map((s) => (
                <div
                  key={s.name}
                  className="surface-row opacity-0 border-t border-[#222645] py-10 sm:py-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-12"
                >
                  <div>
                    <h3 className="text-[clamp(2.5rem,9vw,6.5rem)] font-semibold tracking-tighter leading-none text-[#6b82ff]/15">
                      {s.name}
                    </h3>
                    <span className="text-[11px] text-[#cfd2e3]/15 font-mono mt-3 inline-block">
                      {s.tags}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#cfd2e3]/35 leading-relaxed max-w-sm sm:text-right sm:pb-2">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ CLOSING ═══════════════════════════════════ */}
      <section data-section="closing" className="relative overflow-hidden">
        {mounted && (
          <div className="absolute inset-0 z-0">
            <Dithering
              colorBack="#f7f7fc"
              colorFront="#4f68e8"
              shape="sphere"
              type="4x4"
              size={3}
              speed={0.1}
              scale={0.4}
              style={{ width: "100%", height: "100%", opacity: 0.06 }}
            />
          </div>
        )}

        <div className="close-inner relative z-10 flex flex-col items-center py-32 gap-8 opacity-0">
          <span className="text-[11px] text-muted-foreground/30 font-mono tracking-widest">
            OPUS 4.6 &middot; GLM-4.7V &middot; NEMOTRON
          </span>

          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-center">
            deploy <span className="text-rem">Rem</span>
          </h2>

          <SignInButton mode="modal">
            <button className="text-sm bg-rem text-white px-10 py-3.5 hover:brightness-110 transition-all duration-150 active:translate-y-px mt-2">
              start scanning
            </button>
          </SignInButton>

          <p className="text-xs text-muted-foreground/30 text-center max-w-xs leading-relaxed mt-4">
            Rem probes, fails, learns, returns.
            <br />
            Each scan is a life. Knowledge accumulates.
          </p>
        </div>
      </section>

      <footer className="px-8 h-14 flex items-center border-t border-border">
        <span className="text-xs text-muted-foreground">return from zero</span>
      </footer>
    </div>
  );
}
