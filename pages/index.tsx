import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabaseClient";

const CODEX_WEB_URL = "https://chatgpt.com/codex";

type ToolGuide = {
  title: string;
  summary: string;
  steps: readonly string[];
  proTips?: readonly string[];
  commandBlock?: string | null;
  promptBlocks?: readonly string[];
};

const TOOL_GUIDES = {
  "codex-web": {
    title: "GPT-5 Codex Web",
    summary: "All-in-one browser workspace. Great for demos and shipping in minutes.",
    steps: [
      `Sign in at ${CODEX_WEB_URL} and create a fresh workspace for this project.`,
      "Upload or paste your existing files into the file tree so Codex can reference them.",
      "Set a system message that captures your stack, coding style, and any don't-touch areas before you start prompting.",
      "Work in short loops: describe the change, ask for the diff, review, and run the built-in preview/server.",
      "Use the workspace history panel as your time machine if you need to rewind to a previous version."
    ],
    proTips: [
      "Lean on the built-in preview server to verify UI changes before committing.",
      "Use Comment mode to ask Codex to explain or refactor existing code before you accept it."
    ],
    commandBlock: null,
    promptBlocks: []
  },
  "codex-cli-ide": {
    title: "Codex CLI or IDE",
    summary: "Stay in your editor or terminal while Codex applies the heavy lifting to your local files.",
    steps: [
      "Install Codex globally with `npm install -g @openai/codex` (Node 18+ recommended).",
      "In your terminal, `cd` into the folder where you want this project to live.",
      "Clone your repository locally, then move into the project directory.",
      "Launch Codex by running `codex` (log in if prompted) and keep that session open while you build.",
      "Make sure your GitHub SSH key is configured so cloning and pushing work without friction.",
      "After each verified change, ask Codex to stage, commit, and push before you tackle the next task."
    ],
    proTips: [
      "Pair the CLI session with a watch command (`npm run dev`) so you see results as Codex edits.",
      "Capture prompts that worked well in your README or snippets doc for quick reuse."
    ],
    commandBlock: "npm install -g @openai/codex\ncd ~/projects\ngit clone https://github.com/your-org/your-repo.git\ncd your-repo\ncodex",
    promptBlocks: [
      "Codex, summarize the change we just confirmed, run `git add .`, `git commit -m \"feat: describe change\"`, and `git push` to the current branch."
    ]
  }
} satisfies Record<string, ToolGuide>;

type ToolKey = keyof typeof TOOL_GUIDES;

type ProfileSnapshot = {
  displayName: string;
  buildDescription: string;
  deploymentLink: string;
};

type ProfileUpdatePayload = {
  displayName?: string | null;
  buildDescription?: string | null;
  deploymentLink?: string | null;
};

const DEPLOYMENT_GUIDES = {
  vercel: {
    title: "Deploy to Vercel",
    summary: "Fastest path for Next.js and modern frontends.",
    steps: [
      "Create a project at vercel.com and connect your GitHub repository.",
      "Associate the deployment with the main branch of your GitHub repo.",
      "Add any environment variables your agent called out before shipping (Supabase keys, API tokens, etc.).",
      "Trigger the first deploy by pushing to `main` (or deploy directly from the dashboard).",
      "Use Preview Deployments for QA; promote to Production when it looks good.",
      "Roll back instantly from the Deployments tab if something breaks."
    ],
    proTips: [
      "Enable Password Protection on previews if you're sharing work-in-progress links.",
      "Wire in monitoring (Vercel Analytics or Log Drains) before you share with customers."
    ]
  },
  "github-pages": {
    title: "Deploy to GitHub Pages",
    summary: "Ideal for static builds and docs-style sites.",
    steps: [
      "Run `npm run build` followed by `npm run export` to produce a static `out/` directory.",
      "Push the `out/` folder to a `gh-pages` branch or use `npx gh-pages -d out` to automate.",
      "In your repo settings, enable GitHub Pages and point it to the `gh-pages` branch.",
      "Set the correct `assetPrefix` or `basePath` in `next.config.js` if you're using a custom repo path.",
      "Wait for the build badge to turn green, then copy the public URL into the app."
    ],
    proTips: [
      "Use a GitHub Action (peaceiris/actions-gh-pages) to deploy on every push to `main`.",
      "Remember GitHub Pages is static-API routes won't run there. Stick to client-side Supabase calls."
    ]
  }
} as const;

