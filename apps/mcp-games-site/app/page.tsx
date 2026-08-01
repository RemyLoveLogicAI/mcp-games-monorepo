"use client";

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type ConnectionState =
  | "not-configured"
  | "checking"
  | "connected"
  | "unavailable";

type GameChoice = {
  id: string;
  label?: string;
  text?: string;
  description?: string;
};

type GameState = {
  sessionId: string;
  gameTitle?: string;
  sceneTitle?: string;
  narrative?: string;
  choices: GameChoice[];
  completed?: boolean;
  completedAt?: string | null;
};

type Receipt = {
  id: string;
  action: "focus" | "start" | "choice" | "copy";
  title: string;
  detail: string;
  source: string;
  time: string;
  createdAt: string;
  minutes?: number;
};

type JsonObject = Record<string, unknown>;

const connectorUrl =
  process.env.NEXT_PUBLIC_MCP_CONNECTOR_URL?.replace(/\/$/, "") ||
  "/api/connector";
const autonomousActionsConfigured =
  process.env.NEXT_PUBLIC_MCP_AUTONOMY_ENABLED === "true";
const localStartCommand = "pnpm build:flagship && pnpm dev";
const receiptStorageKey = "mcp-games.execution-receipts.v1";
const actorStorageKey = "mcp-games.actor-id.v1";

function getActorId() {
  const existing = window.localStorage.getItem(actorStorageKey);
  if (existing) return existing;
  const actorId = `site:${crypto.randomUUID()}`;
  window.localStorage.setItem(actorStorageKey, actorId);
  return actorId;
}

