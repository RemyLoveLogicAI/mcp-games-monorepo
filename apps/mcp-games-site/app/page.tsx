"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Stats = {
  serotonin: number;
  energy: number;
  focus: number;
  xp: number;
};

type Choice = {
  label: string;
  hint: string;
  next: string;
  delta: Partial<Stats>;
  reward: string;
};

type Scene = {
  eyebrow: string;
  title: string;
  narrative: string;
  signal: string;
  choices: Choice[];
};

const scenes: Record<string, Scene> = {
  wake: {
    eyebrow: "07:15 // THE FIRST LIGHT",
    title: "The day is waiting for your command.",
    narrative:
      "Rain is needling the glass. Your calendar has one hard edge at 09:00, but this next minute belongs entirely to you. NOVA has already mapped three openings.",
    signal: "Weather + calendar context synthesized",
    choices: [
      {
        label: "Launch upright",
        hint: "Claim momentum before your brain negotiates.",
        next: "momentum",
        delta: { serotonin: 8, energy: 16, focus: 6, xp: 120 },
        reward: "MOMENTUM CHAIN",
      },
      {
        label: "Take the quiet route",
        hint: "Breathe, stretch, and choose the day deliberately.",
        next: "clarity",
        delta: { serotonin: 14, energy: 7, focus: 13, xp: 130 },
        reward: "CALM CORE",
      },
      {
        label: "Steal nine more minutes",
        hint: "Strategic retreat. Consequences included.",
        next: "recovery",
        delta: { serotonin: 5, energy: 11, focus: -6, xp: 90 },
        reward: "SOFT RESET",
      },
    ],
  },
  momentum: {
    eyebrow: "07:18 // VELOCITY",
    title: "You are moving before doubt can load.",
    narrative:
      "Feet hit the floor. The room snaps into focus. NOVA marks two high-value micro-missions: one feeds the body, the other breaks the day’s hardest task into something bite-sized.",
    signal: "Energy spike detected · streak available",
    choices: [
      {
        label: "Build the impossible breakfast",
        hint: "Color, crunch, protein, and one absurdly good song.",
        next: "threshold",
        delta: { serotonin: 16, energy: 15, focus: 4, xp: 180 },
        reward: "FULL-SPECTRUM FUEL",
      },
      {
        label: "Delete the first obstacle",
        hint: "Give the hardest task five fearless minutes.",
        next: "threshold",
        delta: { serotonin: 9, energy: 5, focus: 20, xp: 210 },
        reward: "BOSS DAMAGE ×2",
      },
    ],
  },
  clarity: {
    eyebrow: "07:19 // SIGNAL FOUND",
    title: "The noise drops out. Something true remains.",
    narrative:
      "Three slow breaths create a pocket of impossible quiet. NOVA offers no productivity sermon—only two small doors back into your own life.",
    signal: "Cognitive noise −31% · agency restored",
    choices: [
      {
        label: "Write one honest sentence",
        hint: "Name what would make today feel real.",
        next: "threshold",
        delta: { serotonin: 15, energy: 4, focus: 18, xp: 210 },
        reward: "TRUE NORTH",
      },
      {
        label: "Step into actual daylight",
        hint: "Two minutes outside. No phone. Let biology cook.",
        next: "threshold",
        delta: { serotonin: 22, energy: 14, focus: 8, xp: 220 },
        reward: "DAWN BUFF",
      },
    ],
  },
  recovery: {
    eyebrow: "07:24 // TIME DEBT",
    title: "You wake twice. The second time has teeth.",
    narrative:
      "The room is warmer, the clock less forgiving. NOVA refuses to shame you. Recovery is still a move—if you make it on purpose.",
    signal: "Schedule compression detected · shame protocol blocked",
    choices: [
      {
        label: "Execute the clean recovery",
        hint: "Water, light, clothes, go. No emotional tax.",
        next: "threshold",
        delta: { serotonin: 12, energy: 12, focus: 16, xp: 200 },
        reward: "NO-SHAME COMBO",
      },
      {
        label: "Cancel one fake emergency",
        hint: "Protect ten minutes by refusing manufactured urgency.",
        next: "threshold",
        delta: { serotonin: 18, energy: 8, focus: 12, xp: 230 },
        reward: "BOUNDARY FIELD",
      },
    ],
  },
  threshold: {
    eyebrow: "08:02 // THE THRESHOLD",
    title: "Your first real boss has entered the map.",
    narrative:
      "A message arrives: the 09:00 has moved up. Old you would react. Current you has resources, a streak, and an AI agent with a suspicious appetite for elegant defiance.",
    signal: "Calendar mutation detected · response window 04:59",
    choices: [
      {
        label: "Counter with a better plan",
        hint: "NOVA drafts the smallest credible win.",
        next: "victory",
        delta: { serotonin: 18, energy: -4, focus: 19, xp: 320 },
        reward: "REALITY PATCHED",
      },
      {
        label: "Call an ally into the mission",
        hint: "Turn solitary stress into shared momentum.",
        next: "victory",
        delta: { serotonin: 24, energy: 3, focus: 8, xp: 340 },
        reward: "CO-OP UNLOCKED",
      },
      {
        label: "Refuse the false quest",
        hint: "Some bosses disappear when you stop feeding them.",
        next: "victory",
        delta: { serotonin: 20, energy: 9, focus: 12, xp: 360 },
        reward: "SOVEREIGN MODE",
      },
    ],
  },
  victory: {
    eyebrow: "08:07 // RUN COMPLETE",
    title: "You didn’t optimize the morning. You authored it.",
    narrative:
      "The city is still wet, the calendar is still real, and the day is no longer happening to you. NOVA commits the run to memory and opens a new seed for tomorrow.",
    signal: "Ending unlocked · THE AUTHOR",
    choices: [],
  },
};

