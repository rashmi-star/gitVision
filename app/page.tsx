import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Understand any repo instantly",
    description: "Paste a GitHub URL and GitVision explains what the product is, what stack it uses, and how users interact.",
  },
  {
    title: "Preview the product safely",
    description: "GitVision creates a sandbox preview and mocks missing APIs, assets, and data when setup is incomplete.",
  },
  {
    title: "Turn code into a clear product story",
    description: "Get product overviews, feature breakdowns, architecture summaries, and demo-ready explanations.",
  },
];

const steps = [
  "Paste your GitHub link.",
  "GitVision analyzes product type, stack, UI, APIs, and architecture.",
  "Launch a sandbox preview with simulated missing data and assets.",
  "Get a complete product narrative you can share.",
];

const benefits = [
  "Faster product discovery",
  "No setup required",
  "Better team communication",
  "Clear demos from real code",
];

const useCases = [
  "Developers exploring new repos",
  "Product managers understanding technical projects",
  "Startup teams preparing demos",
  "Engineers onboarding to new codebases",
  "Anyone trying to understand a GitHub project",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-slate-300" />
            <span className="text-sm font-semibold tracking-wide">GitVision</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#why" className="hover:text-white">Why GitVision</a>
            <a href="#use" className="hover:text-white">How it works</a>
          </nav>
          <Button asChild size="sm">
            <Link href="/studio">
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-16 pt-20 text-center">
        <Badge className="mb-4 border-[#60626B] bg-[#2C2D31] text-white">
          See what a GitHub project actually does, instantly.
        </Badge>
        <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-tight md:text-6xl">
          See what a GitHub project actually does instantly.
        </h1>
        <p className="mt-6 max-w-3xl text-balance text-lg text-slate-300">
          Most repositories are hard to understand. You see files and code, but no clear explanation of the product.
          GitVision shows what it does, how it works, what screens/tools it has, and how to demo it. No install needed.
        </p>
        <p className="mt-3 text-sm text-slate-400">From repo to product understanding in seconds.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/studio">
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#how">Learn more</a>
          </Button>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-5 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">What GitVision does</p>
          <h2 className="mt-2 text-3xl font-semibold">Understand any repo, preview it safely, explain it clearly</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="rounded-xl border border-white/10 bg-white/5 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg text-white">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-300">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="why" className="mx-auto w-full max-w-6xl px-5 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Why teams use GitVision</p>
          <h2 className="mt-2 text-3xl font-semibold">Why teams use GitVision</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <CheckCircle2 className="mt-0.5 size-4 text-slate-300" />
              <p className="text-sm text-slate-200">{benefit}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="use" className="mx-auto w-full max-w-6xl px-5 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold">From GitHub link to product narrative</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <Card key={step} className="border-white/10 bg-white/5">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-200">
                  {index + 1}
                </span>
                <p className="text-sm text-slate-200">{step}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Perfect for</p>
          <h2 className="mt-2 text-3xl font-semibold">Teams that need fast repo understanding</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {useCases.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <CheckCircle2 className="mt-0.5 size-4 text-slate-300" />
              <p className="text-sm text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-16">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
          <h3 className="text-2xl font-semibold">Turn code into clarity</h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300">
            Paste a GitHub repo and get complete product understanding instantly.
          </p>
          <Button asChild className="mt-6" size="lg">
            <Link href="/studio">
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
