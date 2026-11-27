"use client";

import { ArrowRight, Check, Copy } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Skeleton } from "skullet/react";

import { type ConnectedAgent, useDashboard } from "../../adapter";
import { useDocumentTitle } from "../../hooks/use-document-title";
import { PageHeader, Sheet } from "../page";

const STEPS = [
  ["Connect the MCP", "Your agent adds Openinary to its tools."],
  ["Sign in once", "No API key in the chat."],
  ["Your project is wired", "Uploads and delivery, in your code."],
] as const;

/** "Claude Code", "Claude Code and Cursor", "Claude Code, Cursor and Codex". */
const joinNames = (names: string[]) =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

/** True once the first real content is on screen (see `Enter`). */
const Revealed = createContext<{ current: boolean }>({ current: true });

/**
 * Fades up when it mounts after the page first showed its content: an agent
 * connecting, a step completing. Not on that first reveal, where the
 * skeleton's own crossfade is the transition; both at once look off.
 */
function Enter({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: "div" | "li" | "span";
  className?: string;
  children: ReactNode;
}) {
  const revealed = useContext(Revealed);
  const [animate] = useState(() => revealed.current);
  return (
    <Tag className={`${animate ? "ds-enter " : ""}${className}`}>
      {children}
    </Tag>
  );
}

type Shape = { agents: number; uploaded: boolean };
const SHAPE_KEY = "openinary:home-shape";

function readLastShape(): Shape {
  try {
    const raw = JSON.parse(localStorage.getItem(SHAPE_KEY) ?? "null");
    if (typeof raw?.agents === "number" && typeof raw?.uploaded === "boolean")
      return raw;
  } catch {}
  return { agents: 0, uploaded: false };
}

function writeLastShape(shape: Shape) {
  try {
    localStorage.setItem(SHAPE_KEY, JSON.stringify(shape));
  } catch {}
}

/**
 * Cloud's Home: one prompt that has the user's coding agent connect the
 * Openinary MCP server and set the project up through it. Once an agent is
 * connected, the same screen follows it until the first upload lands.
 */