type DeploymentKey = keyof typeof DEPLOYMENT_GUIDES;

const TERMINAL_CHEAT_SHEET = [
  {
    action: "Go to Downloads folder",
    mac: "cd ~/Downloads",
    windows: "cd %HOMEPATH%\\Downloads"
  },
  {
    action: "Create a project folder",
    mac: "mkdir vibecoding-app",
    windows: "mkdir vibecoding-app"
  },
  {
    action: "Enter that folder",
    mac: "cd vibecoding-app",
    windows: "cd vibecoding-app"
  },
  {
    action: "Clone your repo",
    mac: "git clone https://github.com/your-org/workshop-app.git .",
    windows: "git clone https://github.com/your-org/workshop-app.git ."
  },
  {
    action: "Install Codex CLI",
    mac: "npm install -g @openai/codex",
    windows: "npm install -g @openai/codex"
  },
  {
    action: "Start Codex CLI",
    mac: "codex",
    windows: "codex"
  },
  {
    action: "Install project deps",
    mac: "npm install",
    windows: "npm install"
  },
  {
    action: "Start the app",
    mac: "npm run dev",
    windows: "npm run dev"
  }
];

const ARCHITECTURE_PROMPTS = [
  "Act like a senior tech lead/full stack developer. From the following description make a PRD and add it as an md file in the repo. Verify the md afterwards.",
  "Out of the PRD create the minimum architecture necessary for the MVP. Prefer Next.js with TypeScript if it fits.",
  "Create an md file with an optimized file structure for the project.",
  "I want a todo list containing step by step implementable phases. Each phase should be testable. Save it as an md file in the repo."
];

const EXTERNAL_API_CHECKLIST = [
  "Which third-party APIs or services do we need for this build (auth, payments, email, analytics, etc.)?",
  "For each service, list the environment variables the code expects and where to create the keys/tokens.",
  "Estimate potential costs or usage limits so I know what might be billable during testing."
];

const CHECKLIST_ITEMS = [
  { key: "githubRepoCreated", label: "GitHub repository created" },
  { key: "promptsPrepared", label: "Prompts prepared" },
  { key: "envVariablesSet", label: "Environment variables set" },
  { key: "deploymentConfigured", label: "Deployment configured" },
  { key: "deploymentDone", label: "Deployment done" }
] as const;

type WorkshopState = {
  tool: ToolKey;
  buildDescription: string;
  deployment: DeploymentKey;
  deploymentLink: string;
  confirmedDeploymentLink: string;
};

