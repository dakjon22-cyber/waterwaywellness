import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { CheckoutModal } from "@/components/checkout-modal";
import { PhotoLightbox } from "@/components/photo-lightbox";

// Real community photos (served from /public/community/)
const PHOTOS = {
  hero: "/community/photo9.jpg",       // big group shot — 2700 building, WW banner
  vibe: "/community/photo1.jpg",       // guy throwing up the dub
  vibeGrid: [
    "/community/photo0.jpg",   // collage top-right
    "/community/photo2.jpg",   // collage bottom-right
  ],
  movement: "/community/photo10.jpg",  // different from hero
  strip: [
    "/community/photo12.jpg",  // running action — orange bandana
    "/community/merch1.jpg",   // merch circle from above — tees on the grass
    "/community/photo21.jpg",  // high-five tunnel at night
    "/community/merch4.jpg",   // girls in the merch by the fence
    "/community/photo9.jpg",   // previously unused
    "/community/photo14.jpg",  // running action — orange shades
    "/community/merch2.jpg",   // WW banner + bare feet
    "/community/photo23.jpg",  // DJ at the decks
    "/community/merch6.jpg",   // couple in black tees
    "/community/photo11.jpg",  // previously unused
    "/community/photo13.jpg",  // yoga / sound bath purple
    "/community/merch5.jpg",   // girls laughing in the merch
    "/community/photo15.jpg",  // throw up the dub shirt (black)
    "/community/photo16.jpg",  // Red Bull cans
    "/community/merch3.jpg",   // merch circle from above — alt
    "/community/photo17.jpg",  // throw up the dub shirt (white)
    "/community/photo18.jpg",  // shirtless guy Laura Ward Plaza
    "/community/photo19.jpg",  // Monday crew gathering pre-run
    "/community/photo20.jpg",  // Imprint crew at table
    "/community/photo22.jpg",  // Imprint table wider shot
  ],
};

// Brand assets
import runClubWordmark from "@assets/WaterwayWellness_RunClub_Wordmark_Seafoam_1778376675145.png";
import emblemSeafoam from "@assets/WaterwayWellness_Emblem_Seafoam_1778376526187.png";
import emblemIvory from "@assets/WaterwayWellness_Emblem_Ivory_1778376526187.png";
import throwUpDubIvory from "@assets/ThrowUpTheDub_Horizontal_Ivory_1778375686628.png";
import throwUpDubSeafoam from "@assets/ThrowUpTheDub_Horizontal_Seafoam_1778375686628.png";
import wRunClubSeafoam from "@assets/WaterwayWellness_WRunClub_Seafoam_1778376526186.png";
import eventFlyer from "@assets/Location2_SOCIAL_9x16_web.jpg";
import wwOutline from "@assets/WaterwayWellness_WWOutline_Seafoam_1778255372780.png";
import { RotatingHeroBackground } from "@/components/rotating-hero-background";

interface PrintifyProduct {
  id: string;
  title: string;
  variants: { price: number; is_enabled: boolean; is_available: boolean }[];
  images: { src: string; is_default: boolean }[];
  tags: string[];
}

function getDefaultImage(product: PrintifyProduct): string {
  return product.images.find((i) => i.is_default)?.src ?? product.images[0]?.src ?? "";
}

function getLowestPrice(product: PrintifyProduct): string {
  const enabled = product.variants.filter((v) => v.is_enabled && v.is_available);
  if (!enabled.length) return "";
  const min = Math.min(...enabled.map((v) => v.price));
  return `$${(min / 100).toFixed(2)}`;
}