export function AgentWelcome({
  firstName,
  loading,
  prompt,
}: {
  firstName: string | undefined;
  /** The session is still loading. */
  loading: boolean;
  prompt: string;
}) {
  const { Link, useConnectedAgents, useOnboardingSignals } = useDashboard();
  const { agents, disconnect } = useConnectedAgents?.() ?? {
    agents: [],
    disconnect: async () => {},
  };
  const { hasUploaded } = useOnboardingSignals();
  useDocumentTitle("Home");

  // Greeting and state both depend on data: wait under a skeleton rather
  // than guess and swap.
  const ready = !loading && agents !== undefined && hasUploaded !== undefined;
  const revealed = useRef(false);
  // The skeleton takes the shape of what it covers: draw the layout seen
  // last time, so the real one lands without moving the page.
  const [last] = useState(readLastShape);
  useEffect(() => {
    if (!ready) return;
    revealed.current = true;
    writeLastShape({ agents: agents?.length ?? 0, uploaded: !!hasUploaded });
  }, [ready, agents, hasUploaded]);

  const shown = ready
    ? (agents ?? [])
    : Array.from({ length: last.agents }, (_, i) => ({
        clientId: `placeholder-${i}`,
        name: "Claude Code",
        connectedAt: new Date().toISOString(),
      }));
  const uploaded = ready ? !!hasUploaded : last.uploaded;
  const hello = firstName ? `Hey ${firstName} 👋` : "Hey there 👋";
  const connected = shown.length > 0;

  return (
    <Sheet>
      <PageHeader />
      <div className="@container/main min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex justify-center px-4 pt-16 pb-12 sm:px-8 md:pt-32">
          <div className="flex w-full max-w-[560px] flex-col">
            <Revealed.Provider value={revealed}>
              <Skeleton loading={!ready} label="Loading your setup">
                {/* Keyed, so connecting or disconnecting fades the new state in. */}
                <Enter
                  key={connected ? "connected" : "waiting"}
                  className="flex flex-col"
                >
                  {connected ? (
                    <Connected
                      hello={hello}
                      agents={shown}
                      uploaded={uploaded}
                      prompt={prompt}
                      disconnect={disconnect}
                    />
                  ) : (
                    <NotConnected hello={hello} prompt={prompt} />
                  )}
                </Enter>
              </Skeleton>
            </Revealed.Provider>

            <div className="mt-8 flex items-center justify-between text-[13px]/5 text-ds-muted">
              <span>
                Rather do it by hand?{" "}
                <Link
                  href="/get-started/integrate"
                  className="text-ds-secondary underline underline-offset-2 hover:text-ds-text"
                >
                  Integration guide
                </Link>
              </span>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-ds-secondary hover:text-ds-text"
              >
                Go to your assets
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function NotConnected({ hello, prompt }: { hello: string; prompt: string }) {
  const [showPrompt, setShowPrompt] = useState(false);
  return (
    <>
      <p className="mb-2.5 text-[13px]/5 text-ds-muted">
        Welcome to Openinary Cloud
      </p>
      <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
        {hello}
        <br />
        <span className="font-medium text-ds-muted">
          Let your agent do the setup.
        </span>
      </h1>
      <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
        Paste one prompt into Claude Code, Cursor, Codex or any MCP client. It
        connects to Openinary, you sign in once, and it wires uploads and
        delivery into the project you have open.
      </p>

      <div className="mt-7 flex items-center gap-4">
        <CopyPromptField prompt={prompt} />
        <button
          type="button"
          role="switch"
          aria-checked={showPrompt}
          onClick={() => setShowPrompt((v) => !v)}
          className="flex h-11 shrink-0 items-center gap-2 text-[13px]/5 text-ds-secondary"
        >
          <span
            className={`flex h-[18px] w-[30px] rounded-full p-0.5 transition-colors duration-200 ease-out ${
              showPrompt ? "bg-ds-inverse" : "bg-ds-border-strong"
            }`}
          >
            <span
              className={`size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${
                showPrompt ? "translate-x-3" : ""
              }`}
            />
          </span>
          Show prompt
        </button>
      </div>

      {/* 0fr to 1fr rows: the prompt opens to its own height. */}
      <div
        inert={!showPrompt}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          showPrompt ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <pre className="mt-2.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-[10px] border bg-ds-code px-4 py-3.5 font-mono text-[11px]/[18px] text-ds-secondary">
            {prompt}
          </pre>
        </div>
      </div>

      <Steps done={[false, false, false]} />
    </>
  );
}

function Connected({
  hello,
  agents,
  uploaded,
  prompt,
  disconnect,
}: {
  hello: string;
  agents: ConnectedAgent[];
  uploaded: boolean;
  prompt: string;
  disconnect: (clientId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // A reinstalled agent registers again: name it once.
  const unique = [...new Set(agents.map((a) => a.name))];
  return (
    <>
      <p className="mb-2.5 flex items-center gap-2 font-medium text-[13px]/5 text-ds-green">
        <span className="size-[7px] rounded-full bg-ds-green shadow-[0_0_0_3px_rgb(21_128_61/0.15)]" />
        {joinNames(unique)} {unique.length > 1 ? "are" : "is"} connected
      </p>
      <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
        {hello}
        <br />
        <span className="font-medium text-ds-muted">
          {uploaded ? "Your project is wired." : "Your agent is on it."}
        </span>
      </h1>
      <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
        {uploaded
          ? "The first file from your app just landed. From here, everything it uploads shows up in your assets."
          : "If it hasn't started yet, ask it to set up Openinary in your project. This page moves on as soon as the first file from your app lands."}
      </p>

      <ul className="ds-tile ds-tile-rows mt-7">
        {agents.map((agent) => (
          <Enter as="li" key={agent.clientId}>
            <div className="flex h-11 items-center gap-3 px-4 text-[13px]/5">
              <span className="size-1.5 shrink-0 rounded-full bg-ds-green" />
              <span className="flex-1 font-medium">{agent.name}</span>
              <span className="text-ds-faint">
                Connected {formatDate(agent.connectedAt)}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(agent.clientId);
                  await disconnect(agent.clientId).finally(() => setBusy(null));
                }}
                className="text-ds-muted hover:text-ds-text disabled:opacity-50"
              >
                {busy === agent.clientId ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </Enter>
        ))}
      </ul>

      <Steps done={[true, true, uploaded]} />

      <div className="mt-7 flex items-center gap-3 text-[13px]/5 text-ds-muted">
        <span>Connect another agent</span>
        <CopyPromptLink prompt={prompt} />
      </div>
    </>
  );
}

function Steps({ done }: { done: [boolean, boolean, boolean] }) {
  // The first step not done yet is the one in progress.
  const current = done.indexOf(false);
  return (
    <div className="mt-9 flex gap-6 border-t pt-5">
      {STEPS.map(([title, body], i) => (
        <div key={title} className="flex flex-1 flex-col gap-1">
          <Enter
            as="span"
            // Keyed by state, so the check or spinner fades in on change.
            key={done[i] ? "done" : current === i ? "current" : "todo"}
            className="flex h-4 items-center font-mono text-[11px] text-ds-faint"
          >
            {done[i] ? (
              <Check className="size-3.5 text-ds-green" aria-label="Done" />
            ) : current === i && done.some(Boolean) ? (
              <span
                className="size-3 animate-spin rounded-full border-2 border-ds-border-strong border-t-ds-accent"
                aria-label="In progress"
              />
            ) : (
              String(i + 1).padStart(2, "0")
            )}
          </Enter>
          <span className="font-medium text-[13px]/5">{title}</span>
          <span className="text-[12.5px]/5 text-ds-muted">
            {current === i && done.some(Boolean)
              ? "Waiting for the first upload from your app."
              : body}
          </span>
        </div>
      ))}
    </div>
  );
}

function useCopy(prompt: string) {
  const { analytics } = useDashboard();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    analytics?.integrationPromptCopied("agent");
    setTimeout(() => setCopied(false), 1600);
  };
  return { copied, copy };
}

function CopyPromptField({ prompt }: { prompt: string }) {
  const { copied, copy } = useCopy(prompt);
  return (
    <button
      type="button"
      onClick={copy}
      // Outlined to stand out, but with a circling gradient edge and a glow
      // below rather than the solid even ring of a focused field.
      data-done={copied || undefined}
      className="ds-glow-edge flex h-11 flex-1 items-center justify-between rounded-[10px] pr-1.5 pl-3.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-ring active:scale-[0.99]"
    >
      <span className="grid font-medium text-[13.5px]/5">
        <Swap on={!copied}>Copy agent setup prompt</Swap>
        <Swap on={copied}>Copied. Paste it into your agent</Swap>
      </span>
      <span
        className={`grid size-8 place-items-center rounded-[8px] border text-white transition-colors duration-200 ${
          copied
            ? "border-ds-green bg-ds-green"
            : "border-(--ds-accent-edge) bg-ds-accent"
        }`}
      >
        <Swap on={!copied} pop>
          <Copy className="size-3.5" />
        </Swap>
        <Swap on={copied} pop>
          <Check className="size-3.5" />
        </Swap>
      </span>
    </button>
  );
}

function CopyPromptLink({ prompt }: { prompt: string }) {
  const { copied, copy } = useCopy(prompt);
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-ds-secondary underline underline-offset-2 hover:text-ds-text"
    >
      <span className="grid">
        <Swap on={!copied} pop>
          <Copy className="size-3.5" />
        </Swap>
        <Swap on={copied} pop>
          <Check className="size-3.5 text-ds-green" />
        </Swap>
      </span>
      <span className="grid text-left">
        <Swap on={!copied}>Copy the prompt</Swap>
        <Swap on={copied}>Copied</Swap>
      </span>
    </button>
  );
}

/**
 * One of two states stacked in the same grid cell, crossfading with the
 * other: the swap never reflows. `pop` scales it too (icons).
 */
function Swap({
  on,
  pop,
  children,
}: {
  on: boolean;
  pop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden={!on}
      // Out first, then in: overlapping labels read as a glitch.
      className={`col-start-1 row-start-1 transition-[opacity,scale] ease-out motion-reduce:transition-none ${
        on
          ? "delay-100 duration-150"
          : `opacity-0 duration-100 ${pop ? "scale-50" : ""}`
      }`}
    >
      {children}
    </span>
  );
}
