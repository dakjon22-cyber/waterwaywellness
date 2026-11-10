import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Nav } from "@/components/nav";
import { sendTapstitchEmail } from "@/lib/tapstitch-email";

export default function ShopSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session_id");

  const { data, isLoading } = useQuery({
    queryKey: ["checkout-session", sessionId],
    queryFn: async () => {
      const resp = await fetch(`/api/checkout/session/${sessionId}`);
      if (!resp.ok) throw new Error("Failed to load order");
      const json = await resp.json();
      void sendTapstitchEmail(sessionId!).catch(() => {});
      return json;
    },
    enabled: !!sessionId,
    retry: false,
  });

  const session = data?.data?.session;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Nav />
      <main className="pt-32 pb-24 px-6 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md"
        >
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-16 w-16 bg-white/10 rounded-full mx-auto" />
              <div className="h-8 bg-white/10 rounded w-3/4 mx-auto" />
              <div className="h-4 bg-white/10 rounded w-1/2 mx-auto" />
            </div>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="text-4xl font-black mb-3 tracking-tight">Order Confirmed!</h1>
              <p className="text-foreground/60 text-lg mb-2">
                {session?.customer_email
                  ? `Confirmation sent to ${session.customer_email}`
                  : "Your order is in — we'll print and ship it soon."}
              </p>
              <p className="text-foreground/40 text-sm mb-10">
                Printed on demand and shipped directly to you. Allow 5–10 business days.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/shop"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-xl transition-colors"
                >
                  Back to Shop
                </Link>
                <Link
                  href="/"
                  className="border border-white/20 hover:border-primary/60 text-foreground/70 hover:text-foreground font-medium px-6 py-3 rounded-xl transition-colors"
                >
                  Back Home
                </Link>
              </div>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
