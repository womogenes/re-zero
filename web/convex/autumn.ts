import { components } from "./_generated/api";
import { Autumn } from "@useautumn/convex";

export const autumn = new Autumn(components.autumn, {
  secretKey: process.env.AUTUMN_SECRET_KEY!,
  identify: async (ctx: any) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    return {
      customerId: user.subject as string,
      customerData: {
        name: user.name as string,
        email: user.email as string,
      },
    };
  },
});

export const {
  check,
  track,
  checkout,
  billingPortal,
  listProducts,
  query: autumnQuery,
} = autumn.api();
