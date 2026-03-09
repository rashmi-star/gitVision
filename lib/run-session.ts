import { ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { builtinModules } from "node:module";
import { simpleGit } from "simple-git";
import { generateTextWithFallback } from "@/lib/openai";

type SessionStatus = "starting" | "running" | "failed" | "stopped";
type RunMode = "node" | "python" | "static";

type RunPlan = {
  mode: RunMode;
  appDir: string;
  installCommand: string;
  buildCommand?: string;
  startCommand: string;
  fallbackStartCommand?: string;
  entryPath?: string;
  reason: string;
};

export type RunSession = {
  id: string;
  repositoryUrl: string;
  tempDir: string;
  appDir: string;
  port: number;
  installCommand: string;
  startCommand: string;
  status: SessionStatus;
  logs: string[];
  process?: ChildProcess;
  mockServer?: http.Server;
  staticServer?: http.Server;
  mockApiPort?: number;
  mockedEnv?: Record<string, string>;
  previewPath?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const globalStore = globalThis as typeof globalThis & {
  __productVisionRuns?: Map<string, RunSession>;
};

const sessionStore = globalStore.__productVisionRuns ?? new Map<string, RunSession>();
globalStore.__productVisionRuns = sessionStore;

export function getSession(id: string) {
  return sessionStore.get(id);
}

export function listSessions() {
  return [...sessionStore.values()];
}

export async function stopSession(id: string) {
  const session = sessionStore.get(id);
  if (!session) return null;

  try {
    if (session.process && !session.process.killed) {
      session.process.kill();
    }
    if (session.mockServer) {
      await new Promise<void>((resolve) => {
        session.mockServer?.close(() => resolve());
      });
    }
    if (session.staticServer) {
      await new Promise<void>((resolve) => {
        session.staticServer?.close(() => resolve());
      });
    }
  } catch {
    // Ignore kill failures.
  }

  session.status = "stopped";
  session.updatedAt = new Date().toISOString();
  session.logs.push("Session stopped.");

  await safeRemoveDir(session.tempDir);
  return session;
}

export async function startRepoSession(repositoryUrl: string, openaiApiKey?: string) {
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(repositoryUrl)) {
    throw new Error("Only GitHub repository URLs are supported in sandbox run mode.");
  }

  await cleanupOldSandboxWorkspaces();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "product-vision-run-"));
  const id = crypto.randomUUID();
  const port = await pickPort();
  const installEnv = buildInstallEnv(tempDir);

  const seed: RunSession = {
    id,
    repositoryUrl,
    tempDir,
    appDir: tempDir,
    port,
    installCommand: "",
    startCommand: "",
    status: "starting",
    logs: [`Created sandbox workspace: ${tempDir}`],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sessionStore.set(id, seed);

  try {
    const git = simpleGit();
    seed.logs.push("Cloning repository...");
    await git.clone(repositoryUrl, tempDir, ["--depth", "1"]);

    const plan = await buildRunPlan(tempDir, port, openaiApiKey);
    seed.appDir = path.resolve(tempDir, plan.appDir || ".");
    seed.installCommand = plan.installCommand || "";
    const buildCommand = plan.buildCommand || "";
    const fallbackStartCommand = plan.fallbackStartCommand || "";
    seed.startCommand = plan.startCommand;
    seed.logs.push(`Run planner mode: ${plan.mode}`);
    seed.logs.push(`Run planner reason: ${plan.reason}`);
    seed.logs.push(`Selected app directory: ${seed.appDir}`);
    if (seed.installCommand) {
      seed.logs.push(`Install command: ${seed.installCommand}`);
    }
    if (buildCommand) {
      seed.logs.push(`Build command: ${buildCommand}`);
    }
    seed.logs.push(`Start command: ${seed.startCommand}`);
    if (fallbackStartCommand) {
      seed.logs.push(`Fallback start command: ${fallbackStartCommand}`);
    }

    if (plan.mode === "static") {
      const staticEntry = plan.entryPath || (await detectStaticEntry(tempDir));
      if (!staticEntry) {
        throw new Error("Static mode selected but no HTML entry file was found.");
      }
      seed.previewPath = `/${staticEntry.replaceAll("\\", "/")}`;
      seed.staticServer = await startStaticServer(tempDir, staticEntry, port);
      seed.status = "running";
      seed.updatedAt = new Date().toISOString();
      seed.logs.push(`Sandbox app is running at http://127.0.0.1:${port}${seed.previewPath}`);
      return seed;
    }

    const mockApiPort = await pickPort();
    const mockServer = startMockApiServer(mockApiPort);
    seed.mockApiPort = mockApiPort;
    seed.mockServer = mockServer;
    seed.logs.push(`Mock API server: http://127.0.0.1:${mockApiPort}`);

    const envVars = await detectEnvVarNames(seed.appDir);
    const mockedEnv = await buildMockEnvValues(envVars, `http://127.0.0.1:${mockApiPort}`, openaiApiKey);
    seed.mockedEnv = mockedEnv;
    if (Object.keys(mockedEnv).length > 0) {
      seed.logs.push(`Injected mock env vars (${Object.keys(mockedEnv).length}).`);
    }

    if (seed.installCommand) {
      await runInstall(seed.installCommand, seed.appDir, seed, installEnv);
      await autoInstallMissingNodeDeps(seed.appDir, seed.installCommand, seed, installEnv);
    }
    if (buildCommand) {
      try {
        await runBuild(buildCommand, seed.appDir, seed);
      } catch (error) {
        if (fallbackStartCommand) {
          seed.logs.push(
            `Build failed. Falling back to dev preview command: ${fallbackStartCommand}`,
          );
          seed.startCommand = fallbackStartCommand;
        } else {
          throw error;
        }
      }
    }
    await runStart(seed.startCommand, seed.appDir, seed, mockedEnv);
    await waitForHttp(`http://127.0.0.1:${port}`, 90_000);

    seed.status = "running";
    seed.updatedAt = new Date().toISOString();
    seed.logs.push(`Sandbox app is running at http://127.0.0.1:${port}`);
    return seed;
  } catch (error) {
    seed.status = "failed";
    seed.error = error instanceof Error ? error.message : "Failed to run repository.";
    seed.updatedAt = new Date().toISOString();
    seed.logs.push(`Run failed: ${seed.error}`);
    await safeRemoveDir(tempDir);
    return seed;
  }
}

