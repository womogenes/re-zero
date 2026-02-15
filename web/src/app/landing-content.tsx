"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

const Dithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.Dithering),
  { ssr: false }
);

export function LandingContent() {
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const animated = useRef(new Set<string>());

  useEffect(() => {
    setMounted(true);
  }, []);

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

            if (id === "how-it-works") {
              // Each step row fades up as a unit, staggered
              animate(entry.target.querySelectorAll(".step-row"), {
                opacity: [0, 1],
                translateY: ["2rem", "0rem"],
                delay: stagger(120),
                duration: 900,
                ease: "outExpo",
              });
            }

            if (id === "rem-break") {
              animate(entry.target.querySelectorAll(".rem-break-content"), {
                opacity: [0, 1],
                scale: [0.95, 1],
                duration: 1200,
                ease: "outExpo",
              });
            }

            if (id === "surfaces") {
              animate(entry.target.querySelectorAll(".surface-card"), {
                opacity: [0, 1],
                translateY: ["2rem", "0rem"],
                delay: stagger(100),
                duration: 900,
                ease: "outExpo",
              });
            }

            if (id === "models") {
              animate(entry.target.querySelectorAll(".model-block"), {
                opacity: [0, 1],
                translateY: ["2rem", "0rem"],
                delay: stagger(200),
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

  // Hero entrance + scroll setup
  useEffect(() => {
    if (!mounted || !root.current) return;

    let observer: IntersectionObserver | null = null;

    (async () => {
      const { animate, createTimeline } = await import("animejs");

      // Sequential hero entrance — no char splitting, just clean timing
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
      {/* ── Hero ─────────────────────────────────────────── */}
      <section data-section="hero" className="relative min-h-screen flex flex-col">
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
          {/* Rem gif */}
          <div className="hero-gif-wrap relative w-full max-w-[720px] aspect-[500/281] mb-12 opacity-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rem-hero.gif" alt="Rem" className="w-full h-full object-cover" />
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

      <div className="border-t border-border" />

      {/* ── How it works ─────────────────────────────────── */}
      <section data-section="how-it-works" className="px-8 py-24 max-w-5xl mx-auto w-full">
        <h2 className="text-xs text-muted-foreground mb-16">How it works</h2>

        <div className="space-y-14">
          {[
            {
              n: "01",
              title: "Create a project",
              desc: "Point it at a GitHub repo, a live URL, a hardware device over serial, or an FPGA target.",
            },
            {
              n: "02",
              title: "Deploy Rem",
              desc: "Choose a model backbone. Rem spins up in a sandboxed environment and begins autonomous analysis.",
            },
            {
              n: "03",
              title: "Watch Rem think",
              desc: "Trace reasoning, tool calls, and discoveries as they happen. Every action streams in real time.",
            },
            {
              n: "04",
              title: "Get a structured report",
              desc: "Each finding gets a vulnerability ID, severity rating, location, and remediation advice.",
            },
          ].map((step) => (
            <div key={step.n} className="step-row flex items-start gap-8 opacity-0">
              <span className="text-5xl font-semibold text-rem/12 tabular-nums leading-none shrink-0 w-20">
                {step.n}
              </span>
              <div className="h-px bg-rem/10 w-8 mt-5 shrink-0" />
              <div>
                <div className="text-sm font-medium">{step.title}</div>
                <div className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-md">
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Rem break ────────────────────────────────────── */}
      <section data-section="rem-break" className="relative border-y border-border overflow-hidden">
        {mounted && (
          <div className="absolute inset-0 z-0">
            <Dithering
              colorBack="#0c0e1a"
              colorFront="#4f68e8"
              shape="sphere"
              type="4x4"
              size={3}
              speed={0.08}
              scale={0.5}
              style={{ width: "100%", height: "100%", opacity: 0.2 }}
            />
          </div>
        )}
        <div className="rem-break-content relative z-10 flex flex-col items-center py-24 gap-6 opacity-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rem-running.gif" alt="Rem" className="w-16 h-16 object-contain" />
          <p className="text-sm text-muted-foreground/50 text-center max-w-xs leading-relaxed">
            Rem probes, fails, learns, returns.
            <br />
            Each scan is a life. Knowledge accumulates.
          </p>
        </div>
      </section>

      {/* ── Attack surfaces ──────────────────────────────── */}
      <section data-section="surfaces" className="px-8 py-24 max-w-5xl mx-auto w-full">
        <h2 className="text-xs text-muted-foreground mb-16">Attack surfaces</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {[
            {
              title: "Source code",
              desc: "Deep static analysis — injection, auth bypass, hardcoded secrets, logic flaws. Rem reads every file she deems relevant.",
            },
            {
              title: "Web apps",
              desc: "Browser-based pentesting with full page interaction. XSS, CSRF, SSRF, IDOR, broken auth. Rem navigates and probes like a human.",
            },
            {
              title: "Hardware",
              desc: "ESP32, drones, serial protocols. Firmware extraction and protocol fuzzing over UART, SPI, I2C via gateway.",
            },
            {
              title: "FPGA",
              desc: "Side-channel analysis, voltage glitching, timing attacks. Extract secrets from hardware implementations.",
            },
          ].map((s) => (
            <div key={s.title} className="surface-card border-l-2 border-l-rem/20 pl-5 opacity-0">
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-border" />

      {/* ── Models + CTA ─────────────────────────────────── */}
      <section data-section="models" className="px-8 py-24 max-w-5xl mx-auto w-full">
        <div className="model-block opacity-0">
          <h2 className="text-xs text-muted-foreground mb-8">Model backbones</h2>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <span className="text-2xl font-semibold text-rem">Opus 4.6</span>
            <span className="text-2xl font-semibold text-rem/30">GLM-4.7V</span>
            <span className="text-2xl font-semibold text-rem/30">Nemotron</span>
          </div>
          <p className="text-sm text-muted-foreground mt-6 leading-relaxed max-w-lg">
            Each model brings different strengths. Opus for deep reasoning,
            GLM-4.7V for vision-based web testing, Nemotron for CTF-optimized
            challenges. Deploy all three, compare findings.
          </p>
        </div>

        <div className="model-block mt-16 opacity-0">
          <SignInButton mode="modal">
            <button className="text-sm bg-rem text-white px-8 py-3 hover:brightness-110 transition-all duration-150 active:translate-y-px">
              start scanning
            </button>
          </SignInButton>
        </div>
      </section>

      <footer className="px-8 h-14 flex items-center border-t border-border">
        <span className="text-xs text-muted-foreground">return from zero</span>
      </footer>
    </div>
  );
}
