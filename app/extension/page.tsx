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
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-2xl px-5 py-16">
        <Puzzle className="size-12 text-indigo-400" />
        <h1 className="mt-6 text-3xl font-semibold">GitVision Extension</h1>
        <p className="mt-4 text-slate-300">
          The extension adds Preview, Flowchart, Video, and Related repos buttons to any GitHub repo page.
          Use it directly from GitHub without leaving the site.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button asChild size="lg">
            <a href="/api/extension-download" download="gitvision-extension.zip">
              Download extension
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold">Install steps</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Click &quot;Download extension&quot; above (zip downloads automatically)</li>
            <li>Extract the zip: right-click → &quot;Extract All&quot; (Windows) or double-click (Mac)</li>
            <li>Open Chrome and go to <code className="rounded bg-white/10 px-1">chrome://extensions</code></li>
            <li>Enable &quot;Developer mode&quot; (top right)</li>
            <li>Click &quot;Load unpacked&quot; and select the extracted folder</li>
            <li>Go to any GitHub repo — the extension runs automatically and the buttons appear</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