async function detectBestAppDir(root: string) {
  const candidates: string[] = [];
  await walk(root, candidates);
  if (candidates.length === 0) {
    return null;
  }

  let bestPath = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    try {
      const text = await readFile(path.join(candidate, "package.json"), "utf8");
      const pkg = JSON.parse(text) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      let score = 0;
      if (deps.next) score += 5;
      if (deps.react) score += 4;
      if (deps.vue || deps.svelte) score += 3;
      if (deps.vite) score += 2;
      if (pkg.scripts?.dev) score += 3;
      if (pkg.scripts?.start) score += 2;
      if (pkg.scripts?.build) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestPath = candidate;
      }
    } catch {
      continue;
    }
  }

  return bestPath;
}

async function buildRunPlan(root: string, port: number, openaiApiKey?: string): Promise<RunPlan> {
  const aiPlan = await buildRunPlanWithAI(root, port, openaiApiKey);
  if (aiPlan) {
    if (aiPlan.mode === "node") {
      const aiNodeDir = path.resolve(root, aiPlan.appDir || ".");
      if (await exists(path.join(aiNodeDir, "package.json"))) {
        const commands = await detectCommands(aiNodeDir, port);
        return {
          mode: "node",
          appDir: path.relative(root, aiNodeDir) || ".",
          installCommand: commands.installCommand,
          buildCommand: commands.buildCommand,
          startCommand: commands.startCommand,
          fallbackStartCommand: commands.fallbackStartCommand,
          reason: `${aiPlan.reason} (normalized node commands from package.json scripts).`,
        };
      }
    }
    return aiPlan;
  }

  const nodeTarget = await detectBestAppDir(root);
  if (nodeTarget) {
    const commands = await detectCommands(nodeTarget, port);
    return {
      mode: "node",
      appDir: path.relative(root, nodeTarget) || ".",
      installCommand: commands.installCommand,
      buildCommand: commands.buildCommand,
      startCommand: commands.startCommand,
      fallbackStartCommand: commands.fallbackStartCommand,
      reason: "Heuristic Node.js detection via package.json scripts.",
    };
  }

  const pyTarget = await detectPythonAppDir(root);
  if (pyTarget) {
    return {
      mode: "python",
      appDir: path.relative(root, pyTarget.dir) || ".",
      installCommand: pyTarget.installCommand,
      startCommand: pyTarget.startCommand.replaceAll("{PORT}", String(port)),
      reason: "Heuristic Python web app detection.",
    };
  }

  const staticEntry = await detectStaticEntry(root);
  if (staticEntry) {
    return {
      mode: "static",
      appDir: ".",
      installCommand: "",
      startCommand: "",
      entryPath: staticEntry,
      reason: "Fallback to static HTML preview mode.",
    };
  }

  throw new Error("No runnable strategy found (node/python/static).");
}

