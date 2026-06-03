"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/routing";

import CustomerLogoutButton from "./CustomerLogoutButton";
import LanguageSwitcher from "./LanguageSwitcher";

/**
 * Full-bleed homepage hero.
 *
 * - background: public/hero.jpg (the iStock image from the USB).
 * - overlay: deep blue gradient for readability.
 * - foreground: bilingual title, subtitle, CTA, top-right language switcher.
 */
export default function Hero({ customerLoggedIn }: { customerLoggedIn: boolean }) {
  const t = useTranslations("home");
  const c = useTranslations("common");
  const locale = useLocale();
  const secondarySubtitle = t("heroSubtitleSecondary");

  return (
    <section className="relative isolate overflow-hidden bg-deepblue-dark text-white">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Layered overlay for legibility */}
        <div className="absolute inset-0 bg-gradient-to-br from-deepblue-dark/90 via-deepblue/70 to-deepblue-dark/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,30,71,0.45)_70%)]" />
      </div>

      {/* Top bar */}
      <div className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 pt-5 md:px-8 md:pt-7">
          <Link
            href="/"
            className="flex items-center gap-3 text-white/90 hover:text-white"
          >
            <Image
              src="/mechanica-logo.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-md bg-white object-cover shadow-lg"
            />
            <span className="font-display text-sm font-semibold uppercase tracking-wider">
              {c("appName")}
            </span>
          </Link>
          <LanguageSwitcher surface="hero" />
        </div>
      </div>

      {/* Hero body */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 pb-24 pt-16 md:gap-8 md:px-8 md:pb-32 md:pt-24 lg:pb-40">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-white/80 backdrop-blur-md"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-accent" />
          Digital archive · 2026
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
          className="max-w-4xl font-display text-3xl font-bold leading-tight tracking-tight text-white drop-shadow-lg md:text-5xl lg:text-6xl"
        >
          {t("heroTitle")}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.22, ease: "easeOut" }}
          className="max-w-3xl space-y-1.5"
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-soft md:text-base">
            {t("heroSubtitlePrimary")}
          </p>
          {locale === "en" && secondarySubtitle.trim() && (
            <p className="text-xs font-medium uppercase tracking-widest text-white/70 md:text-sm">
              {secondarySubtitle}
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.34, ease: "easeOut" }}
          className="flex flex-wrap items-center gap-3"
        >
          {customerLoggedIn ? (
            <>
              <Link
                href="/library"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-deepblue-dark shadow-cardHover transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(10,30,71,0.35)]"
              >
                Main Page
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M4 10a.75.75 0 0 1 .75-.75h8.69l-2.72-2.72a.75.75 0 1 1 1.06-1.06l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06l2.72-2.72H4.75A.75.75 0 0 1 4 10Z" />
                </svg>
              </Link>
              <CustomerLogoutButton surface="hero" />
            </>
          ) : (
            <Link
              href="/access"
              className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/20"
            >
              Customer Access
            </Link>
          )}
        </motion.div>
      </div>
    </section>
  );
}
