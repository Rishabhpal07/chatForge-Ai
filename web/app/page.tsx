import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Icon } from "@/src/components/Icon";
import { LandingPricing } from "@/src/components/LandingPricing";

const FEATURES = [
  {
    icon: "upload_file",
    tint: "bg-primary/10 text-primary",
    title: "Doc Upload",
    body: "Upload PDFs, CSVs, and Word documents. Our RAG engine extracts knowledge with high accuracy.",
  },
  {
    icon: "travel_explore",
    tint: "bg-secondary/10 text-secondary",
    title: "Web Crawling",
    body: "Point us to your URL, and we'll crawl your site, subdomains, and blog posts automatically.",
  },
  {
    icon: "search",
    tint: "bg-primary/20 text-primary",
    title: "Semantic Search",
    body: "Replace standard search with a generative assistant that understands user intent perfectly.",
    featured: true,
  },
  {
    icon: "insights",
    tint: "bg-on-tertiary-container/10 text-on-tertiary-container",
    title: "Analytics",
    body: "Deep dive into conversation trends, common queries, and user satisfaction metrics.",
  },
  {
    icon: "groups",
    tint: "bg-primary/10 text-primary",
    title: "Team Workspaces",
    body: "Invite your colleagues to train, test, and refine your AI models in a shared environment.",
  },
  {
    icon: "code",
    tint: "bg-secondary/10 text-secondary",
    title: "1-Click Embed",
    body: "Deploy your bot via iframe, script tag, or a beautiful floating chat widget on any website.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-base text-on-surface">
      {/* Nav */}
      <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-white/5 bg-surface/70 px-lg py-sm backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-xs">
          <div>
            <img
              src="/logo.png"
              alt="ChatForge AI Logo"
              className="h-8 w-8 rounded-sm"
            />
          </div>
          <span className="font-display text-headline-md font-bold text-on-surface">
            ChatForge AI
          </span>
        </Link>
        <nav className="hidden gap-xl md:flex">
          <a href="#features" className="text-body-md text-on-surface-variant transition-colors hover:text-primary">
            Features
          </a>
          <a href="#pricing" className="text-body-md text-on-surface-variant transition-colors hover:text-primary">
            Pricing
          </a>
          <Link href="/sign-in" className="text-body-md text-on-surface-variant transition-colors hover:text-primary">
            Docs
          </Link>
        </nav>
        <div className="flex items-center gap-md">
          <SignedOut>
            <Link
              href="/sign-in"
              className="hidden text-body-md text-on-surface-variant transition-colors hover:text-on-surface sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-primary-container px-lg py-xs text-body-md font-bold text-on-primary-container transition-transform hover:opacity-90 active:scale-95"
            >
              Create Chatbot
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-lg py-xs text-body-md font-bold text-on-primary-container transition-transform hover:opacity-90 active:scale-95"
            >
              Dashboard <Icon name="arrow_forward" className="text-base" />
            </Link>
          </SignedIn>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pb-24 pt-32">
          <div className="hero-glow" />
          <div className="relative z-10 mx-auto max-w-[1280px] px-lg text-center">
            <div className="mb-xl inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-high px-3 py-1">
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="font-label-caps text-primary">NEW: Web Crawling + RAG Live</span>
            </div>
            <h1 className="mx-auto mb-lg max-w-4xl font-display text-display">
              Turn Your Content Into an <span className="text-gradient">AI Assistant</span>
            </h1>
            <p className="mx-auto mb-2xl max-w-4xl font-body-lg text-on-surface-variant">
              Train a custom AI chatbot on your website content, documentation, and PDF files in
              minutes. Provide instant support and search to your users with zero coding required.
            </p>
            <div className="mb-3xl flex flex-col justify-center gap-md sm:flex-row">
              <Link
                href="/sign-up"
                className="flex items-center justify-center gap-xs rounded-xl bg-primary-container px-2xl py-md font-body-lg font-bold text-on-primary-container transition-all hover:shadow-[0_0_30px_rgba(79,70,229,0.3)]"
              >
                Start Free
                <Icon name="arrow_forward" />
              </Link>
              <a
                href="#pricing"
                className="rounded-xl border border-outline-variant bg-surface-container-high px-2xl py-md font-body-lg font-bold text-on-surface transition-colors hover:bg-surface-container-highest"
              >
                View Pricing
              </a>
            </div>

            {/* Mockup */}
            <div className="glass-card relative mx-auto max-w-5xl rounded-2xl p-sm shadow-2xl">
              <div className="absolute -left-12 -top-12 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
              <div className="absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-secondary/20 blur-[100px]" />
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-surface-container-lowest">
                <div className="glass-card flex h-[60%] w-[80%] items-center justify-center rounded-2xl border-primary/20">
                  <div className="w-full p-xl text-left">
                    <div className="mb-lg flex items-center gap-md">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                        <Icon name="neurology" />
                      </div>
                      <div>
                        <h4 className="font-headline-md">Knowledge Base Syncing…</h4>
                        <p className="font-body-sm text-on-surface-variant">
                          Crawling: help.chatforge.ai
                        </p>
                      </div>
                    </div>
                    <div className="mb-md h-2 w-full rounded-full bg-surface-container-highest">
                      <div className="h-full w-[75%] rounded-full bg-primary shadow-[0_0_10px_#c3c0ff]" />
                    </div>
                    <div className="flex justify-between font-label-mono text-primary">
                      <span>324 Pages Found</span>
                      <span>75% Complete</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="relative overflow-hidden bg-surface-container-lowest py-24">
          <div className="mx-auto max-w-[1280px] px-lg">
            <div className="mb-3xl text-center">
              <h2 className="mb-md font-display text-headline-lg">Built for Modern Teams</h2>
              <p className="mx-auto max-w-4xl font-body-md text-on-surface-variant">
                Everything you need to deploy enterprise-grade AI assistants without writing a
                single line of code.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className={`glass-card group rounded-2xl p-xl ${f.featured ? "border-primary/20 bg-primary/5" : ""
                    }`}
                >
                  <div
                    className={`mb-lg flex h-12 w-12 items-center justify-center rounded-xl ${f.tint} transition-transform group-hover:scale-110`}
                  >
                    <Icon name={f.icon} className="text-3xl" />
                  </div>
                  <h3 className="mb-sm font-headline-md">{f.title}</h3>
                  <p className="font-body-md text-on-surface-variant">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="relative overflow-hidden py-24">
          <div className="absolute left-1/2 top-0 h-px w-full -translate-x-1/2 bg-gradient-to-r from-transparent via-outline-variant to-transparent" />
          <div className="mx-auto max-w-[1280px] px-lg">
            <div className="mb-3xl text-center">
              <h2 className="mb-md font-display text-headline-lg">Scalable Pricing Plans</h2>
              <p className="font-body-md text-on-surface-variant">
                Choose the perfect plan for your business needs.
              </p>
            </div>
            <LandingPricing />
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="mx-auto max-w-4xl px-lg">
            <div className="glass-card relative overflow-hidden rounded-[2rem] p-3xl text-center">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
              <div className="relative z-10">
                <h2 className="mb-lg font-display text-headline-lg">
                  Ready to transform your support?
                </h2>
                <p className="mx-auto mb-2xl max-w-4xl font-body-lg text-on-surface-variant">
                  Join teams using ChatForge AI to automate their knowledge base.
                </p>
                <div className="flex flex-col justify-center gap-md sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="rounded-xl bg-primary px-2xl py-md font-body-lg font-bold text-on-primary transition-transform hover:scale-105"
                  >
                    Create Your First Bot
                  </Link>
                  <Link
                    href="/sign-in"
                    className="rounded-xl border border-white/10 bg-surface-container-highest px-2xl py-md font-body-lg font-bold transition-colors hover:bg-surface-container"
                  >
                    Sign In
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-surface-container-lowest pb-12 pt-24">
        <div className="mx-auto max-w-[1280px] px-lg">
          <div className="mb-24 grid grid-cols-2 gap-xl md:grid-cols-4 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-2">
              <div className="mb-lg flex items-center gap-xs">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container">
                  <Icon name="smart_toy" filled className="text-white" />
                </div>
                <span className="font-display text-headline-md font-bold">ChatForge AI</span>
              </div>
              <p className="mb-xl max-w-4xs font-body-sm text-on-surface-variant">
                The intelligent layer for your business content. Built with privacy and scale in
                mind.
              </p>
            </div>
            {[
              ["Product", ["Features", "Integrations", "Pricing", "Changelog"]],
              ["Resources", ["Documentation", "Help Center", "Blog", "AI Guide"]],
              ["Legal", ["Privacy", "Terms", "Security", "Cookie Policy"]],
            ].map(([heading, links]) => (
              <div key={heading as string}>
                <h5 className="mb-lg font-label-caps text-on-surface">{heading}</h5>
                <ul className="space-y-sm font-body-sm text-on-surface-variant">
                  {(links as string[]).map((l) => (
                    <li key={l}>
                      <a href="#" className="transition-colors hover:text-primary">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-between border-t border-white/5 pt-12 font-label-mono text-body-sm text-on-surface-variant/40 md:flex-row">
            <p>© {new Date().getFullYear()} ChatForge AI Inc. All rights reserved.</p>
            <div className="mt-md flex gap-lg md:mt-0">
              <span>System Status: Operational</span>
              <span>v2.4.0-stable</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