async function buildRunPlanWithAI(root: string, port: number, openaiApiKey?: string): Promise<RunPlan | null> {
  const key = openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const snapshot = await collectRepoSnapshot(root);
    const prompt = [
      "You are a repository runtime planner.",
      "Return strict JSON object only with keys: mode, appDir, installCommand, startCommand, entryPath, reason.",
      "mode must be one of: node, python, static.",
      "Rules:",
      "- Prefer command that launches local preview for this repo.",
      "- Use only safe commands.",
      "- Use {PORT} placeholder if needed in startCommand.",
      "- appDir must be relative path within repository.",
      "- If static mode, set entryPath to html file path and leave commands empty.",
      `Repository snapshot: ${JSON.stringify(snapshot, null, 2)}`,
    ].join("\n");

    const rawText = await generateTextWithFallback(
      key,
      [
        process.env.OPENAI_ANALYSIS_MODEL || "gpt-4.1-mini",
        process.env.OPENAI_ANALYSIS_FALLBACK_MODEL || "gpt-4o-mini",
      ],
      prompt,
      1100,
    );
    const raw = rawText.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(raw) as Partial<RunPlan>;
    if (!parsed.mode || !parsed.appDir) return null;

    const mode = parsed.mode;
    if (mode !== "node" && mode !== "python" && mode !== "static") return null;

    const appDir = sanitizeRelativePath(parsed.appDir);
    if (!appDir) return null;

    const installCommand = sanitizeCommand(parsed.installCommand || "");
    const buildCommand = sanitizeCommand(parsed.buildCommand || "");
    const startCommand = sanitizeCommand((parsed.startCommand || "").replaceAll("{PORT}", String(port)));
    const fallbackStartCommand = sanitizeCommand(
      (parsed.fallbackStartCommand || "").replaceAll("{PORT}", String(port)),
    );
    const entryPath = parsed.entryPath ? sanitizeRelativePath(parsed.entryPath) : undefined;

    if (mode === "static") {
      if (!entryPath) return null;
      return {
        mode,
        appDir,
        installCommand: "",
        startCommand: "",
        entryPath,
        reason: parsed.reason || "AI-selected static preview mode.",
      };
    }

    if (!startCommand) return null;
    return {
      mode,
      appDir,
      installCommand,
      buildCommand,
      startCommand,
      fallbackStartCommand,
      reason: parsed.reason || "AI-selected run strategy.",
    };
  } catch {
    return null;
  }
}

async function collectRepoSnapshot(root: string) {
  const files: string[] = [];
  await collectFiles(root, files);
  const rel = files.map((f) => path.relative(root, f).replaceAll("\\", "/"));
  const sample = rel.slice(0, 250);
  const packageJsonCandidates = rel.filter((f) => /(^|\/)package\.json$/i.test(f)).slice(0, 12);
  const readmeFile = rel.find((f) => /(^|\/)readme\.md$/i.test(f));
  const readme = readmeFile ? await readSafe(path.join(root, readmeFile), 5000) : "";
  const pySignals = rel.filter((f) => /(requirements\.txt|pyproject\.toml|manage\.py|app\.py|main\.py)$/i.test(f));

  return {
    files: sample,
    packageJsonFiles: packageJsonCandidates,
    pythonSignals: pySignals,
    readmeExcerpt: readme,
  };
}

function sanitizeRelativePath(input: string) {
  const cleaned = input.replaceAll("\\", "/").replace(/^\/+/, "").trim();
  if (!cleaned || cleaned.includes("..")) return null;
  return cleaned;
}

