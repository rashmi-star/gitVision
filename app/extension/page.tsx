import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Puzzle } from "lucide-react";

import { Button } from "@/components/ui/button";

const CHROME_STORE_URL = process.env.NEXT_PUBLIC_EXTENSION_URL;

export default function ExtensionPage() {
  if (CHROME_STORE_URL) {
    redirect(CHROME_STORE_URL);
  }

  return (
    <main className="min-h-screen bg-black text-slate-100">
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-2xl px-5 py-16">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10">
          <Puzzle className="size-7 text-indigo-400" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">GitVision Extension</h1>
        <p className="mt-4 text-slate-400 leading-relaxed">
          The extension adds Preview, Flowchart, and Video to any GitHub repo page. Use Ctrl+G for summary, Ctrl+R for related repos.
          Use it directly from GitHub without leaving the site.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="shadow-lg shadow-indigo-500/20">
            <a href="/api/extension-download" download="gitvision-extension.zip">
              <Puzzle className="size-4" />
              Download extension
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
        <div className="mt-8 overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-6">
          <h2 className="font-semibold text-slate-200">Install steps</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-400 leading-relaxed">
            <li>Click &quot;Download extension&quot; above (zip downloads automatically)</li>
            <li>Extract the zip: right-click → &quot;Extract All&quot; (Windows) or double-click (Mac)</li>
            <li>Open Chrome and go to <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300">chrome://extensions</code></li>
            <li>Enable &quot;Developer mode&quot; (top right)</li>
            <li>Click &quot;Load unpacked&quot; and select the extracted folder</li>
            <li>Go to any GitHub repo — the extension runs automatically and the buttons appear</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