const initialStats: Stats = { serotonin: 48, energy: 54, focus: 42, xp: 0 };
const connectorUrl =
  process.env.NEXT_PUBLIC_MCP_CONNECTOR_URL?.replace(/\/$/, "") || "";

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function timeStamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [sceneId, setSceneId] = useState("wake");
  const [stats, setStats] = useState(initialStats);
  const [history, setHistory] = useState<string[]>([]);
  const [terminal, setTerminal] = useState<string[]>([
    "NOVA agent core online.",
    "Story graph morning-decision-v1 mounted.",
    "Type “help” or choose a mission.",
  ]);
  const [command, setCommand] = useState("");
  const [connection, setConnection] = useState<
    "local" | "checking" | "connected" | "unavailable"
  >("local");
  const [reward, setReward] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const scene = scenes[sceneId];
  const level = Math.floor(stats.xp / 500) + 1;
  const progress = useMemo(
    () => Math.min(100, (history.length / 3) * 100),
    [history.length],
  );

  useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [terminal]);

  useEffect(() => {
    if (!reward) return;
    const timer = window.setTimeout(() => setReward(""), 1800);
    return () => window.clearTimeout(timer);
  }, [reward]);

  const log = (line: string) =>
    setTerminal((current) => [...current.slice(-12), line]);

  const playTone = () => {
    if (!soundOn) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      [0, 0.08, 0.16].forEach((delay, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = [330, 440, 660][index];
        gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.08,
          audio.currentTime + delay + 0.01,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          audio.currentTime + delay + 0.18,
        );
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(audio.currentTime + delay);
        oscillator.stop(audio.currentTime + delay + 0.2);
      });
    } catch {
      // Sound is a progressive enhancement.
    }
  };

  const choose = (index: number) => {
    const choice = scene.choices[index];
    if (!choice) {
      log(`ERR no choice ${index + 1} in this scene.`);
      return;
    }
    setStats((current) => ({
      serotonin: clamp(current.serotonin + (choice.delta.serotonin || 0)),
      energy: clamp(current.energy + (choice.delta.energy || 0)),
      focus: clamp(current.focus + (choice.delta.focus || 0)),
      xp: current.xp + (choice.delta.xp || 0),
    }));
    setHistory((current) => [...current, choice.label]);
    setSceneId(choice.next);
    setReward(choice.reward);
    log(`> choose ${index + 1}`);
    log(`NOVA: ${choice.reward} acquired. Story state committed.`);
    playTone();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < scene.choices.length) choose(index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const reset = () => {
    setSceneId("wake");
    setStats(initialStats);
    setHistory([]);
    setReward("NEW TIMELINE");
    setTerminal([
      "Timeline reset.",
      "Story graph morning-decision-v1 mounted.",
      "NOVA: Let’s make the next move count.",
    ]);
  };

  const connect = async () => {
    if (!connectorUrl) {
      setConnection("unavailable");
      log("MCP remote URL is not configured; embedded NOVA core remains online.");
      log("Set NEXT_PUBLIC_MCP_CONNECTOR_URL to attach the super server.");
      return;
    }
    setConnection("checking");
    log(`Pinging MCP connector…`);
    try {
      const response = await fetch(`${connectorUrl}/health`, {
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) throw new Error("Health check failed");
      const payload = (await response.json()) as { service?: string };
      setConnection("connected");
      log(`LINKED ${payload.service || "mcp-connector"} · context bus ready.`);
      setReward("SUPER SERVER LINKED");
      playTone();
    } catch {
      setConnection("unavailable");
      log("Remote connector did not answer; switched to embedded NOVA core.");
    }
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const input = command.trim();
    if (!input) return;
    log(`> ${input}`);
    setCommand("");
    const [verb, arg] = input.toLowerCase().split(/\s+/);

    if (verb === "help") {
      log("Commands: status · scan · choose [1-3] · boost · connect · reset");
    } else if (verb === "status") {
      log(
        `LVL ${level} · SERO ${stats.serotonin} · NRG ${stats.energy} · FCS ${stats.focus} · ${stats.xp} XP`,
      );
    } else if (verb === "scan") {
      log(`NOVA: ${scene.signal}. ${scene.choices.length} viable paths found.`);
    } else if (verb === "choose") {
      choose(Number(arg) - 1);
    } else if (verb === "boost") {
      setStats((current) => ({
        ...current,
        serotonin: clamp(current.serotonin + 7),
        energy: clamp(current.energy + 3),
      }));
      setReward("MICRO BOOST +7");
      log("NOVA: shoulders down. unclench jaw. sip water. buff applied.");
      playTone();
    } else if (verb === "connect") {
      void connect();
    } else if (verb === "reset") {
      reset();
    } else {
      log(`Unknown command “${verb}”. Type help.`);
    }
  };

  return (
    <main>
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="topbar">
        <a className="brand" href="#game" aria-label="MCP Games home">
          <span className="brand-mark">M</span>
          <span>MCP GAMES</span>
        </a>
        <div className="run-state">
          <span className={`pulse ${connection}`} />
          {connection === "connected"
            ? "SUPER SERVER LINKED"
            : connection === "checking"
              ? "LINKING…"
              : "NOVA LOCAL CORE"}
        </div>
        <button
          className="icon-button"
          onClick={() => setSoundOn((value) => !value)}
          aria-label={soundOn ? "Mute game sounds" : "Enable game sounds"}
          type="button"
        >
          {soundOn ? "SOUND ON" : "SOUND OFF"}
        </button>
      </header>

      <section className="hero" id="game">
        <div className="hero-copy">
          <div className="kicker">
            <span>LIVE STORY PROTOCOL</span>
            <span>RUN 001</span>
          </div>
          <h1>
            YOUR WORLD
            <br />
            IS THE <em>GAME.</em>
          </h1>
          <p>
            A playable AI adventure that turns your signals, schedule, and
            decisions into momentum you can actually feel.
          </p>
        </div>
        <div className="level-card">
          <span>PLAYER SIGNAL</span>
          <strong>LVL {level.toString().padStart(2, "0")}</strong>
          <div className="xp-track">
            <i style={{ width: `${(stats.xp % 500) / 5}%` }} />
          </div>
          <small>{stats.xp % 500} / 500 XP TO NEXT SIGNAL</small>
        </div>
      </section>

      <section className="game-shell">
        <aside className="stats-panel">
          <div className="panel-label">BIOFEEDBACK</div>
          <Stat label="Serotonin" value={stats.serotonin} color="coral" />
          <Stat label="Energy" value={stats.energy} color="lime" />
          <Stat label="Focus" value={stats.focus} color="cyan" />

          <div className="context-stack">
            <div>
              <span>WEATHER</span>
              <strong>RAIN · 61°F</strong>
            </div>
            <div>
              <span>NEXT EVENT</span>
              <strong>09:00 · DEEP WORK</strong>
            </div>
            <div>
              <span>STORY GRAPH</span>
              <strong>MORNING-DECISION-V1</strong>
            </div>
          </div>

          <button className="link-button" onClick={() => void connect()} type="button">
            <span>↗</span>
            {connection === "connected" ? "MCP BUS CONNECTED" : "CONNECT SUPER SERVER"}
          </button>
        </aside>

        <article className="story-panel">
          <div className="story-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="scene-meta">
            <span>{scene.eyebrow}</span>
            <span>
              NODE {Math.min(history.length + 1, 4).toString().padStart(2, "0")} / 04
            </span>
          </div>
          <h2>{scene.title}</h2>
          <p className="narrative">{scene.narrative}</p>
          <div className="signal-line">
            <span className="signal-icon">✦</span>
            <div>
              <small>NOVA // CONTEXT SYNTHESIS</small>
              <p>{scene.signal}</p>
            </div>
          </div>

          {scene.choices.length ? (
            <div className="choices">
              <div className="choice-label">
                <span>CHOOSE YOUR NEXT MOVE</span>
                <span>KEYS 1—{scene.choices.length}</span>
              </div>
              {scene.choices.map((choice, index) => (
                <button
                  className="choice"
                  key={choice.label}
                  onClick={() => choose(index)}
                  type="button"
                >
                  <span className="choice-key">0{index + 1}</span>
                  <span>
                    <strong>{choice.label}</strong>
                    <small>{choice.hint}</small>
                  </span>
                  <span className="choice-arrow">↗</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ending-actions">
              <div>
                <span>RUN VALUE</span>
                <strong>{stats.xp} XP</strong>
              </div>
              <button onClick={reset} type="button">
                OPEN ANOTHER TIMELINE ↗
              </button>
            </div>
          )}
        </article>

        <aside className="terminal-panel">
          <div className="terminal-head">
            <span>NOVA // AGENT CONSOLE</span>
            <i />
          </div>
          <div className="terminal-log" ref={terminalRef} aria-live="polite">
            {terminal.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className={line.startsWith(">") ? "command-line" : ""}
              >
                <span>{timeStamp()}</span>
                {line}
              </p>
            ))}
          </div>
          <form onSubmit={runCommand} className="terminal-input">
            <label htmlFor="command">COMMAND</label>
            <div>
              <span>›</span>
              <input
                id="command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="help"
                autoComplete="off"
              />
              <button type="submit">RUN</button>
            </div>
          </form>
          <div className="quick-commands">
            {["scan", "status", "boost"].map((item) => (
              <button
                key={item}
                onClick={() => {
                  if (item === "scan") log(`NOVA: ${scene.signal}.`);
                  if (item === "status")
                    log(`LVL ${level} · ${stats.xp} XP · ${history.length} choices`);
                  if (item === "boost") {
                    setStats((current) => ({
                      ...current,
                      serotonin: clamp(current.serotonin + 7),
                    }));
                    setReward("MICRO BOOST +7");
                    log("NOVA: breath + water + posture stack applied.");
                    playTone();
                  }
                }}
                type="button"
              >
                /{item}
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="system-strip">
        <div>
          <span>01</span>
          <p>
            <strong>READ THE WORLD</strong>
            Calendar, weather, notes, and live MCP context become story fuel.
          </p>
        </div>
        <div>
          <span>02</span>
          <p>
            <strong>MAKE THE MOVE</strong>
            Tap a choice or command NOVA directly through the terminal.
          </p>
        </div>
        <div>
          <span>03</span>
          <p>
            <strong>KEEP THE GAIN</strong>
            State, streaks, unlocks, and agent memory make every run matter.
          </p>
        </div>
      </section>

      <footer>
        <div>
          <span className="brand-mark small">M</span>
          <p>
            <strong>MCP GAMES</strong>
            Flagship playable surface of Unrestricted OmniAgents.
          </p>
        </div>
        <p className="footer-note">
          FICTIONAL GAME METRICS · NOT MEDICAL GUIDANCE
        </p>
      </footer>

      {reward && (
        <div className="reward" role="status">
          <span>UNLOCKED</span>
          <strong>{reward}</strong>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="stat-track">
        <i className={color} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
