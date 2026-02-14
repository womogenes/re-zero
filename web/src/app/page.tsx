import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Brand line handled by body::before */}
      <header className="px-8 h-11 flex items-center justify-between border-b border-border mt-[2px]">
        <span className="text-sm">
          <span className="font-semibold">re</span>
          <span className="text-destructive font-semibold">:</span>
          <span className="font-semibold">zero</span>
        </span>
        <SignInButton mode="modal">
          <button className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150">
            sign in
          </button>
        </SignInButton>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="px-8 pt-24 pb-20 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight leading-tight">
            Autonomous agents that<br />
            red team any attack surface.
          </h1>
          <p className="text-base text-muted-foreground mt-6 leading-relaxed max-w-xl">
            Point an AI agent at a codebase, web application, or hardware device.
            It reads, probes, and iterates — exploring the attack surface like
            a security researcher would, but at machine speed. You watch the
            agent think in real time. It hands you a structured report.
          </p>
        </section>

        <div className="border-t border-border" />

        {/* How it works */}
        <section className="px-8 py-16 max-w-3xl">
          <h2 className="text-xs text-muted-foreground mb-8">How it works</h2>
          <div className="space-y-6">
            <div className="flex gap-6">
              <span className="text-xs text-muted-foreground w-4 shrink-0 pt-0.5">1</span>
              <div>
                <div className="text-sm font-medium">Create a project</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Point it at a GitHub repository, a live URL, a hardware device
                  over serial, or an FPGA target.
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <span className="text-xs text-muted-foreground w-4 shrink-0 pt-0.5">2</span>
              <div>
                <div className="text-sm font-medium">Launch an agent</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Choose from Claude Opus, GLM-4.7V, or Nemotron. The agent
                  begins autonomous analysis in a sandboxed environment.
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <span className="text-xs text-muted-foreground w-4 shrink-0 pt-0.5">3</span>
              <div>
                <div className="text-sm font-medium">Watch it think</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Trace the agent&apos;s reasoning, file reads, code searches,
                  and discoveries as they happen. Every action streams in real time.
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <span className="text-xs text-muted-foreground w-4 shrink-0 pt-0.5">4</span>
              <div>
                <div className="text-sm font-medium">Get a report</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Structured findings with severity, file location, description,
                  and remediation advice. Ready for your security review.
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Attack surfaces */}
        <section className="px-8 py-16">
          <h2 className="text-xs text-muted-foreground mb-8">Attack surfaces</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-8 max-w-3xl">
            <div>
              <div className="text-sm font-medium">Source code</div>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Clone any public repo. Deep static analysis for injection,
                auth bypass, hardcoded secrets, logic flaws.
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">Web apps</div>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Browser-based pentesting with full page interaction.
                XSS, CSRF, SSRF, IDOR, auth testing.
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">Hardware</div>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                ESP32, drones, serial protocols. Connect via
                gateway for firmware extraction and protocol fuzzing.
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">FPGA</div>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Side-channel analysis, voltage glitching, timing attacks.
                Extract secrets from hardware implementations.
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Agents + CTA */}
        <section className="px-8 py-16 max-w-3xl">
          <div className="flex items-baseline gap-8 text-sm text-muted-foreground">
            <span>agents</span>
            <span className="text-foreground">Opus 4.6</span>
            <span>&middot;</span>
            <span className="text-foreground">GLM-4.7V</span>
            <span>&middot;</span>
            <span className="text-foreground">Nemotron</span>
          </div>

          <div className="mt-12">
            <SignInButton mode="modal">
              <button className="text-sm border border-foreground bg-foreground text-background px-5 py-2.5 hover:opacity-80 transition-opacity duration-150 active:translate-y-px">
                start scanning
              </button>
            </SignInButton>
          </div>
        </section>
      </main>

      <footer className="px-8 h-11 flex items-center border-t border-border">
        <span className="text-xs text-muted-foreground">return from zero</span>
      </footer>
    </div>
  );
}
