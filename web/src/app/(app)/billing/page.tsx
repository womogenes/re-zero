"use client";

import { useCustomer, CheckoutDialog } from "autumn-js/react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMinLoading } from "@/hooks/use-min-loading";
import { useMemo } from "react";

const BILLING_URL = typeof window !== "undefined" ? `${window.location.origin}/billing` : "/billing";

// Build last 30 days of usage data from scan records
function UsageGraph({ scans }: { scans: Array<{ tier?: string; status: string; startedAt: number }> }) {
  const data = useMemo(() => {
    const now = Date.now();
    const days = 30;
    const buckets: Array<{ date: string; maid: number; oni: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      buckets.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        maid: 0,
        oni: 0,
      });
    }

    // Only count completed scans (pay-as-you-go = completed scans)
    for (const scan of scans) {
      if (scan.status !== "completed") continue;
      const dayIndex = days - 1 - Math.floor((now - scan.startedAt) / 86400000);
      if (dayIndex < 0 || dayIndex >= days) continue;
      const tier = scan.tier || "maid";
      if (tier === "oni") buckets[dayIndex].oni++;
      else buckets[dayIndex].maid++;
    }

    return buckets;
  }, [scans]);

  const maxVal = Math.max(1, ...data.map((d) => d.maid + d.oni));
  const totalMaid = data.reduce((s, d) => s + d.maid, 0);
  const totalOni = data.reduce((s, d) => s + d.oni, 0);
  const totalSpend = totalMaid * 25 + totalOni * 45;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">last 30 days</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <span className="inline-block w-2 h-2 bg-rem/40" /> maid
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <span className="inline-block w-2 h-2 bg-rem" /> oni
          </span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {totalMaid + totalOni} scans &middot; ${totalSpend}
        </span>
      </div>
      <div className="flex items-end gap-px" style={{ height: 80 }}>
        {data.map((d, i) => {
          const total = d.maid + d.oni;
          const barH = total > 0 ? Math.max(3, Math.round((total / maxVal) * 80)) : 0;
          const oniH = total > 0 ? Math.round((d.oni / total) * barH) : 0;
          const maidH = barH - oniH;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end group"
              title={`${d.date}: ${d.maid} maid, ${d.oni} oni`}
            >
              {total > 0 ? (
                <div className="w-full transition-opacity duration-150 group-hover:opacity-70">
                  {oniH > 0 && (
                    <div className="bg-rem w-full" style={{ height: oniH }} />
                  )}
                  {maidH > 0 && (
                    <div className="bg-rem/40 w-full" style={{ height: maidH }} />
                  )}
                </div>
              ) : (
                <div className="w-full bg-border/20" style={{ height: 1 }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] tabular-nums text-muted-foreground/30">{data[0]?.date}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/30">today</span>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { customer, checkout, openBillingPortal, isLoading } = useCustomer();
  const { user } = useCurrentUser();
  const scans = useQuery(
    api.scans.listByUser,
    user ? { userId: user._id } : "skip"
  );
  const minTime = useMinLoading();

  if (isLoading || !minTime) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <img src="/rem-running.gif" alt="Rem" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <p className="text-sm text-muted-foreground">Rem is loading billing...</p>
        </div>
      </div>
    );
  }

  const products = Array.isArray(customer?.products) ? customer.products : [];
  const hasSubscription = products.some(
    (p: any) => p.status === "active"
  );

  const maidFeature = (customer?.features as any)?.standard_scan;
  const oniFeature = (customer?.features as any)?.deep_scan;
  const gateFeature = (customer?.features as any)?.gate_scan;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-base font-semibold mb-8">billing</h1>

      {/* Subscription */}
      <section className="mb-12">
        <p className="text-xs text-muted-foreground mb-4">PLAN</p>
        {hasSubscription ? (
          <div className="border border-rem/30 bg-rem/5 p-4">
            <p className="text-sm font-medium">Pay-as-you-go</p>
            <div className="text-xs text-muted-foreground mt-3 space-y-1">
              <p>$25 / maid scan{maidFeature?.usage > 0 ? ` \u00b7 ${maidFeature.usage} used this period` : ""}</p>
              <p>$45 / oni scan{oniFeature?.usage > 0 ? ` \u00b7 ${oniFeature.usage} used this period` : ""}</p>
              <p>$0.10 / gate scan{gateFeature?.usage > 0 ? ` \u00b7 ${gateFeature.usage} used this period` : ""}</p>
            </div>
          </div>
        ) : (
          <div className="border border-border p-4">
            <p className="text-sm text-muted-foreground mb-3">
              No active plan. Set up billing to start scanning.
            </p>
            <button
              onClick={() =>
                checkout({
                  productId: "pay-as-you-go",
                  successUrl: BILLING_URL,
                  dialog: CheckoutDialog,
                })
              }
              className="text-sm border border-rem/30 text-rem px-3 py-1 hover:bg-rem/5 transition-colors duration-100"
            >
              set up billing
            </button>
          </div>
        )}
      </section>

      {/* Usage graph */}
      {hasSubscription && scans && (
        <section className="mb-12">
          <p className="text-xs text-muted-foreground mb-4">USAGE</p>
          <div className="border border-border p-4">
            <UsageGraph scans={scans} />
          </div>
        </section>
      )}

      {/* Scan packs */}
      {hasSubscription && (
        <section className="mb-12">
          <p className="text-xs text-muted-foreground mb-4">SCAN PACKS</p>
          {maidFeature?.balance > 0 && (
            <p className="text-sm mb-4">
              {maidFeature.balance} prepaid {maidFeature.balance === 1 ? "scan" : "scans"} remaining
            </p>
          )}
          <p className="text-xs text-muted-foreground mb-4">
            Prepaid bundles at a discount. Draws from packs first,
            then pay-as-you-go.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() =>
                checkout({
                  productId: "standard-pack",
                  successUrl: BILLING_URL,
                  dialog: CheckoutDialog,
                })
              }
              className="text-sm border border-border px-3 py-2 hover:border-rem/30 transition-colors duration-100 flex-1"
            >
              <span className="block font-medium">10 scans — $212.50</span>
              <span className="block text-xs text-muted-foreground mt-1">
                $21.25/scan (15% off)
              </span>
            </button>
            <button
              onClick={() =>
                checkout({
                  productId: "bulk-pack",
                  successUrl: BILLING_URL,
                  dialog: CheckoutDialog,
                })
              }
              className="text-sm border border-border px-3 py-2 hover:border-rem/30 transition-colors duration-100 flex-1"
            >
              <span className="block font-medium">25 scans — $468.75</span>
              <span className="block text-xs text-muted-foreground mt-1">
                $18.75/scan (25% off)
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Manage */}
      {hasSubscription && (
        <section>
          <p className="text-xs text-muted-foreground mb-4">MANAGE</p>
          <button
            onClick={() => openBillingPortal()}
            className="text-sm text-rem hover:underline"
          >
            payment methods, invoices & subscription
          </button>
        </section>
      )}
    </div>
  );
}