function getTag(product: PrintifyProduct): string {
  const t = product.title.toLowerCase();
  if (t.includes("hoodie")) return "Hoodie";
  if (t.includes("t-shirt") || t.includes("tee")) return "T-Shirt";
  if (t.includes("tank")) return "Tank";
  if (t.includes("mug") || t.includes("cup")) return "Mug";
  return "Gear";
}

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const yHero = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const [checkoutItems, setCheckoutItems] = useState<Array<{ product_id: string; variant_id: number; quantity: number }> | null>(null);
  const [, navigate] = useLocation();
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [dubParticles, setDubParticles] = useState<Array<{ id: number; x: number; emoji: string }>>([]);

  const fireDubCelebration = useCallback(() => {
    const emojis = ["🤙", "🤙", "🤙", "✊", "💚", "🏃", "🌊", "⚡"];
    const particles = Array.from({ length: 16 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setDubParticles(particles);
    setTimeout(() => setDubParticles([]), 1800);
  }, []);

  const { data: productsData } = useQuery<{ data: PrintifyProduct[] }>({
    queryKey: ["printify-products"],
    queryFn: async () => {
      const resp = await fetch("/api/printify/products");
      if (!resp.ok) throw new Error("Failed to load products");
      return resp.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const featuredProducts = (productsData?.data ?? []).slice(-4);

  // Size/variant must be picked on the product page, so both actions route there
  function handleBuyProduct(item: PrintifyProduct) {
    navigate(`/shop/${item.id}`);
  }

  function handleAddToCart(item: PrintifyProduct) {
    navigate(`/shop/${item.id}`);
  }

  return (
    <div className="bg-background min-h-[100dvh] w-full overflow-x-hidden selection:bg-primary selection:text-primary-foreground dark" ref={containerRef}>
      <Nav />
      
      {/* 1. HERO SECTION */}
      <section className="relative w-full pt-16 overflow-hidden">
        {/* Banner image — full width, natural aspect ratio, no cropping */}
        <RotatingHeroBackground />

        {/* Tagline + scroll indicator sit below the image */}
        <div className="relative z-10 flex flex-col items-center gap-6 pb-10 -mt-6 md:-mt-10">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg md:text-2xl font-medium text-foreground/80 max-w-xl text-center text-balance px-6"
          >
            We hate running so we started a run club.
          </motion.p>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })}
            className="animate-bounce cursor-pointer"
            aria-label="Scroll down"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary/60 hover:text-primary transition-colors">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </motion.button>
        </div>
      </section>

      {/* 2. THE VIBE / MISSION */}
      <section id="about" className="py-16 md:py-32 px-6 md:px-12 lg:px-24 bg-background relative z-10 overflow-hidden">
        {/* Ambient teal glow */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 -left-32 w-64 h-64 rounded-full bg-primary/8 blur-[100px] pointer-events-none" />
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
          >
            <div className="order-2 lg:order-1 relative">
              {/* 3-photo collage */}
              <motion.div variants={fadeInUp} className="relative z-10 grid grid-cols-2 gap-3 h-[420px] md:h-[500px]">
                {/* Left — full height */}
                <div
                  className="rounded-3xl overflow-hidden cursor-pointer row-span-2"
                  onClick={() => setLightboxPhoto(PHOTOS.vibe)}
                >
                  <img src={PHOTOS.vibe} alt="Waterway Wellness community" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
                {/* Top right */}
                <div
                  className="rounded-3xl overflow-hidden cursor-pointer"
                  onClick={() => setLightboxPhoto(PHOTOS.vibeGrid[0])}
                >
                  <img src={PHOTOS.vibeGrid[0]} alt="Waterway Wellness community" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
                {/* Bottom right */}
                <div
                  className="rounded-3xl overflow-hidden cursor-pointer"
                  onClick={() => setLightboxPhoto(PHOTOS.vibeGrid[1])}
                >
                  <img src={PHOTOS.vibeGrid[1]} alt="Waterway Wellness community" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
              </motion.div>
              <motion.div 
                initial={{ rotate: -15, scale: 0.8, opacity: 0 }}
                whileInView={{ rotate: -5, scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="absolute -bottom-6 -left-4 md:-bottom-8 md:-left-8 w-24 md:w-40 z-20 drop-shadow-2xl"
              >
                <img src={emblemSeafoam} alt="Waterway Wellness Emblem" className="w-full h-auto" />
              </motion.div>
            </div>
            
            <div className="order-1 lg:order-2 flex flex-col gap-8">
              <motion.div variants={fadeInUp}>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-bold tracking-wide uppercase mb-6">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Fort Lauderdale, FL
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-foreground leading-tight mb-6">
                  Running is just<br/>
                  <span className="text-primary">the excuse.</span>
                </h2>
                <p className="text-lg text-foreground/75 leading-relaxed mb-6">
                  Waterway Wellness was created to give like-minded people a place to grow together. Most of us truly do not like running — but it's our vessel to meet genuine people.
                </p>
                <p className="text-lg text-foreground/75 leading-relaxed mb-10">
                  The events are never about the runs. They're about coming together every week, having a great time, and bettering ourselves.
                </p>
                <motion.div variants={fadeInUp} className="flex flex-wrap gap-2">
                  {["Show Up", "Good People", "Fort Lauderdale", "Monday Nights", "Two-Mile Tuesdays"].map((v) => (
                    <span key={v} className="px-4 py-2 rounded-full bg-primary/15 border border-primary/40 text-primary text-sm font-bold tracking-wide uppercase">
                      {v}
                    </span>
                  ))}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 3. PHOTO STRIP */}
      <div className="w-full overflow-hidden py-4 bg-background select-none">
        <motion.div
          className="flex gap-4"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 30, ease: "linear", repeat: Infinity }}
          style={{ width: "max-content" }}
        >
          {[...PHOTOS.strip, ...PHOTOS.strip].map((src, i) => (
            <div
              key={i}
              onClick={() => setLightboxPhoto(src)}
              className="w-64 h-48 rounded-2xl overflow-hidden shrink-0 border border-white/5 cursor-pointer group"
            >
              <img
                src={src}
                alt="Waterway Wellness community"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          ))}
        </motion.div>
      </div>

      {/* 4. WHEN & WHERE (FLYER SECTION) */}
      <section id="details" className="py-16 md:py-32 px-6 md:px-12 lg:px-24 bg-card relative overflow-hidden">
        <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-primary/12 blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <img src={wwOutline} alt="" className="w-full h-full object-cover object-right mix-blend-overlay" />
        </div>
        
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start"
          >
            <div className="flex flex-col gap-10 z-10">
              <motion.div variants={fadeInUp}>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-bold tracking-wide uppercase mb-6">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  When &amp; Where
                </div>

                {/* Monday — main event */}
                <div className="mb-8">
                  <h2 className="text-5xl md:text-7xl font-bold text-foreground mb-2">
                    Mondays
                  </h2>
                  <p className="text-primary font-bold text-xl mb-6">Meet 6:00 PM · Run starts 6:30 PM</p>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-background flex items-center justify-center shrink-0 border border-white/5">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-foreground">Laura Ward Plaza</h3>
                        <p className="text-foreground/60">Downtown Fort Lauderdale, FL</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-background flex items-center justify-center shrink-0 border border-white/5">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="m18 14-4-4 4-4"/><path d="M14 10h.01"/><path d="M10 14 6 10l4-4"/><path d="M10 10h.01"/><path d="M22 20V8h-4l-6-6-6 6H2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/></svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-foreground">2 Miles</h3>
                        <p className="text-foreground/60">Run, jog, or walk — your pace, always.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Other events */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                  <div className="rounded-2xl bg-background border border-white/5 p-5">
                    <p className="text-primary font-bold text-sm uppercase tracking-widest mb-1">Two-Mile Tuesdays</p>
                    <p className="text-foreground font-bold text-lg mb-1">Tarpon River Brewing</p>
                    <p className="text-muted-foreground text-sm">6:30 PM · Free beer + runners menu 🍺</p>
                  </div>
                  <div className="rounded-2xl bg-background border border-white/5 p-5">
                    <p className="text-primary font-bold text-sm uppercase tracking-widest mb-1">Weekend Pop-ups</p>
                    <p className="text-foreground font-bold text-lg mb-1">Hype &amp; Zen Events</p>
                    <p className="text-muted-foreground text-sm">Run + sound bath, ice bath parties &amp; yoga</p>
                  </div>
                </div>

                <a href="https://instagram.com/waterway.wellness" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="h-14 px-8 text-lg font-bold rounded-full w-full sm:w-auto" data-testid="btn-rsvp">
                    RSVP on Instagram
                  </Button>
                </a>
              </motion.div>
            </div>
            
            <motion.div variants={fadeInUp} className="hidden lg:flex relative z-10 justify-end">
              <div className="relative max-w-sm w-full rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-[3rem] -z-10" />
                <img 
                  src={eventFlyer} 
                  alt="Waterway Wellness Event Flyer" 
                  className="w-full h-auto rounded-2xl shadow-2xl border border-white/10" 
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* 4. THE MOVEMENT / THROW UP THE DUB */}
      <section id="movement" className="py-16 md:py-32 bg-black relative flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={PHOTOS.movement} alt="Waterway Wellness community energy" className="w-full h-full object-cover" style={{ filter: "brightness(0.6) saturate(1.3) contrast(1.05)" }} />
        </div>
        <div className="absolute inset-0 bg-black/30" />
        
        <div className="relative z-10 container mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center gap-8"
          >
            <motion.img 
              src={throwUpDubIvory} 
              alt="Throw Up The Dub" 
              className="w-full max-w-5xl mx-auto h-auto cursor-pointer select-none"
              style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.9))" }}
              onClick={fireDubCelebration}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            />
            <p className="text-2xl md:text-4xl font-semibold tracking-tight text-white max-w-3xl mx-auto leading-tight" style={{ textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}>
              The Dub is the movement.
            </p>
            <img
              src={wRunClubSeafoam}
              alt="W Run Club"
              className="w-24 md:w-32 h-auto"
              style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.8))" }}
            />
          </motion.div>
        </div>
      </section>

      {/* 5. MERCH SECTION */}
      <section id="merch" className="py-16 md:py-32 px-6 md:px-12 lg:px-24 bg-background relative z-10 overflow-hidden">
        <div className="absolute top-1/2 right-0 w-96 h-96 rounded-full bg-primary/10 blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="flex flex-col gap-16"
          >
            <motion.div variants={fadeInUp} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-bold tracking-wide uppercase mb-6">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  The Gear
                </div>
                <h2 className="text-5xl md:text-7xl font-semibold tracking-tight text-foreground leading-none">
                  Rep The Dub.
                </h2>
              </div>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 text-primary font-bold text-lg hover:opacity-80 transition-opacity shrink-0"
                data-testid="link-shop-all"
              >
                Shop All <ArrowRight className="w-5 h-5" />
              </Link>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
              {featuredProducts.length === 0
                ? [...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-3xl overflow-hidden border border-white/5 bg-card animate-pulse">
                      <div className="min-h-[260px] bg-white/5" />
                      <div className="p-5 space-y-2">
                        <div className="h-4 bg-white/10 rounded w-3/4" />
                        <div className="h-4 bg-white/10 rounded w-1/3" />
                      </div>
                    </div>
                  ))
                : featuredProducts.map((item) => (
                    <motion.div
                      key={item.id}
                      variants={fadeInUp}
                      whileHover={{ y: -6 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="group flex flex-col rounded-3xl overflow-hidden border border-white/5 bg-card"
                      data-testid={`card-merch-${item.id}`}
                    >
                      <Link href={`/shop/${item.id}`} className="relative aspect-square overflow-hidden bg-black/20 block">
                        {getDefaultImage(item) && (
                          <img
                            src={getDefaultImage(item)}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        )}
                        <div className="absolute top-4 left-4">
                          <span className="text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full bg-black/50 text-white/80 backdrop-blur-sm">
                            {getTag(item)}
                          </span>
                        </div>
                      </Link>
                      <div className="p-3 md:p-5 flex flex-col gap-2 md:gap-3 flex-1">
                        <div>
                          <p className="font-bold text-foreground text-xs md:text-sm leading-tight">{item.title}</p>
                          <p className="text-primary font-bold mt-1 text-sm">{getLowestPrice(item)}</p>
                        </div>
                        <div className="flex gap-1.5 md:gap-2 mt-auto">
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="flex-1 flex items-center justify-center gap-1 border border-white/20 hover:border-primary/60 text-foreground/70 hover:text-foreground font-semibold py-2 md:py-2.5 rounded-xl transition-all text-[10px] md:text-xs active:scale-95"
                          >
                            <ShoppingCart className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span className="hidden sm:inline">Add to Cart</span>
                            <span className="sm:hidden">Cart</span>
                          </button>
                          <button
                            onClick={() => handleBuyProduct(item)}
                            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 md:py-2.5 rounded-xl transition-all text-[10px] md:text-xs active:scale-95"
                          >
                            Buy Now
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 5b. DESIGNER CREDIT */}
      <section className="py-12 md:py-20 px-6 md:px-12 lg:px-24 bg-background relative z-10">
        <motion.a
          href="https://www.behance.net/kristopherkritikos"
          target="_blank"
          rel="noopener noreferrer"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="group block max-w-3xl mx-auto bg-card border border-white/5 hover:border-primary/40 rounded-3xl p-6 md:p-8 transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
              <span className="text-primary font-black text-xl tracking-tight">KK</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-primary mb-1">The Designer</p>
              <p className="font-bold text-foreground text-lg leading-tight">
                Brand designed by Kris Kritikos
              </p>
              <p className="text-sm text-foreground/50 mt-1">
                Fort Lauderdale graphic designer — the logos, the merch, the look. All him.
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-foreground/60 group-hover:text-primary transition-colors">
              See his work →
            </span>
          </div>
        </motion.a>
      </section>

      {/* 6. NEWSLETTER / JOIN */}
      <section className="py-16 md:py-32 px-6 bg-background">
        <div className="max-w-4xl mx-auto bg-card rounded-[2rem] md:rounded-[3rem] p-8 md:p-16 text-center border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1/2 bg-primary/10 blur-[100px] -z-10" />
          
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="relative z-10 flex flex-col items-center"
          >
            <motion.div variants={fadeInUp} className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-8">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z"/><polyline points="15,9 18,9 18,11"/><path d="M6.5 5C9 5 11 7 11 9.5V17a2 2 0 0 1-2 2v0"/></svg>
            </motion.div>
            
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Don't miss the next one.
            </motion.h2>
            
            <motion.p variants={fadeInUp} className="text-lg text-foreground/65 max-w-xl mx-auto mb-10">
              Drop your email and we'll let you know when the next run is. That's it.
            </motion.p>
            
            <motion.form variants={fadeInUp} className="flex flex-col sm:flex-row gap-3 w-full max-w-md mx-auto" onSubmit={(e) => e.preventDefault()}>
              <Input 
                type="email" 
                placeholder="Enter your email" 
                className="h-14 rounded-full px-6 bg-background border-white/10 text-lg focus-visible:ring-primary"
                data-testid="input-email-join"
              />
              <Button type="submit" size="lg" className="h-14 rounded-full px-8 text-lg font-bold shrink-0" data-testid="btn-submit-email">
                Sign Up
              </Button>
            </motion.form>
          </motion.div>
        </div>
      </section>

      <Footer />

      {checkoutItems && (
        <CheckoutModal
          items={checkoutItems}
          onClose={() => setCheckoutItems(null)}
        />
      )}

      {/* Emoji rain — fires when Throw Up The Dub is tapped */}
      <AnimatePresence>
        {dubParticles.map((p) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 1, y: "90vh", x: `${p.x}vw`, scale: 0.5 }}
            animate={{ opacity: 0, y: "10vh", scale: 1.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            className="fixed pointer-events-none z-[300] text-2xl md:text-3xl"
            style={{ left: 0, top: 0 }}
          >
            {p.emoji}
          </motion.span>
        ))}
      </AnimatePresence>

      <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
    </div>
  );
}
