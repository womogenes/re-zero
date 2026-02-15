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
  const animatedSections = useRef(new Set<string>());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll-triggered section animations
  const setupScrollAnimations = useCallback(
    async (rootEl: HTMLDivElement) => {
      const { animate, stagger, splitText } = await import("animejs");

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = (entry.target as HTMLElement).dataset.section;
            if (!id || animatedSections.current.has(id)) return;
            animatedSections.current.add(id);

            if (id === "how-it-works") {
              // Step numbers scale up dramatically
              animate(
                entry.target.querySelectorAll(".step-num"),
                {
                  opacity: [0, 1],
                  scale: [0, 1],
                  delay: stagger(150),
                  duration: 800,
                  ease: "outExpo",
                }
              );
              // Step content slides in
              animate(
                entry.target.querySelectorAll(".step-content"),
                {
                  opacity: [0, 1],
                  translateX: ["-2rem", "0rem"],
                  delay: stagger(150, { start: 200 }),
                  duration: 900,
                  ease: "outExpo",
                }
              );
              // Connecting lines grow
              animate(
                entry.target.querySelectorAll(".step-line"),
                {
                  scaleX: [0, 1],
                  delay: stagger(150, { start: 400 }),
                  duration: 600,
                  ease: "outExpo",
                }
              );
            }

            if (id === "surfaces") {
              // Cards slide up with stagger
              animate(
                entry.target.querySelectorAll(".surface-card"),
                {
                  opacity: [0, 1],
                  translateY: ["3rem", "0rem"],
                  delay: stagger(120),
                  duration: 1000,
                  ease: "outExpo",
                }
              );
              // Border-left extends
              animate(
                entry.target.querySelectorAll(".surface-accent"),
                {
                  scaleY: [0, 1],
                  delay: stagger(120, { start: 300 }),
                  duration: 800,
                  ease: "outExpo",
                }
              );
            }

            if (id === "models") {
              // Each model name chars animate
              entry.target
                .querySelectorAll(".model-name")
                .forEach((el, i) => {
                  const { chars } = splitText(el as HTMLElement, {
                    chars: true,
                  });
                  animate(chars, {
                    opacity: [0, 1],
                    translateY: ["1rem", "0rem"],
                    delay: stagger(30, { start: i * 200 }),
                    duration: 600,
                    ease: "outExpo",
                  });
                });
              // Description + CTA
              animate(
                entry.target.querySelectorAll(".model-reveal"),
                {
                  opacity: [0, 1],
                  translateY: ["2rem", "0rem"],
                  delay: stagger(150, { start: 600 }),
                  duration: 900,
                  ease: "outExpo",
                }
              );
            }

            if (id === "rem-break") {
              animate(
                entry.target.querySelectorAll(".rem-break-gif"),
                {
                  opacity: [0, 1],
                  scale: [0.8, 1],
                  duration: 1000,
                  ease: "outExpo",
                }
              );
              animate(
                entry.target.querySelectorAll(".rem-break-text"),
                {
                  opacity: [0, 1],
                  translateY: ["1rem", "0rem"],
                  delay: 300,
                  duration: 800,
                  ease: "outExpo",
                }
              );
            }

            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.15 }
      );

      rootEl
        .querySelectorAll("[data-section]")
        .forEach((el) => {
          // Skip hero — it animates on load
          if ((el as HTMLElement).dataset.section !== "hero") {
            observer.observe(el);
          }
        });

      return observer;
    },
    []
  );

  // Hero animations (on load)
  useEffect(() => {
    if (!mounted || !root.current) return;

    let observer: IntersectionObserver | null = null;

    (async () => {
      const { animate, stagger, splitText, createTimeline } =
        await import("animejs");

      // Hero title char reveal
      const titleEl = root.current!.querySelector(".hero-title");
      if (titleEl) {
        const { chars } = splitText(titleEl as HTMLElement, { chars: true });

        const tl = createTimeline({
          defaults: { ease: "outExpo" },
        });

        tl.add(chars, {
          opacity: [0, 1],
          translateY: ["2rem", "0rem"],
          delay: stagger(35),
          duration: 900,
        })
          .add(
            ".hero-tagline",
            {
              opacity: [0, 1],
              translateY: ["1.5rem", "0rem"],
              duration: 1000,
            },
            "-=500"
          )
          .add(
            ".hero-cta",
            {
              opacity: [0, 1],
              translateY: ["1rem", "0rem"],
              duration: 800,
            },
            "-=600"
          );
      }

      // Gif entrance
      animate(".hero-gif-wrap", {
        opacity: [0, 1],
        scale: [1.04, 1],
        duration: 1400,
        ease: "outExpo",
        delay: 100,
      });

      // Setup scroll-triggered animations for everything below the fold
      observer = await setupScrollAnimations(root.current!);
    })();

    return () => observer?.disconnect();
  }, [mounted, setupScrollAnimations]);

  return (
    <div ref={root} className="flex min-h-screen flex-col overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        data-section="hero"
        className="relative min-h-screen flex flex-col"
      >
        {/* Animated dithering background */}
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
              style={{
                width: "100%",
                height: "100%",
                opacity: 0.12,
              }}
            />
          </div>
        )}

        {/* Header */}
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

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 pb-16">
          {/* Rem gif — the star */}
          <div className="hero-gif-wrap relative w-full max-w-[720px] aspect-[500/281] mb-10 opacity-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rem-hero.gif"
              alt="Rem"
              className="w-full h-full object-cover"
            />
            {/* Dithering overlay on gif */}
            {mounted && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ mixBlendMode: "overlay", opacity: 0.25 }}
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
            {/* Border frame */}
            <div className="absolute inset-0 border border-border pointer-events-none" />
          </div>

          {/* Title */}
          <h1 className="hero-title text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight text-center leading-none">
            <span>re</span>
            <span className="text-destructive">:</span>
            <span>zero</span>
          </h1>

          {/* Tagline */}
          <p className="hero-tagline text-lg sm:text-xl text-muted-foreground mt-6 text-center max-w-xl leading-relaxed opacity-0">
            deploy Rem to red team any attack surface.
            <br />
            <span className="text-sm text-muted-foreground/60">
              autonomous security analysis in minutes, not weeks.
            </span>
          </p>

          {/* CTA */}
          <div className="hero-cta mt-10 opacity-0">
            <SignInButton mode="modal">
              <button className="text-sm bg-rem text-white px-8 py-3 hover:brightness-110 transition-all duration-150 active:translate-y-px">
                deploy Rem
              </button>
            </SignInButton>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <div className="w-px h-8 bg-border animate-pulse" />
        </div>
      </section>

      <div className="border-t border-border" />

      {/* ── How it works ─────────────────────────────────── */}
      <section
        data-section="how-it-works"
        className="relative px-8 py-24 max-w-5xl mx-auto w-full"
      >
        <h2 className="text-xs text-muted-foreground mb-16">How it works</h2>

        <div className="space-y-16">
          {[
            {
              n: "01",
              title: "Create a project",
              desc: "Point it at a GitHub repo, a live URL, a hardware device over serial, or an FPGA target. Rem accepts any attack surface.",
            },
            {
              n: "02",
              title: "Deploy Rem",
              desc: "Choose a model backbone — Claude Opus, GLM-4.7V, or Nemotron. Rem spins up in a sandboxed environment and begins autonomous analysis.",
            },
            {
              n: "03",
              title: "Watch Rem think",
              desc: "Trace reasoning, file reads, code searches, and discoveries as they happen. Every action streams in real time. You see the turns, the tools, the inner monologue.",
            },
            {
              n: "04",
              title: "Get a structured report",
              desc: "Each finding has a vulnerability ID (VN-001), severity rating, file location, description, and remediation advice. Run multiple scans, compare reports.",
            },
          ].map((step, i) => (
            <div key={step.n} className="flex items-start gap-8">
              {/* Number */}
              <div className="step-num text-6xl font-semibold text-rem/15 tabular-nums leading-none shrink-0 w-24 opacity-0 origin-left">
                {step.n}
              </div>

              {/* Connecting line */}
              <div className="step-line h-px bg-rem/15 w-12 mt-6 shrink-0 origin-left" style={{ transform: "scaleX(0)" }} />

              {/* Content */}
              <div className="step-content opacity-0">
                <div className="text-base font-medium">{step.title}</div>
                <div className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-md">
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Rem visual break ─────────────────────────────── */}
      <section
        data-section="rem-break"
        className="relative border-y border-border"
      >
        {/* Dithering background for this section */}
        {mounted && (
          <div className="absolute inset-0 z-0 overflow-hidden">
            <Dithering
              colorBack="#111428"
              colorFront="#4f68e8"
              shape="sphere"
              type="4x4"
              size={3}
              speed={0.1}
              scale={0.6}
              style={{
                width: "100%",
                height: "100%",
                opacity: 0.15,
              }}
            />
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center py-20 gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rem-running.gif"
            alt="Rem"
            className="rem-break-gif w-20 h-20 object-contain opacity-0"
          />
          <p className="rem-break-text text-sm text-muted-foreground/60 text-center max-w-sm opacity-0">
            Rem probes, fails, learns, returns. Each scan is a life.
            <br />
            Knowledge accumulates. Vulnerabilities don&apos;t survive.
          </p>
        </div>
      </section>

      {/* ── Attack surfaces ──────────────────────────────── */}
      <section
        data-section="surfaces"
        className="px-8 py-24 max-w-5xl mx-auto w-full"
      >
        <h2 className="text-xs text-muted-foreground mb-16">Attack surfaces</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {[
            {
              title: "Source code",
              desc: "Clone any repo. Deep static analysis for injection, auth bypass, hardcoded secrets, logic flaws. Rem reads every file she deems relevant.",
            },
            {
              title: "Web apps",
              desc: "Browser-based pentesting with full page interaction. XSS, CSRF, SSRF, IDOR, auth testing. Rem navigates, submits forms, and probes endpoints.",
            },
            {
              title: "Hardware",
              desc: "ESP32, drones, serial protocols. Connect via gateway for firmware extraction and protocol fuzzing. Rem speaks UART, SPI, I2C.",
            },
            {
              title: "FPGA",
              desc: "Side-channel analysis, voltage glitching, timing attacks. Extract secrets from hardware implementations. Rem controls the glitch parameters.",
            },
          ].map((surface) => (
            <div
              key={surface.title}
              className="surface-card relative pl-5 opacity-0"
            >
              {/* Animated left accent */}
              <div
                className="surface-accent absolute left-0 top-0 bottom-0 w-[2px] bg-rem/30 origin-top"
                style={{ transform: "scaleY(0)" }}
              />
              <div className="text-sm font-medium">{surface.title}</div>
              <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {surface.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-border" />

      {/* ── Models + Final CTA ───────────────────────────── */}
      <section
        data-section="models"
        className="px-8 py-24 max-w-5xl mx-auto w-full"
      >
        <h2 className="text-xs text-muted-foreground mb-10">
          Rem&apos;s model backbones
        </h2>

        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <span className="model-name text-3xl font-semibold text-rem">
            Opus 4.6
          </span>
          <span className="model-name text-3xl font-semibold text-rem/40">
            GLM-4.7V
          </span>
          <span className="model-name text-3xl font-semibold text-rem/40">
            Nemotron
          </span>
        </div>

        <p className="model-reveal text-sm text-muted-foreground mt-8 leading-relaxed max-w-lg opacity-0">
          Each model brings different strengths. Opus excels at deep reasoning
          and multi-step analysis. GLM-4.7V adds vision for screenshot-based
          web testing. Nemotron is RL-optimized for CTF-style challenges.
          Deploy all three, compare their findings.
        </p>

        <div className="model-reveal mt-14 opacity-0">
          <SignInButton mode="modal">
            <button className="text-sm bg-rem text-white px-8 py-3 hover:brightness-110 transition-all duration-150 active:translate-y-px">
              start scanning
            </button>
          </SignInButton>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="px-8 h-14 flex items-center border-t border-border">
        <span className="text-xs text-muted-foreground">return from zero</span>
      </footer>
    </div>
  );
}