function connectorHeaders(includeJson = false): HeadersInit {
  return {
    ...(includeJson ? { "content-type": "application/json" } : {}),
    "x-mcp-actor-id": getActorId(),
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapGamePayload(payload: unknown): JsonObject {
  if (!isObject(payload)) return {};

  for (const key of ["result", "data", "game", "session", "turn"]) {
    const nested = payload[key];
    if (isObject(nested)) {
      if (isObject(nested.data)) return nested.data;
      return nested;
    }
  }

  return payload;
}

function normalizeGame(payload: unknown): GameState | null {
  const value = unwrapGamePayload(payload);
  if (typeof value.sessionId !== "string") return null;

  return {
    sessionId: value.sessionId,
    gameTitle:
      typeof value.gameTitle === "string" ? value.gameTitle : undefined,
    sceneTitle:
      typeof value.sceneTitle === "string" ? value.sceneTitle : undefined,
    narrative: typeof value.narrative === "string" ? value.narrative : undefined,
    choices: Array.isArray(value.choices)
      ? value.choices.filter(
          (choice): choice is GameChoice =>
            isObject(choice) && typeof choice.id === "string",
        )
      : [],
    completed: Boolean(value.completed),
    completedAt:
      typeof value.completedAt === "string" || value.completedAt === null
        ? value.completedAt
        : undefined,
  };
}

function displayChoice(choice: GameChoice) {
  return choice.label || choice.text || choice.id;
}

function localTimeLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function receiptTime(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function toIcsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function safeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (isObject(payload)) {
    if (typeof payload.error === "string") return payload.error;
    if (typeof payload.message === "string") return payload.message;
  }
  return fallback;
}

export default function Home() {
  const [now, setNow] = useState<Date | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(
    connectorUrl ? "checking" : "not-configured",
  );
  const [connectionNote, setConnectionNote] = useState(
    connectorUrl
      ? "Verifying the Games transport."
      : "No connector URL was supplied to this build.",
  );
  const [autonomyCapability, setAutonomyCapability] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [focusMinutes, setFocusMinutes] = useState(45);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsHydrated, setReceiptsHydrated] = useState(false);
  const [command, setCommand] = useState("");
  const [commandFeedback, setCommandFeedback] = useState(
    "Try “focus 45”, “start”, or “status”.",
  );
  const commandRef = useRef<HTMLInputElement>(null);

  const daypart = now
    ? now.getHours() < 12
      ? "morning"
      : now.getHours() < 18
        ? "afternoon"
        : "evening"
    : "afternoon";

  const dateLabel = now
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(now)
    : "Reading local time…";

  const addReceipt = (
    action: Receipt["action"],
    title: string,
    detail: string,
    source: string,
    externalId?: string,
    minutes?: number,
  ) => {
    const createdAt = new Date();
    setReceipts((current) => [
      {
        id: externalId || crypto.randomUUID(),
        action,
        title,
        detail,
        source,
        time: receiptTime(createdAt),
        createdAt: createdAt.toISOString(),
        minutes,
      },
      ...current,
    ].slice(0, 40));
  };

  useEffect(() => {
    const firstTick = window.setTimeout(() => setNow(new Date()), 0);
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(receiptStorageKey);
        const parsed = saved ? (JSON.parse(saved) as unknown) : [];
        if (Array.isArray(parsed)) {
          setReceipts(
            parsed.filter(
              (receipt): receipt is Receipt =>
                isObject(receipt) &&
                typeof receipt.id === "string" &&
                typeof receipt.action === "string" &&
                typeof receipt.title === "string" &&
                typeof receipt.detail === "string" &&
                typeof receipt.source === "string" &&
                typeof receipt.time === "string" &&
                typeof receipt.createdAt === "string",
            ),
          );
        }
      } catch {
        // Corrupt device history is ignored rather than treated as trusted input.
      } finally {
        setReceiptsHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, []);

  useEffect(() => {
    if (!receiptsHydrated) return;
    window.localStorage.setItem(receiptStorageKey, JSON.stringify(receipts));
  }, [receipts, receiptsHydrated]);

  useEffect(() => {
    const focusCommandBar = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/" &&
        target?.tagName !== "INPUT" &&
        target?.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();
        commandRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusCommandBar);
    return () => window.removeEventListener("keydown", focusCommandBar);
  }, []);

  useEffect(() => {
    if (!connectorUrl) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_500);

    void (async () => {
      try {
        const response = await fetch(`${connectorUrl}/api/games/health`, {
          signal: controller.signal,
          headers: connectorHeaders(),
        });
        const payload = (await response.json().catch(() => ({}))) as unknown;

        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Games transport unavailable."));
        }

        const health = isObject(payload) ? payload : {};
        const declaredStatus =
          typeof health.status === "string" ? health.status.toLowerCase() : "";
        const explicitlyUnavailable =
          health.connected === false ||
          ["unavailable", "offline", "error"].includes(declaredStatus);

        if (explicitlyUnavailable) {
          throw new Error(
            getErrorMessage(payload, "Connector answered; Games server is offline."),
          );
        }

        const capabilities = health.capabilities;
        setAutonomyCapability(
          (Array.isArray(capabilities) &&
            capabilities.includes("autonomous_actions")) ||
            (isObject(capabilities) &&
              capabilities.autonomousActions === true),
        );
        setConnection("connected");
        setConnectionNote("Games transport answered its health check.");
      } catch (error) {
        setConnection("unavailable");
        setConnectionNote(
          error instanceof Error && error.name !== "AbortError"
            ? error.message
            : "The connector did not answer within 4.5 seconds.",
        );
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const startRun = async () => {
    if (!connectorUrl) {
      setCommandFeedback(
        "The web build needs NEXT_PUBLIC_MCP_CONNECTOR_URL before it can start a server run.",
      );
      return;
    }

    setBusyAction("start");
    setCommandFeedback("Asking the MCP Games server to start a session…");

    try {
      const response = await fetch(`${connectorUrl}/api/games/sessions`, {
        method: "POST",
        headers: connectorHeaders(true),
        body: JSON.stringify({ playerId: `web-${crypto.randomUUID()}` }),
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "The session could not start."));
      }

      const nextGame = normalizeGame(payload);
      if (!nextGame) {
        throw new Error("The server response did not include a session ID.");
      }

      setGame(nextGame);
      setConnection("connected");
      setConnectionNote("Live session active through the Games transport.");
      setCommandFeedback(`Session ${nextGame.sessionId} is active.`);

      const outer = isObject(payload) ? payload : {};
      const serverReceipt = isObject(outer.receipt) ? outer.receipt : {};
      addReceipt(
        "start",
        "Live run started",
        `${nextGame.gameTitle || "MCP game"} · session ${nextGame.sessionId}`,
        "MCP · start_game",
        typeof serverReceipt.id === "string" ? serverReceipt.id : undefined,
      );
    } catch (error) {
      setConnection("unavailable");
      setConnectionNote(
        error instanceof Error ? error.message : "The Games server did not answer.",
      );
      setCommandFeedback(
        error instanceof Error ? error.message : "The Games server did not answer.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const makeChoice = async (choice: GameChoice) => {
    if (!connectorUrl || !game) return;

    setBusyAction(choice.id);
    setCommandFeedback(`Executing “${displayChoice(choice)}” through MCP…`);

    try {
      const response = await fetch(
        `${connectorUrl}/api/games/sessions/${encodeURIComponent(game.sessionId)}/choices`,
        {
          method: "POST",
          headers: connectorHeaders(true),
          body: JSON.stringify({ choiceId: choice.id }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "The choice was not accepted."));
      }

      const nextGame = normalizeGame(payload);
      if (!nextGame) {
        throw new Error("The server response did not include the updated session.");
      }

      setGame(nextGame);
      setCommandFeedback(
        nextGame.completed
          ? "The server marked this run complete."
          : "Choice committed. The next scene came from the server.",
      );

      const outer = isObject(payload) ? payload : {};
      const serverReceipt = isObject(outer.receipt) ? outer.receipt : {};
      addReceipt(
        "choice",
        "Game move executed",
        `${displayChoice(choice)} · session ${nextGame.sessionId}`,
        "MCP · make_choice",
        typeof serverReceipt.id === "string" ? serverReceipt.id : undefined,
      );
    } catch (error) {
      setCommandFeedback(
        error instanceof Error ? error.message : "The choice could not be executed.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const downloadFocusBlock = (minutes = focusMinutes) => {
    const createdAt = new Date();
    const start = new Date(createdAt);
    start.setSeconds(0, 0);
    const remainder = start.getMinutes() % 15;
    start.setMinutes(start.getMinutes() + (remainder === 0 ? 15 : 15 - remainder));
    const end = new Date(start.getTime() + minutes * 60_000);
    const uid = `${crypto.randomUUID()}@mcp.games`;
    const title = `Protected focus · ${minutes} minutes`;
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MCP Games//Execution Surface//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toIcsDate(createdAt)}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${safeIcsText(title)}`,
      `DESCRIPTION:${safeIcsText("A focus block created from the MCP Games execution surface.")}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `mcp-focus-${minutes}m.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);

    addReceipt(
      "focus",
      "Calendar artifact created",
      `${minutes} minutes · starts ${localTimeLabel(start)}`,
      "This device · .ics download",
      uid,
      minutes,
    );
    setCommandFeedback(
      `Downloaded a ${minutes}-minute calendar event starting ${localTimeLabel(start)}.`,
    );
  };

  const copyLocalSetup = async () => {
    try {
      await navigator.clipboard.writeText(localStartCommand);
      addReceipt(
        "copy",
        "Setup command copied",
        localStartCommand,
        "This device · clipboard",
      );
      setCommandFeedback("Local startup command copied.");
    } catch {
      setCommandFeedback(`Copy this from the repository root: ${localStartCommand}`);
    }
  };

  const reportStatus = () => {
    const label = {
      connected: "Games transport connected.",
      checking: "Games transport check in progress.",
      unavailable: `Games transport unavailable. ${connectionNote}`,
      "not-configured": "No connector URL is configured for this build.",
    }[connection];
    setCommandFeedback(label);
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const input = command.trim();
    if (!input) return;
    setCommand("");

    const [verb, rawValue] = input.toLowerCase().split(/\s+/);
    if (verb === "focus") {
      const requested = Number(rawValue || focusMinutes);
      const minutes = Number.isFinite(requested)
        ? Math.max(10, Math.min(180, Math.round(requested)))
        : focusMinutes;
      setFocusMinutes(minutes);
      downloadFocusBlock(minutes);
    } else if (verb === "start") {
      void startRun();
    } else if (verb === "status") {
      reportStatus();
    } else if (verb === "connect") {
      window.location.reload();
    } else if (verb === "clear") {
      setReceipts([]);
      setCommandFeedback("Activity cleared on this device.");
    } else if (verb === "help") {
      setCommandFeedback(
        "Commands: focus [minutes] · start · status · connect · clear",
      );
    } else {
      setCommandFeedback(`“${verb}” is not a command. Try “help”.`);
    }
  };

  const commandKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") event.currentTarget.blur();
  };

  const focusReceipts = receipts.filter(
    (receipt) => receipt.action === "focus" && receipt.minutes,
  );
  const serverActions = receipts.filter(
    (receipt) => receipt.action === "start" || receipt.action === "choice",
  );
  const recommendation =
    focusReceipts.length >= 2
      ? {
          kind: "focus" as const,
          minutes: focusReceipts[0].minutes || 45,
          label: `Repeat a ${focusReceipts[0].minutes || 45}-minute focus block`,
          reason: `${focusReceipts.length} successful focus artifacts on this device`,
        }
      : serverActions.length >= 2
        ? {
            kind: "server" as const,
            label: "Start another live run",
            reason: `${serverActions.length} successful MCP game actions on this device`,
          }
        : null;

  return (
    <main className={`site-shell daypart-${daypart}`}>
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="MCP Games home">
          <span className="wordmark-mark" aria-hidden="true">
            m
          </span>
          <span>MCP Games</span>
        </a>
        <p className="today">
          {dateLabel}
          {now ? <span>{localTimeLabel(now)}</span> : null}
        </p>
        <a className="text-link" href="#activity">
          Activity
        </a>
      </header>

      <div className="page" id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-intro">
            <p className="eyebrow">A playable execution surface</p>
            <h1 id="hero-title">
              Make the next
              <br />
              move <em>real.</em>
            </h1>
          </div>
          <div className="hero-note">
            <p>
              Turn a decision into an artifact, an agent call, or a completed
              server action. If a system is not connected, we say so.
            </p>
            <div className={`connection connection-${connection}`}>
              <span aria-hidden="true" />
              <div>
                <strong>
                  {connection === "connected"
                    ? "Games server connected"
                    : connection === "checking"
                      ? "Checking Games server"
                      : connection === "unavailable"
                        ? "Games server unavailable"
                        : "Connector not configured"}
                </strong>
                <small>{connectionNote}</small>
              </div>
            </div>
          </div>
        </section>

        <form className="command-bar" onSubmit={runCommand}>
          <label htmlFor="command">Command</label>
          <div className="command-input">
            <span aria-hidden="true">›</span>
            <input
              ref={commandRef}
              id="command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={commandKeyDown}
              placeholder="What should happen next?"
              autoComplete="off"
              spellCheck="false"
            />
            <kbd>/</kbd>
            <button type="submit">Run</button>
          </div>
          <div className="command-meta">
            <p aria-live="polite">{commandFeedback}</p>
            <div aria-label="Suggested commands">
              <button type="button" onClick={() => downloadFocusBlock(45)}>
                focus 45
              </button>
              <button type="button" onClick={() => void startRun()}>
                start
              </button>
              <button type="button" onClick={reportStatus}>
                status
              </button>
            </div>
          </div>
        </form>

        <section className="signals" aria-labelledby="signals-title">
          <div className="section-heading">
            <p className="eyebrow">Current context</p>
            <h2 id="signals-title">Only what we can verify.</h2>
          </div>
          <div className="signal-grid">
            <article>
              <span className="signal-number">01</span>
              <p>Local time</p>
              <strong>{now ? localTimeLabel(now) : "Reading…"}</strong>
              <small>Source: this device</small>
            </article>
            <article>
              <span className="signal-number">02</span>
              <p>MCP Games</p>
              <strong>
                {connection === "connected"
                  ? "Available"
                  : connection === "checking"
                    ? "Checking"
                    : "Not available"}
              </strong>
              <small>
                Source:{" "}
                {connectorUrl ? "live health check" : "build configuration"}
              </small>
            </article>
            <article>
              <span className="signal-number">03</span>
              <p>Calendar context</p>
              <strong>Not connected</strong>
              <small>No calendar read permission requested</small>
            </article>
          </div>
        </section>

        <section className="workspace" aria-label="Execution workspace">
          <article className="focus-card">
            <p className="eyebrow">Useful without an account</p>
            <h2>Protect time for one important thing.</h2>
            <p className="body-copy">
              Create a standards-based calendar event on this device. Nothing
              is invented, uploaded, or silently scheduled.
            </p>
            <fieldset>
              <legend>Duration</legend>
              <div className="duration-options">
                {[25, 45, 60].map((minutes) => (
                  <button
                    key={minutes}
                    className={focusMinutes === minutes ? "selected" : ""}
                    onClick={() => setFocusMinutes(minutes)}
                    type="button"
                    aria-pressed={focusMinutes === minutes}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="primary-button"
              onClick={() => downloadFocusBlock()}
              type="button"
            >
              Download focus block
              <span aria-hidden="true">↗</span>
            </button>
            <small className="privacy-note">
              Output: one .ics file · Source: this device
            </small>
          </article>

          <article className="game-card">
            <div className="game-card-head">
              <div>
                <p className="eyebrow">Live MCP action</p>
                <h2>{game?.sceneTitle || "Start a server-backed run."}</h2>
              </div>
              {game ? <code>{game.sessionId}</code> : null}
            </div>

            {game ? (
              <>
                <p className="game-narrative">
                  {game.narrative ||
                    "The server returned this scene without narrative text."}
                </p>
                {game.completed ? (
                  <div className="completion-note" role="status">
                    <strong>Run completed by the server.</strong>
                    <p>
                      {game.completedAt
                        ? `Recorded ${new Date(game.completedAt).toLocaleString()}.`
                        : "No completion timestamp was supplied."}
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => void startRun()}
                      type="button"
                      disabled={Boolean(busyAction)}
                    >
                      Start another run
                    </button>
                  </div>
                ) : game.choices.length ? (
                  <div className="live-choices">
                    <p>Choose an action. Each one calls make_choice.</p>
                    {game.choices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => void makeChoice(choice)}
                        disabled={Boolean(busyAction)}
                      >
                        <span>
                          <strong>{displayChoice(choice)}</strong>
                          {choice.description ? (
                            <small>{choice.description}</small>
                          ) : null}
                        </span>
                        <span aria-hidden="true">
                          {busyAction === choice.id ? "…" : "↗"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="completion-note" role="status">
                    <strong>No choices were returned.</strong>
                    <p>The interface will not manufacture a next move.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="body-copy">
                  This button calls the connector, which starts the game through
                  the MCP server. The scene and choices must come back from the
                  server before anything is shown.
                </p>
                <button
                  className="primary-button dark"
                  onClick={() => void startRun()}
                  type="button"
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "start" ? "Starting…" : "Start live run"}
                  <span aria-hidden="true">↗</span>
                </button>
                {connection !== "connected" ? (
                  <div className="setup-note">
                    <p>
                      {connectorUrl
                        ? "The configured connector is not currently answering."
                        : "This deployment has no connector URL. Run the full stack locally to enable server actions."}
                    </p>
                    <button type="button" onClick={() => void copyLocalSetup()}>
                      Copy local startup command
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </article>
        </section>

        <section className="rights" aria-labelledby="rights-title">
          <div className="section-heading">
            <p className="eyebrow">Automation rights</p>
            <h2 id="rights-title">Control stays legible.</h2>
          </div>
          <div className="rights-grid">
            <article>
              <div>
                <span className="right-state enabled">Available</span>
                <h3>Manual</h3>
              </div>
              <p>
                You choose the action and confirm it with a click or command.
                Device artifacts use this right.
              </p>
            </article>
            <article>
              <div>
                <span
                  className={`right-state ${
                    connection === "connected" ? "enabled" : "locked"
                  }`}
                >
                  {connection === "connected" ? "Available" : "Locked"}
                </span>
                <h3>Assisted</h3>
              </div>
              <p>
                The agent prepares or executes a named MCP tool after your
                confirmation. Requires a connected Games server.
              </p>
            </article>
            <article>
              <div>
                <span
                  className={`right-state ${
                    autonomousActionsConfigured &&
                    autonomyCapability &&
                    connection === "connected"
                      ? "enabled"
                      : "locked"
                  }`}
                >
                  {autonomousActionsConfigured &&
                  autonomyCapability &&
                  connection === "connected"
                    ? "Configured"
                    : "Locked"}
                </span>
                <h3>Autonomous</h3>
              </div>
              <p>
                Background action remains unavailable until both a live
                server-declared capability and explicit deployment permission
                are configured.
              </p>
            </article>
          </div>
        </section>

        <section className="activity" id="activity" aria-labelledby="activity-title">
          <div className="section-heading">
            <p className="eyebrow">Execution receipts</p>
            <h2 id="activity-title">What actually happened.</h2>
          </div>
          <div className="recommendation">
            <div>
              <span>Next useful shortcut</span>
              <strong>
                {recommendation
                  ? recommendation.label
                  : "No repeated action yet"}
              </strong>
              <p>
                {recommendation
                  ? recommendation.reason
                  : "Complete the same kind of action twice and this device will offer a one-click repeat."}
              </p>
            </div>
            {recommendation ? (
              <button
                type="button"
                onClick={() =>
                  recommendation.kind === "focus"
                    ? downloadFocusBlock(recommendation.minutes)
                    : void startRun()
                }
              >
                Run shortcut <span aria-hidden="true">↗</span>
              </button>
            ) : null}
          </div>
          <div className="receipt-list" aria-live="polite">
            {receipts.length ? (
              receipts.map((receipt) => (
                <article key={receipt.id}>
                  <span className="receipt-status" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>{receipt.title}</strong>
                    <p>{receipt.detail}</p>
                  </div>
                  <small>{receipt.source}</small>
                  <time>{receipt.time}</time>
                </article>
              ))
            ) : (
              <div className="empty-receipts">
                <p>No actions yet.</p>
                <span>
                  Download a focus block or start a live run. Completed actions
                  will appear here with their source.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer>
        <div>
          <span className="wordmark-mark small" aria-hidden="true">
            m
          </span>
          <p>
            <strong>MCP Games</strong>
            Decisions with verifiable consequences.
          </p>
        </div>
        <p>Device actions stay local. Server actions carry their source.</p>
      </footer>
    </main>
  );
}