const INITIAL_STATE: WorkshopState = {
  tool: "codex-web",
  buildDescription: "",
  deployment: "vercel",
  deploymentLink: "",
  confirmedDeploymentLink: ""
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<WorkshopState>(INITIAL_STATE);
  const [status, setStatus] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [authMessage, setAuthMessage] = useState<string>("");
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [profileSnapshot, setProfileSnapshot] = useState<ProfileSnapshot>({
    displayName: "",
    buildDescription: "",
    deploymentLink: ""
  });
  const [showTerminalCheatsheet, setShowTerminalCheatsheet] = useState<boolean>(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    CHECKLIST_ITEMS.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.key] = false;
      return acc;
    }, {})
  );
  const [nameStatus, setNameStatus] = useState<string>("");
  const [buildStatus, setBuildStatus] = useState<string>("");

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription }
    } = supabaseClient.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const toolGuide = useMemo(() => TOOL_GUIDES[state.tool], [state.tool]);
  const deploymentGuide = useMemo(
    () => DEPLOYMENT_GUIDES[state.deployment],
    [state.deployment]
  );

  const showDeploymentLinkBadge = Boolean(state.confirmedDeploymentLink);

  useEffect(() => {
    if (!session) {
      setDisplayName("");
      setProfileSnapshot({ displayName: "", buildDescription: "", deploymentLink: "" });
      setStatus("");
      setNameStatus("");
      setBuildStatus("");
      setState(INITIAL_STATE);
      return;
    }

    const loadProfile = async () => {
      const { data, error } = await supabaseClient
        .from("workshop_profiles")
        .select("display_name, build_description, deployment_link")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load profile", error);
        return;
      }

      const defaultName =
        session.user.user_metadata?.full_name ??
        session.user.user_metadata?.name ??
        session.user.user_metadata?.user_name ??
        (session.user.email ? session.user.email.split("@")[0] : "");

      const mergedDisplayName = data?.display_name ?? defaultName ?? "";
      const mergedBuildDescription = data?.build_description ?? "";
      const mergedDeploymentLink = data?.deployment_link ?? "";

      setDisplayName(mergedDisplayName);
      setProfileSnapshot({
        displayName: mergedDisplayName,
        buildDescription: mergedBuildDescription,
        deploymentLink: mergedDeploymentLink
      });
      setState((prev) => ({
        ...prev,
        buildDescription: mergedBuildDescription,
        deploymentLink: mergedDeploymentLink,
        confirmedDeploymentLink: mergedDeploymentLink
      }));
      setNameStatus("");
      setBuildStatus("");
      setStatus("");
    };

    loadProfile();
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("vibe-workshop-checklist");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setChecklist((prev) => ({ ...prev, ...parsed }));
      } catch (error) {
        console.warn("Failed to parse checklist state", error);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("vibe-workshop-checklist", JSON.stringify(checklist));
  }, [checklist]);

  const upsertProfile = async (updates: ProfileUpdatePayload): Promise<boolean> => {
    if (!session) {
      return false;
    }

    const payload: Record<string, unknown> = {
      user_id: session.user.id,
      updated_at: new Date().toISOString()
    };

    if (updates.displayName !== undefined) {
      payload.display_name = updates.displayName;
    }
    if (updates.buildDescription !== undefined) {
      payload.build_description = updates.buildDescription;
    }
    if (updates.deploymentLink !== undefined) {
      payload.deployment_link = updates.deploymentLink;
    }

    const { error } = await supabaseClient
      .from("workshop_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("Failed to save profile", error);
      return false;
    }

    setProfileSnapshot((prev) => ({
      displayName:
        updates.displayName !== undefined ? (updates.displayName ?? "") : prev.displayName,
      buildDescription:
        updates.buildDescription !== undefined ? (updates.buildDescription ?? "") : prev.buildDescription,
      deploymentLink:
        updates.deploymentLink !== undefined ? (updates.deploymentLink ?? "") : prev.deploymentLink
    }));

    return true;
  };

  const handleConfirmLink = async () => {
    const trimmedLink = state.deploymentLink.trim();
    if (!trimmedLink) {
      setStatus("Add a deployment URL before confirming.");
      return;
    }
    setState((prev) => ({
      ...prev,
      deploymentLink: trimmedLink,
      confirmedDeploymentLink: trimmedLink
    }));
    if (trimmedLink === profileSnapshot.deploymentLink) {
      setStatus("Deployment link already saved.");
      return;
    }
    const saved = await upsertProfile({ deploymentLink: trimmedLink });
    if (!saved) {
      setState((prev) => ({
        ...prev,
        confirmedDeploymentLink: profileSnapshot.deploymentLink
      }));
      setStatus("Couldn't save deployment link. Try again.");
      return;
    }
    setStatus("Deployment link locked in. Share it with your cohort!");
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
  };

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthMessage("Enter an email address to receive your magic link.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("");

    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: redirectTo
      }
    });

    if (error) {
      setAuthMessage(error.message ?? "Something went wrong. Please try again.");
    } else {
      setAuthMessage("Check your inbox for the magic link-see you inside!");
      setEmail("");
    }

    setIsAuthLoading(false);
  };

  const renderStepText = (step: string) => {
    if (!step.includes(CODEX_WEB_URL)) {
      return step;
    }

    const [before, ...rest] = step.split(CODEX_WEB_URL);
    const after = rest.join(CODEX_WEB_URL);

    return (
      <>
        {before}
        <a href={CODEX_WEB_URL} target="_blank" rel="noreferrer">
          {CODEX_WEB_URL.replace("https://", "")}
        </a>
        {after}
      </>
    );
  };

  const CodeBlock = ({ children }: { children: string }) => (
    <pre className="code-block">
      <code>{children}</code>
    </pre>
  );

  const handleChecklistToggle = (key: string) => {
    setChecklist((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  const handleConfirmName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameStatus("Add your name before confirming.");
      return;
    }
    setDisplayName(trimmed);
    if (trimmed === profileSnapshot.displayName) {
      setNameStatus("Name already saved.");
      return;
    }
    const saved = await upsertProfile({ displayName: trimmed });
    setNameStatus(saved ? "Name saved." : "Couldn't save name. Try again.");
  };

  const handleDisplayNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleConfirmName();
    }
  };

  const handleConfirmBuildDescription = async () => {
    const trimmed = state.buildDescription.trim();
    if (!trimmed) {
      setBuildStatus("Add your project description before confirming.");
      return;
    }
    setState((prev) => ({
      ...prev,
      buildDescription: trimmed
    }));
    if (trimmed === profileSnapshot.buildDescription) {
      setBuildStatus("Description already saved.");
      return;
    }
    const saved = await upsertProfile({ buildDescription: trimmed });
    setBuildStatus(saved ? "Description saved." : "Couldn't save description. Try again.");
  };

  if (!session) {
    return (
      <main>
        <section className="card">
          <h1>Join the Vibe Coding Workshop</h1>
          <p>
            Sign in to access the guided journey, pick your tools, and keep your launch plan in one
            place.
          </p>

          <form
            onSubmit={handleEmailSignIn}
            style={{ display: "grid", gap: "0.75rem", marginTop: "1.25rem" }}
          >
            <label htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                style={{ marginTop: "0.35rem" }}
              />
            </label>
            <button type="submit" disabled={isAuthLoading}>
              {isAuthLoading ? "Sending magic link..." : "Email me a magic link"}
            </button>
          </form>

          {authMessage && (
            <p style={{ marginTop: "1rem", color: "var(--accent)" }}>{authMessage}</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main>
      <div className="layout">
        <nav className="card sticky-nav" aria-label="Workshop sections">
          <h2>Workshop Map</h2>
          <ul>
            <li>
              <a href="#overview">Overview</a>
            </li>
            <li>
              <a href="#project">1. What Are You Building?</a>
            </li>
            <li>
              <a href="#repo">2. Spin Up Your GitHub Repo</a>
            </li>
            <li>
              <a href="#tooling">3. Choose Your AI Partner</a>
            </li>
            <li>
              <a href="#prep">4. Preparation Prompts</a>
            </li>
            <li>
              <a href="#apis">5. External APIs</a>
            </li>
            <li>
              <a href="#deploy">6. Deployment Launch Pad</a>
            </li>
            <li>
              <a href="#vibe">7. Vibe Coding Main Activity</a>
            </li>
            <li>
              <a href="#cheatsheet">8. Terminal Cheat Sheet</a>
            </li>
            <li>
              <a href="#logout">Sign Out</a>
            </li>
          </ul>

          <div className="checklist">
            <h3>Ship Checklist</h3>
            <div className="checklist-items">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.key} className="checklist-item">
                  <input
                    type="checkbox"
                    checked={Boolean(checklist[item.key])}
                    onChange={() => handleChecklistToggle(item.key)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </nav>

        <div className="content-stack">
          <header
            id="overview"
            className="card"
            style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}
          >
            <div>
              <h1>Workshop Journey Planner</h1>
              <p style={{ maxWidth: "600px" }}>
                You're authenticated via Supabase. Choose your AI tooling, describe what you're
                shipping, and we'll surface the exact steps to get it live.
              </p>
            </div>
            <div
              id="logout"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: "220px" }}
            >
              <label htmlFor="displayName" style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>Your name</span>
                <input
                  id="displayName"
                  type="text"
                  placeholder="How should we address you?"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setNameStatus("");
                  }}
                  onKeyDown={handleDisplayNameKeyDown}
                />
              </label>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleConfirmName();
                }}
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
              >
                <button type="submit">Confirm name</button>
                <button type="button" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </form>
              {nameStatus && (
                <p style={{ margin: 0, color: "var(--accent)" }}>{nameStatus}</p>
              )}
            </div>
          </header>

          <section id="project" className="card">
            <h2>1. What Are You Building?</h2>
            <p>Describe the feature, MVP slice, or experiment you'll ship in today's session.</p>
            <textarea
              rows={4}
              placeholder="Example: Guided onboarding app for founders to follow the vibe coding workshop."
              value={state.buildDescription}
              onChange={(event) => {
                const value = event.target.value;
                setState((prev) => ({
                  ...prev,
                  buildDescription: value
                }));
                setBuildStatus("");
              }}
            />
            {state.buildDescription && (
              <p style={{ marginTop: "0.75rem", color: "var(--text-secondary)" }}>
                <span className="tag">Working Idea</span>
                {state.buildDescription}
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleConfirmBuildDescription();
              }}
              style={{
                display: "flex",
                gap: "0.75rem",
                marginTop: "0.75rem",
                flexWrap: "wrap",
                alignItems: "center"
              }}
            >
              <button type="submit">Confirm project description</button>
              {buildStatus && <span style={{ color: "var(--accent)" }}>{buildStatus}</span>}
            </form>
          </section>

          <section id="repo" className="card">
            <h2>2. Spin Up Your GitHub Repo</h2>
            <p>
              Set up the repository now so every file Codex produces has a home. You'll connect this repo to
              your deployment platform later.
            </p>
            <ol className="instructions">
              <li>Create a new GitHub repository (private or public) with a concise, memorable name.</li>
              <li>
                Initialize your local folder with git, add a README, and point the remote to the new
                repository URL.
              </li>
              <li>Push an initial commit so Vercel and other hosts can detect the `main` branch.</li>
            </ol>
            <h3>Suggested Commands</h3>
            <CodeBlock>
              {[
                "git init",
                "git add README.md",
                'git commit -m "chore: initial commit"',
                "git branch -M main",
                "git remote add origin git@github.com:your-org/your-repo.git",
                "git push -u origin main"
              ].join("\n")}
            </CodeBlock>
            <p style={{ color: "var(--text-muted)", marginTop: "0.75rem" }}>
              Using SSH avoids repeated credential prompts when Codex pushes commits for you.
            </p>
          </section>

          <section id="tooling" className="card">
            <h2>3. Choose Your AI Building Partner</h2>
            <p>Pick between Codex in the browser or Codex plugged into your local editor.</p>
            <div className="options-grid">
              {Object.entries(TOOL_GUIDES).map(([key, guide]) => (
                <label key={key} className="option">
                  <span>
                    <strong>{guide.title}</strong>
                  </span>
                  <span>{guide.summary}</span>
                  <span>
                    <input
                      type="radio"
                      name="tool"
                      value={key}
                      checked={state.tool === key}
                      onChange={() =>
                        setState((prev) => ({
                          ...prev,
                          tool: key as ToolKey
                        }))
                      }
                    />
                    <span style={{ marginLeft: "0.5rem" }}>Use this</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="nested-card">
              <h3>{toolGuide.title} - Quickstart</h3>
              <p>{toolGuide.summary}</p>
              <ol className="instructions">
                {toolGuide.steps.map((step, index) => (
                  <li key={index}>{renderStepText(step)}</li>
                ))}
              </ol>
              {toolGuide.proTips && (
                <p style={{ marginTop: "0.75rem", color: "var(--text-muted)" }}>
                  <span className="tag">Pro Tips</span>
                  {toolGuide.proTips.join(" · ")}
                </p>
              )}
              {toolGuide.commandBlock && (
                <div style={{ marginTop: "1rem" }}>
                  <h4 style={{ marginBottom: "0.5rem" }}>Copy-ready commands</h4>
                  <CodeBlock>{toolGuide.commandBlock}</CodeBlock>
                </div>
              )}
              {toolGuide.promptBlocks && toolGuide.promptBlocks.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h4 style={{ marginBottom: "0.5rem" }}>Ask Codex</h4>
                  {toolGuide.promptBlocks.map((prompt) => (
                    <CodeBlock key={prompt}>{prompt}</CodeBlock>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section id="prep" className="card">
            <h2>4. Preparation Prompts</h2>
            <p>
              Run these prompts first so Codex lays down the documentation, architecture, and execution plan
              inside your repository before you touch the code.
            </p>
            {ARCHITECTURE_PROMPTS.map((prompt) => (
              <CodeBlock key={prompt}>{prompt}</CodeBlock>
            ))}
          </section>

          <section id="apis" className="card">
            <h2>5. External APIs & Credentials</h2>
            <p>
              Avoid last-minute surprises by gathering API access early. Many services require billing info
              or usage limits, so double-check before you flip features on in production.
            </p>
            <ol className="instructions">
              <li>List every integration the plan references (Supabase, Stripe, analytics, etc.).</li>
              <li>Create or locate the required API keys and store them in environment variables.</li>
              <li>Note any rate limits or paid tiers so you can forecast costs during testing.</li>
            </ol>
            <h3>Prompt the Agent Like This</h3>
            {EXTERNAL_API_CHECKLIST.map((prompt) => (
              <CodeBlock key={prompt}>{prompt}</CodeBlock>
            ))}
          </section>

          <section id="deploy" className="card">
            <h2>6. Deployment Launch Pad</h2>
            <p>Pick your launch surface so we can prep the right steps.</p>
            <div className="options-grid">
              {Object.entries(DEPLOYMENT_GUIDES).map(([key, guide]) => (
                <label key={key} className="option">
                  <span>
                    <strong>{guide.title}</strong>
                  </span>
                  <span>{guide.summary}</span>
                  <span>
                    <input
                      type="radio"
                      name="deployment"
                      value={key}
                      checked={state.deployment === key}
                      onChange={() =>
                        setState((prev) => ({
                          ...prev,
                          deployment: key as DeploymentKey
                        }))
                      }
                    />
                    <span style={{ marginLeft: "0.5rem" }}>Use this</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="nested-card">
              <h3>{deploymentGuide.title} - Launch Steps</h3>
              <p>{deploymentGuide.summary}</p>
              <ol className="instructions">
                {deploymentGuide.steps.map((step, index) => (
                  <li key={index}>{renderStepText(step)}</li>
                ))}
              </ol>
              {deploymentGuide.proTips && (
                <p style={{ marginTop: "0.75rem", color: "var(--text-muted)" }}>
                  <span className="tag">Ship Smart</span>
                  {deploymentGuide.proTips.join(" · ")}
                </p>
              )}
            </div>

            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              <label htmlFor="deployLink">
                Deployment URL
                <input
                  id="deployLink"
                  type="url"
                  placeholder="https://your-app.vercel.app"
                  value={state.deploymentLink}
                  onChange={(event) => {
                    const value = event.target.value;
                    setState((prev) => ({
                      ...prev,
                      deploymentLink: value,
                      confirmedDeploymentLink: ""
                    }));
                    setStatus("");
                  }}
                />
              </label>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleConfirmLink();
                }}
                style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}
              >
                <button type="submit">Confirm deployment link</button>
                {status && <span style={{ color: "var(--accent)" }}>{status}</span>}
              </form>
              {showDeploymentLinkBadge && (
                <p style={{ color: "var(--text-secondary)" }}>
                  <span className="tag">Live URL</span>
                  <a href={state.confirmedDeploymentLink} target="_blank" rel="noreferrer">
                    {state.confirmedDeploymentLink}
                  </a>
                </p>
              )}
            </div>
          </section>

          <section id="vibe" className="card">
            <h2>7. Vibe Coding Main Activity</h2>
            <p>Keep the loop tight: implement, commit, deploy, and repeat while narrating progress to Codex.</p>
            <ul
              style={{
                color: "var(--text-secondary)",
                paddingLeft: "1.25rem",
                listStyle: "disc",
                display: "grid",
                gap: "0.45rem"
              }}
            >
              <li>Ask Codex to implement the next phase from your TODO doc, one testable slice at a time.</li>
              <li>After verifying each slice, have Codex summarize the change, commit, and push to your repo.</li>
              <li>Check the deployment (preview or production) to confirm the update landed—then queue the next phase.</li>
            </ul>
          </section>

          <section id="cheatsheet" className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>8. Terminal Cheat Sheet</h2>
              <button
                type="button"
                className="toggle-button"
                onClick={() => setShowTerminalCheatsheet((prev) => !prev)}
                aria-expanded={showTerminalCheatsheet}
                aria-controls="terminal-cheatsheet"
              >
                <span>{showTerminalCheatsheet ? "v" : ">"}</span>
                <span>{showTerminalCheatsheet ? "Hide" : "Show"}</span>
              </button>
            </div>
            {showTerminalCheatsheet && (
              <table id="terminal-cheatsheet">
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">macOS / Linux</th>
                    <th scope="col">Windows</th>
                  </tr>
                </thead>
                <tbody>
                  {TERMINAL_CHEAT_SHEET.map((item) => (
                    <tr key={item.action}>
                      <td>{item.action}</td>
                      <td>
                        <code>{item.mac}</code>
                      </td>
                      <td>
                        <code>{item.windows}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
