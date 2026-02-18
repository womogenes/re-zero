import { autumnHandler } from "autumn-js/next";
import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

const handler = autumnHandler({
  identify: async () => {
    const { userId } = await auth();
    if (!userId) return null;
    return { customerId: userId };
  },
});

const RETURN_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rezero.sh";

export const GET = handler.GET;

// Wrap POST to fix camelCase → snake_case for success_url / return_url
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const isCheckout = url.pathname.includes("/checkout");
  const isBillingPortal = url.pathname.includes("/billing_portal");
  const isAttach = url.pathname.includes("/attach");

  if (isCheckout || isBillingPortal || isAttach) {
    try {
      const body = await request.json();
      // Convert camelCase to snake_case and ensure a default
      if (body.successUrl && !body.success_url) {
        body.success_url = body.successUrl;
      }
      if (!body.success_url) {
        body.success_url = `${RETURN_URL}/billing`;
      }
      if (!body.return_url) {
        body.return_url = `${RETURN_URL}/billing`;
      }
      // Rebuild request with fixed body
      const newRequest = new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(body),
      });
      return handler.POST(newRequest);
    } catch {
      // If body parsing fails, fall through
    }
  }

  return handler.POST(request);
}