function sanitizeCommand(command: string) {
  const c = command.trim();
  if (!c) return "";
  if (/[;&|><`]/.test(c)) return "";
  if (!/^(npm|pnpm|yarn|bun|python|python3|uv|poetry|pip)\b/i.test(c)) return "";
  return c;
}

async function detectPythonAppDir(root: string) {
  const files: string[] = [];
  await collectFiles(root, files);
  const rel = files.map((f) => path.relative(root, f).replaceAll("\\", "/"));

  const manage = rel.find((f) => /(^|\/)manage\.py$/i.test(f));
  if (manage) {
    const dir = path.join(root, path.dirname(manage));
    const installCommand = (await exists(path.join(dir, "requirements.txt"))) ? "pip install -r requirements.txt" : "";
    return { dir, installCommand, startCommand: "python manage.py runserver 127.0.0.1:{PORT}" };
  }

  const appPy = rel.find((f) => /(^|\/)(app|main)\.py$/i.test(f));
  if (appPy) {
    const dir = path.join(root, path.dirname(appPy));
    const installCommand = (await exists(path.join(dir, "requirements.txt"))) ? "pip install -r requirements.txt" : "";
    const file = path.basename(appPy);
    return { dir, installCommand, startCommand: `python ${file}` };
  }

  return null;
}

async function readSafe(filePath: string, maxChars: number) {
  try {
    const text = await readFile(filePath, "utf8");
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

async function autoInstallMissingNodeDeps(
  appDir: string,
  installCommand: string,
  session: RunSession,
  env: Record<string, string>,
) {
  if (!(await exists(path.join(appDir, "package.json")))) {
    return;
  }

  const missing = await detectMissingNpmDeps(appDir);
  if (missing.length === 0) {
    return;
  }

  const filtered = missing
    .filter((dep) => !isToolingPackage(dep))
    .slice(0, 6);

  if (filtered.length === 0) {
    session.logs.push("Auto-heal: only tooling deps were missing; skipping auto-install.");
    return;
  }

  session.logs.push(`Auto-heal: attempting missing deps: ${filtered.join(", ")}`);

  const manager = detectPackageManagerFromInstallCommand(installCommand);
  if (!manager) {
    session.logs.push("Auto-heal: unsupported package manager for dependency patch.");
    return;
  }

  for (const dep of filtered) {
    const addCommand = buildSingleAddCommand(manager, dep);
    session.logs.push(`Auto-heal: installing "${dep}"`);
    try {
      await runCommand(addCommand, appDir, session, 2 * 60_000, env);
    } catch {
      session.logs.push(`Auto-heal: failed to install "${dep}", continuing.`);
    }
  }
}

async function detectMissingNpmDeps(appDir: string) {
  const pkgRaw = await readFile(path.join(appDir, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);

  const files: string[] = [];
  await collectFiles(appDir, files);
  const jsLike = files.filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/i.test(f)).slice(0, 1200);

  const imported = new Set<string>();
  const importRegex =
    /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]|require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

  for (const file of jsLike) {
    try {
      const content = await readFile(file, "utf8");
      let match = importRegex.exec(content);
      while (match) {
        const spec = match[1] || match[2];
        const dep = normalizePackageSpecifier(spec);
        if (dep) imported.add(dep);
        match = importRegex.exec(content);
      }
      importRegex.lastIndex = 0;
    } catch {
      continue;
    }
  }

  const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
  return [...imported].filter((dep) => !declared.has(dep) && !builtins.has(dep)).slice(0, 20);
}

function normalizePackageSpecifier(spec: string) {
  if (!spec) return null;
  if (
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("http://") ||
    spec.startsWith("https://") ||
    spec.startsWith("node:") ||
    spec.startsWith("@/") ||
    spec.startsWith("~/") ||
    spec.startsWith("#") ||
    spec.startsWith("virtual:")
  ) {
    return null;
  }

  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  return spec.split("/")[0];
}

function detectPackageManagerFromInstallCommand(installCommand: string) {
  const normalized = installCommand.trim().toLowerCase();
  if (normalized.startsWith("pnpm")) return "pnpm";
  if (normalized.startsWith("yarn")) return "yarn";
  if (normalized.startsWith("npm")) return "npm";
  return "";
}

function buildSingleAddCommand(manager: string, dep: string) {
  if (manager === "pnpm") return `pnpm add ${dep}`;
  if (manager === "yarn") return `yarn add ${dep}`;
  return `npm install ${dep}`;
}

function isToolingPackage(dep: string) {
  return /^(eslint|@eslint\/|prettier|typescript|typescript-eslint|@types\/|@typescript-eslint\/|vite|webpack|rollup|babel|@babel\/)/i.test(
    dep,
  );
}

function extractNoTargetPackage(logs: string[]) {
  const joined = logs.slice(-200).join("\n");
  const match = joined.match(/No matching version found for\s+([a-zA-Z0-9@/._-]+)@([^\s]+)/i);
  if (!match) return null;

  return {
    name: match[1],
    requested: match[2],
    fullSpec: `${match[1]}@${match[2]}`,
  };
}

async function walk(current: string, candidates: string[]) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
      continue;
    }

    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, candidates);
      continue;
    }
    if (entry.isFile() && entry.name === "package.json") {
      candidates.push(path.dirname(abs));
    }
  }
}

async function detectCommands(appDir: string, port: number) {
  const text = await readFile(path.join(appDir, "package.json"), "utf8");
  const pkg = JSON.parse(text) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const scripts = pkg.scripts ?? {};
  const hasNpmLock = await exists(path.join(appDir, "package-lock.json"));
  const hasPnpmLock = await exists(path.join(appDir, "pnpm-lock.yaml"));
  const hasYarnLock = await exists(path.join(appDir, "yarn.lock"));

  const runner = hasPnpmLock ? "pnpm" : hasYarnLock ? "yarn" : "npm";
  const installCommand = runner === "yarn" ? "yarn install" : `${runner} install`;
  const canBuild = Boolean(scripts.build);

  let startScript = "";
  if (scripts.start) startScript = "start";
  else if (scripts.dev) startScript = "dev";
  else if (scripts.preview) startScript = "preview";
  else throw new Error("No dev/start/preview script found.");

  let startCommand = "";
  let buildCommand = "";
  let fallbackStartCommand = "";
  if (runner === "npm") {
    startCommand = `npm run ${startScript} -- --port ${port}`;
    if (scripts.dev) fallbackStartCommand = `npm run dev -- --port ${port}`;
    if (startScript === "start" && canBuild) buildCommand = "npm run build -- --no-lint";
  } else if (runner === "pnpm") {
    startCommand = `pnpm run ${startScript} -- --port ${port}`;
    if (scripts.dev) fallbackStartCommand = `pnpm run dev -- --port ${port}`;
    if (startScript === "start" && canBuild) buildCommand = "pnpm run build -- --no-lint";
  } else {
    startCommand = `yarn ${startScript} --port ${port}`;
    if (scripts.dev) fallbackStartCommand = `yarn dev --port ${port}`;
    if (startScript === "start" && canBuild) buildCommand = "yarn build --no-lint";
  }

  const startScriptBody = scripts[startScript] ?? "";
  const isExpo =
    Boolean(deps.expo) || /\bexpo\s+start\b/i.test(startScriptBody) || /\bexpo\b/i.test(startScriptBody);
  if (isExpo) {
    if (runner === "npm") {
      startCommand = `npm run ${startScript} -- --web --port ${port}`;
      fallbackStartCommand = startCommand;
    } else if (runner === "pnpm") {
      startCommand = `pnpm run ${startScript} -- --web --port ${port}`;
      fallbackStartCommand = startCommand;
    } else {
      startCommand = `yarn ${startScript} --web --port ${port}`;
      fallbackStartCommand = startCommand;
    }
    buildCommand = "";
  }

  if (!hasNpmLock && !hasPnpmLock && !hasYarnLock) {
    return { installCommand: "npm install", buildCommand, startCommand, fallbackStartCommand };
  }

  return { installCommand, buildCommand, startCommand, fallbackStartCommand };
}

async function runInstall(command: string, cwd: string, session: RunSession, env: Record<string, string>) {
  session.logs.push("Installing dependencies...");
  try {
    await runCommand(command, cwd, session, 10 * 60_000, env);
  } catch (error) {
    session.logs.push(`Install failed with command: ${command}`);

    if (isPlainNpmInstallCommand(command)) {
      const fallbackInstall = "npm install --legacy-peer-deps --no-audit --no-fund";
      session.logs.push(`Install recovery: retrying with ${fallbackInstall}`);
      try {
        await runCommand(fallbackInstall, cwd, session, 10 * 60_000, env);
        return;
      } catch {
        session.logs.push("Install recovery with --legacy-peer-deps also failed.");
      }
    }

    const target = extractNoTargetPackage(session.logs);
    if (!target) {
      throw error;
    }

    session.logs.push(
      `Install recovery: ${target.fullSpec} not found. Installing ${target.name}@latest and retrying install.`,
    );
    await runCommand(`npm install ${target.name}@latest`, cwd, session, 3 * 60_000, env);
    await runCommand(command, cwd, session, 10 * 60_000, env);
  }
}

function isPlainNpmInstallCommand(command: string) {
  const normalized = command.trim().toLowerCase();
  return normalized === "npm install" || normalized === "npm i";
}

async function runBuild(command: string, cwd: string, session: RunSession) {
  session.logs.push("Building application for production preview...");
  await runCommand(command, cwd, session, 8 * 60_000);
}

async function runStart(
  command: string,
  cwd: string,
  session: RunSession,
  mockedEnv: Record<string, string>,
) {
  session.logs.push("Starting application...");
  const child = spawn(command, {
    cwd,
    shell: true,
    env: {
      ...process.env,
      ...mockedEnv,
      PORT: String(session.port),
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
    },
    windowsHide: true,
  });

  session.process = child;
  child.stdout?.on("data", (data: Buffer) => {
    session.logs.push(data.toString("utf8").trim());
  });
  child.stderr?.on("data", (data: Buffer) => {
    session.logs.push(data.toString("utf8").trim());
  });
  child.on("exit", (code) => {
    if (session.status !== "running") {
      session.status = "failed";
      session.error = `Process exited with code ${code ?? "unknown"}.`;
    } else {
      session.status = "stopped";
    }
    session.updatedAt = new Date().toISOString();
  });
}

async function runCommand(
  command: string,
  cwd: string,
  session: RunSession,
  timeoutMs: number,
  envOverrides: Record<string, string> = {},
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...envOverrides },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command}`));
    }, timeoutMs);

    child.stdout?.on("data", (data: Buffer) => {
      session.logs.push(data.toString("utf8").trim());
    });
    child.stderr?.on("data", (data: Buffer) => {
      session.logs.push(data.toString("utf8").trim());
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${command}) with exit code ${code}`));
    });
  });
}

function buildInstallEnv(tempDir: string) {
  const npmCacheDir = path.join(tempDir, ".npm-cache");
  return {
    npm_config_cache: npmCacheDir,
    NPM_CONFIG_CACHE: npmCacheDir,
  };
}

async function cleanupOldSandboxWorkspaces() {
  const tmpRoot = os.tmpdir();
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(tmpRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("product-vision-run-"))
    .map((entry) => path.join(tmpRoot, entry.name));

  const stats = await Promise.all(
    candidates.map(async (dir) => {
      try {
        const info = await stat(dir);
        return { dir, mtimeMs: info.mtimeMs };
      } catch {
        return null;
      }
    }),
  );

  const existing = stats.filter((item): item is { dir: string; mtimeMs: number } => Boolean(item));
  existing.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keep = new Set(existing.slice(0, 2).map((item) => item.dir));

  for (const item of existing) {
    if (keep.has(item.dir)) continue;
    await safeRemoveDir(item.dir);
  }
}

async function safeRemoveDir(dir: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

async function exists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function pickPort() {
  return new Promise<number>((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function waitForHttp(url: string, timeoutMs: number) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const poll = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for local preview server to start."));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        if ((res.statusCode ?? 500) < 500) {
          resolve();
        } else {
          setTimeout(poll, 1200);
        }
      });
      req.on("error", () => setTimeout(poll, 1200));
      req.setTimeout(5000, () => {
        req.destroy();
        setTimeout(poll, 1200);
      });
    };
    poll();
  });
}

async function detectStaticEntry(root: string) {
  const htmlFiles: string[] = [];
  await collectHtmlFiles(root, root, htmlFiles);

  if (htmlFiles.length === 0) return null;

  const preferred =
    htmlFiles.find((file) => /^index\.html$/i.test(file)) ||
    htmlFiles.find((file) => /\/index\.html$/i.test(file)) ||
    htmlFiles.find((file) => /\/(home|main)\.html$/i.test(file)) ||
    htmlFiles[0];

  return preferred;
}

async function collectHtmlFiles(root: string, current: string, out: string[]) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "build" ||
      entry.name.startsWith(".next")
    ) {
      continue;
    }
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectHtmlFiles(root, abs, out);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      out.push(path.relative(root, abs));
    }
  }
}

function startStaticServer(root: string, entryPath: string, port: number) {
  const entryNormalized = normalizeFsPath(entryPath);
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(reqUrl.pathname);
      if (pathname === "/") pathname = `/${entryNormalized}`;

      const relative = normalizeFsPath(pathname.replace(/^\/+/, ""));
      const absolute = path.resolve(root, relative);
      if (!absolute.startsWith(path.resolve(root))) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      let contentPath = absolute;
      let contentType = contentTypeFor(contentPath);
      let content: Buffer;

      try {
        content = await readFile(contentPath);
      } catch {
        if (!path.extname(relative)) {
          contentPath = path.resolve(root, entryNormalized);
          contentType = contentTypeFor(contentPath);
          content = await readFile(contentPath);
        } else {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
      }

      res.setHeader("Content-Type", contentType);
      res.statusCode = 200;
      res.end(content);
    } catch {
      res.statusCode = 500;
      res.end("Internal error");
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function normalizeFsPath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function contentTypeFor(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "text/plain; charset=utf-8";
}

async function detectEnvVarNames(root: string) {
  const vars = new Set<string>();
  const files: string[] = [];
  await collectFiles(root, files);

  for (const file of files.slice(0, 300)) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i.test(file)) continue;
    try {
      const content = await readFile(file, "utf8");
      const matches = content.match(/process\.env\.([A-Z0-9_]+)/g) ?? [];
      for (const match of matches) {
        const name = match.split(".").at(-1);
        if (name) vars.add(name);
      }
    } catch {
      continue;
    }
  }

  return [...vars];
}

async function collectFiles(current: string, out: string[]) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
      continue;
    }
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(abs, out);
      continue;
    }
    out.push(abs);
  }
}

function startMockApiServer(port: number) {
  const server = http.createServer((req, res) => {
    const method = req.method || "GET";
    const pathName = req.url || "/";
    const payload = {
      mocked: true,
      method,
      path: pathName,
      timestamp: new Date().toISOString(),
      items: [
        { id: 1, name: "Mock Item A", status: "active" },
        { id: 2, name: "Mock Item B", status: "pending" },
      ],
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.statusCode = 200;
    res.end(JSON.stringify(payload));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

async function buildMockEnvValues(
  envNames: string[],
  mockApiBaseUrl: string,
  openaiApiKey?: string,
) {
  const base: Record<string, string> = {};

  for (const name of envNames) {
    base[name] = heuristicMockValue(name, mockApiBaseUrl);
  }

  if (!openaiApiKey || envNames.length === 0) {
    return base;
  }

  try {
    const prompt = [
      "Generate JSON object mapping env variable names to safe mock string values for local development.",
      "Use localhost URLs for API/storage vars and realistic placeholders for auth vars.",
      `Env names: ${JSON.stringify(envNames)}`,
      "Return only JSON object.",
    ].join("\n");
    const rawText = await generateTextWithFallback(
      openaiApiKey,
      [process.env.OPENAI_DEMO_MODEL || "gpt-4.1-mini", process.env.OPENAI_DEMO_FALLBACK_MODEL || "gpt-4o-mini"],
      prompt,
      800,
    );
    const raw = rawText.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: Record<string, string> = {};
    for (const key of envNames) {
      const value = parsed[key];
      normalized[key] = typeof value === "string" && value.length > 0 ? value : base[key];
    }
    return normalized;
  } catch {
    return base;
  }
}

function heuristicMockValue(name: string, mockApiBaseUrl: string) {
  if (/API_URL|BASE_URL|BACKEND_URL|SERVICE_URL|ENDPOINT/i.test(name)) return mockApiBaseUrl;
  if (/CLIENT_ID/i.test(name)) return "mock-client-id";
  if (/CLIENT_SECRET|SECRET|TOKEN|KEY/i.test(name)) return "mock-secret-value";
  if (/AUTH_DOMAIN|DOMAIN/i.test(name)) return "localhost";
  if (/PROJECT_ID/i.test(name)) return "mock-project";
  if (/BUCKET|STORAGE/i.test(name)) return "mock-bucket";
  if (/APP_ID/i.test(name)) return "mock-app-id";
  if (/REGION/i.test(name)) return "us-central1";
  if (/EMULATOR|MOCK/i.test(name)) return "true";
  return "mock-value";
}
