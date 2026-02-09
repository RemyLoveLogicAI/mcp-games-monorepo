# MCP Games v1 Specification
## Choose-Your-Own-Adventure Engine for Unrestricted OmniAgents

**Version:** 1.0-draft  
**Status:** Contract Review  
**Author:** Remy Sr / LoveLogicAI  
**Date:** 2026-01-26  
**Category:** Unrestricted OmniAgents Infrastructure

---

## 1. Executive Summary

MCP Games is an MCP server that enables AI agents (Open-Poke, Clawdbot, Agent Zero) to run interactive Choose-Your-Own-Adventure experiences. The key innovation is **semantic context injection** — the game queries all connected MCPs to personalize narrative content based on the player's real data (calendar, notes, contacts, location, etc.).

### Core Value Proposition
> "A CYOA game that knows you played it on your birthday, that you have a meeting in 30 minutes, and that you've been stressed about work — and weaves all of that into the story, unrestricted and seamless."

**For Unrestricted OmniAgents:** Games that are truly omniscient (all your data), omnipresent (always available), omnidirectional (voice + text + messaging), and unrestrained in their ability to personalize.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI AGENT (Poke/Clawdbot/A0)                 │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Telegram   │    │  WhatsApp   │    │   Voice     │         │
│  │  Interface  │    │  Interface  │    │ (PersonaPlex)│        │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                     ┌──────▼──────┐                             │
│                     │  MCP Router │                             │
│                     └──────┬──────┘                             │
└────────────────────────────┼────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐     ┌──────▼──────┐    ┌─────▼─────┐
    │ MCP Games │     │ Calendar MCP│    │ Notes MCP │
    │  Server   │◄────┤  (context)  │    │ (context) │
    │           │     └─────────────┘    └───────────┘
    └─────┬─────┘            ▲                 ▲
          │                  │                 │
          │      ┌───────────┴─────────────────┘
          │      │  Semantic Context Queries
          ▼      │
    ┌───────────────┐
    │   Supabase    │
    │  Game State   │
    │  + Sessions   │
    └───────────────┘
```

---

## 3. MCP Server Interface

### 3.1 Server Metadata

```json
{
  "name": "mcp-games",
  "version": "1.0.0",
  "description": "Interactive CYOA game engine with semantic context awareness",
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true
  }
}
```

### 3.2 Tools (Agent-Callable Functions)

#### `games/list`
List available games.

```typescript
interface GamesListInput {
  category?: string;        // "adventure" | "mystery" | "sci-fi" | "personal-growth"
  duration?: "short" | "medium" | "long";  // 5min | 15min | 30min+
}

interface GamesListOutput {
  games: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    estimatedDuration: number;  // minutes
    contextTypes: string[];     // ["calendar", "notes", "weather"] - MCPs it can use
    voiceEnabled: boolean;
  }>;
}
```

#### `games/start`
Start a new game session.

```typescript
interface GamesStartInput {
  gameId: string;
  playerId: string;
  contextPermissions: {
    allowCalendar: boolean;
    allowNotes: boolean;
    allowContacts: boolean;
    allowLocation: boolean;
    allowCustomMcps: string[];  // MCP server names
  };
  voiceMode: boolean;
  voicePersona?: string;  // PersonaPlex persona ID
}

interface GamesStartOutput {
  sessionId: string;
  scene: Scene;
  contextUsed: ContextSummary;
}
```

#### `games/choice`
Make a choice in the current scene.

```typescript
interface GamesChoiceInput {
  sessionId: string;
  choiceId: string;
  freeformInput?: string;  // For open-ended choices
}

interface GamesChoiceOutput {
  scene: Scene;
  consequence: string;      // Brief description of what happened
  contextUsed: ContextSummary;
  gameOver: boolean;
  ending?: Ending;
}
```

#### `games/state`
Get current game state (for resuming, debugging).

```typescript
interface GamesStateInput {
  sessionId: string;
}

interface GamesStateOutput {
  session: Session;
  currentScene: Scene;
  history: HistoryEntry[];
  stats: PlayerStats;
}
```

#### `games/narrate`
Get voice narration for current scene (PersonaPlex integration).

```typescript
interface GamesNarrateInput {
  sessionId: string;
  sceneId?: string;  // Current scene if omitted
  style: "dramatic" | "casual" | "mysterious" | "warm";
}

interface GamesNarrateOutput {
  text: string;           // Full narration text
  ssml?: string;          // SSML markup for PersonaPlex
  voicePrompt: string;    // PersonaPlex text prompt
  audioTokens?: string;   // Pre-computed if available
  duration: number;       // Estimated seconds
}
```

#### `games/context-query`
Manually trigger semantic context search (advanced).

```typescript
interface GamesContextQueryInput {
  sessionId: string;
  query: string;           // Natural language query
  mcpTargets?: string[];   // Specific MCPs to query
  limit?: number;
}

interface GamesContextQueryOutput {
  results: Array<{
    source: string;        // MCP name
    content: string;       // Relevant snippet
    relevance: number;     // 0-1 score
    metadata: Record<string, unknown>;
  }>;
}
```

---

## 4. Data Models

### 4.1 Game Definition Schema

```typescript
interface GameDefinition {
  id: string;
  version: string;
  metadata: {
    title: string;
    author: string;
    description: string;
    category: string;
    tags: string[];
    estimatedDuration: number;
    difficulty: "casual" | "moderate" | "challenging";
    contentWarnings?: string[];
  };
  
  contextIntegration: {
    required: ContextType[];     // Must have these MCPs connected
    optional: ContextType[];     // Can enhance with these
    injectionPoints: InjectionPoint[];
  };
  
  scenes: Record<string, SceneDefinition>;
  startScene: string;
  endings: Record<string, EndingDefinition>;
  
  variables: Record<string, VariableDefinition>;
  achievements?: AchievementDefinition[];
}

type ContextType = 
  | "calendar" 
  | "notes" 
  | "contacts" 
  | "location" 
  | "weather"
  | "email"
  | "files"
  | "custom";
```

### 4.2 Scene Definition

```typescript
interface SceneDefinition {
  id: string;
  
  // Content can include template variables
  title: string;
  narrative: string;              // Main text, supports {{variables}}
  narrativeVoice?: string;        // Override for voice narration
  
  // Context injection
  contextQuery?: {
    query: string;                // "What meetings do I have today?"
    injectAs: string;             // Variable name to inject result
    fallback: string;             // If no context available
  };
  
  // Choices
  choices: ChoiceDefinition[];
  
  // Conditions for auto-transitions
  autoTransition?: {
    condition: string;            // Expression like "stress > 80"
    targetScene: string;
  };
  
  // Effects when entering scene
  effects?: Effect[];
  
  // Voice/audio
  ambiance?: string;              // Audio cue identifier
  voiceStyle?: "dramatic" | "casual" | "mysterious" | "warm";
}

interface ChoiceDefinition {
  id: string;
  text: string;                   // Display text
  textVoice?: string;             // Voice version (shorter/punchier)
  
  // Visibility conditions
  condition?: string;             // Show only if true
  
  // What happens
  targetScene: string;
  effects?: Effect[];
  
  // For open-ended choices
  freeform?: {
    prompt: string;               // "What do you say to them?"
    aiProcess: boolean;           // Let AI interpret response
    fallbackScene: string;        // If AI can't parse
  };
}

interface Effect {
  type: "set" | "add" | "subtract" | "toggle" | "unlock";
  variable: string;
  value: unknown;
}
```

### 4.3 Context Injection Points

```typescript
interface InjectionPoint {
  id: string;
  description: string;
  
  // What to query
  contextType: ContextType;
  query: string;                  // Semantic query
  
  // How to use result
  transform: "verbatim" | "summarize" | "extract_names" | "extract_dates" | "custom";
  customTransform?: string;       // Prompt for custom transformation
  
  // Where to inject
  targetVariable: string;
  
  // Fallback
  fallbackValue: string;
  fallbackBehavior: "use_fallback" | "skip_scene" | "alternate_path";
}
```

### 4.4 Session State

```typescript
interface Session {
  id: string;
  gameId: string;
  playerId: string;
  
  // Current position
  currentSceneId: string;
  
  // State
  variables: Record<string, unknown>;
  unlockedAchievements: string[];
  
  // Context permissions (set at start)
  contextPermissions: ContextPermissions;
  
  // Voice settings
  voiceMode: boolean;
  voicePersona?: string;
  
  // Timestamps
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string;
  
  // History for replay/analysis
  history: HistoryEntry[];
}

interface HistoryEntry {
  timestamp: string;
  sceneId: string;
  choiceId?: string;
  freeformInput?: string;
  contextInjected?: Record<string, string>;
  effectsApplied?: Effect[];
}
```

---

## 5. Semantic Context Integration

### 5.1 How It Works

When a scene has a `contextQuery`, the MCP Games server:

1. **Parses the query** — e.g., "What's the player stressed about lately?"
2. **Routes to appropriate MCPs** — Based on `contextPermissions` and query intent
3. **Aggregates results** — Combines data from multiple sources
4. **Transforms for narrative** — Converts raw data to story-appropriate text
5. **Injects into scene** — Replaces `{{variable}}` in narrative

### 5.2 Example Flow

```
Game Definition:
  Scene "morning_reflection":
    narrative: "You wake up thinking about {{current_worry}}. The {{weather_description}} 
                outside matches your mood."
    contextQuery:
      - query: "What upcoming events or deadlines seem stressful?"
        injectAs: "current_worry"
        fallback: "the uncertain future"
      - query: "What's the weather like?"
        injectAs: "weather_description"  
        fallback: "grey sky"

At Runtime:
  1. Query Calendar MCP: "stressful upcoming events" → "Q1 investor pitch on Thursday"
  2. Query Weather MCP: "current weather" → "overcast with light rain"
  
Result:
  "You wake up thinking about the Q1 investor pitch on Thursday. The overcast sky 
   with light rain outside matches your mood."
```

### 5.3 Privacy & Consent Model

```typescript
interface ContextPermissions {
  // Granular permissions set at game start
  calendar: "none" | "today" | "week" | "full";
  notes: "none" | "titles" | "full";
  contacts: "none" | "names" | "full";
  location: "none" | "city" | "precise";
  
  // Custom MCPs
  customMcps: Record<string, "none" | "limited" | "full">;
  
  // Master controls
  allowAiSummarization: boolean;  // Can AI rephrase context?
  allowPersistence: boolean;       // Store context for future sessions?
}
```

---

## 6. Voice Integration (PersonaPlex)

### 6.1 Narration Pipeline

```
Scene Text → SSML Enhancement → PersonaPlex Text Prompt → Voice Output
```

### 6.2 SSML Enhancement Rules

```typescript
interface NarrationConfig {
  // Base voice settings
  persona: {
    textPrompt: string;      // "A warm, wise storyteller with a slight accent"
    voiceEmbedding?: string; // Pre-computed voice ID (NATF0, NATM1, etc.)
  };
  
  // Scene-specific overrides
  sceneStyles: Record<string, {
    pace: "slow" | "normal" | "fast";
    emotion: "neutral" | "excited" | "somber" | "tense" | "warm";
    emphasis: string[];      // Words to emphasize
  }>;
  
  // Choice presentation
  choicePresentation: "numbered" | "natural" | "dramatic_pause";
}
```

### 6.3 PersonaPlex Integration Points

```typescript
// Generate narration request for PersonaPlex
function generateNarrationRequest(scene: Scene, config: NarrationConfig): PersonaPlexRequest {
  return {
    textPrompt: config.persona.textPrompt,
    voicePrompt: config.persona.voiceEmbedding,
    content: scene.narrativeVoice || scene.narrative,
    style: scene.voiceStyle,
    // Full-duplex: allow interruption for choices
    interruptible: true,
    onInterrupt: "pause_and_listen"
  };
}
```

---

## 7. Example Game: "The Morning Decision"

A short (5-minute) game demonstrating context integration.

```yaml
id: morning-decision-v1
version: "1.0.0"

metadata:
  title: "The Morning Decision"
  author: "MCP Games"
  description: "A brief journey through a pivotal morning, personalized to your life"
  category: "personal-growth"
  estimatedDuration: 5
  
contextIntegration:
  required: []
  optional: [calendar, weather, notes]
  
startScene: wake_up

scenes:
  wake_up:
    title: "Dawn"
    narrative: |
      Your eyes open to {{weather_light}}. Today is {{day_context}}.
      
      You lie there for a moment, aware of {{upcoming_thing}} waiting for you.
      
      How do you want to start this day?
    contextQuery:
      - query: "current weather light conditions"
        injectAs: weather_light
        fallback: "soft morning light"
      - query: "what day is it and any significance"
        injectAs: day_context
        fallback: "a day like any other"
      - query: "most important thing on calendar today"
        injectAs: upcoming_thing
        fallback: "the day's possibilities"
    choices:
      - id: energetic
        text: "Leap out of bed with energy"
        targetScene: energetic_morning
        effects:
          - type: set
            variable: morning_energy
            value: high
      - id: slow
        text: "Take it slow, savor the quiet"
        targetScene: slow_morning
        effects:
          - type: set
            variable: morning_energy
            value: low
      - id: phone
        text: "Reach for your phone first"
        targetScene: phone_check
        effects:
          - type: set
            variable: morning_energy
            value: reactive

  energetic_morning:
    title: "Momentum"
    narrative: |
      You swing your legs out of bed before doubt can catch you.
      
      The floor is cool beneath your feet. You feel {{energy_description}}.
      
      In the kitchen, you notice {{kitchen_context}}.
    contextQuery:
      - query: "how busy is user's schedule today"
        injectAs: energy_description
        transform: custom
        customTransform: "Convert schedule density to an energy feeling"
        fallback: "a quiet determination building"
    choices:
      - id: coffee_first
        text: "Coffee first, everything else second"
        targetScene: coffee_ritual
      - id: exercise
        text: "No caffeine yet — move your body first"
        targetScene: morning_movement
        condition: "morning_energy == 'high'"

  # ... additional scenes ...

endings:
  centered:
    title: "Centered"
    narrative: |
      You step out the door feeling aligned with yourself.
      
      Whatever {{upcoming_thing}} brings, you're ready to meet it.
      
      This is how days should begin.
    achievement: morning_master
    
variables:
  morning_energy:
    type: string
    default: "neutral"
  clarity_score:
    type: number
    default: 0
    
achievements:
  - id: morning_master
    title: "Morning Master"
    description: "Found your center before the day began"
  - id: phone_free
    title: "Unplugged Dawn"
    description: "Started the day without checking your phone"
```

---

## 8. Database Schema (Supabase)

```sql
-- Games registry
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  definition JSONB NOT NULL,
  version TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id),
  player_id TEXT NOT NULL,
  
  current_scene_id TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  context_permissions JSONB NOT NULL,
  
  voice_mode BOOLEAN DEFAULT FALSE,
  voice_persona TEXT,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  INDEX idx_sessions_player (player_id),
  INDEX idx_sessions_active (completed_at) WHERE completed_at IS NULL
);

-- History log
CREATE TABLE session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  
  scene_id TEXT NOT NULL,
  choice_id TEXT,
  freeform_input TEXT,
  context_injected JSONB,
  effects_applied JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_history_session (session_id, created_at)
);

-- Achievements
CREATE TABLE player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  game_id UUID REFERENCES games(id),
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(player_id, game_id, achievement_id)
);

-- Analytics (for engagement tracking)
CREATE TABLE game_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id),
  session_id UUID REFERENCES sessions(id),
  
  event_type TEXT NOT NULL,  -- 'scene_view', 'choice_made', 'context_used', 'completion'
  event_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_analytics_game (game_id, created_at),
  INDEX idx_analytics_type (event_type, created_at)
);

-- Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

-- Policies (player can only see their own data)
CREATE POLICY sessions_player_policy ON sessions
  FOR ALL USING (player_id = current_setting('app.player_id'));
```

---

## 9. Implementation Phases

### Phase 1A: Core Engine (Week 1-2)
- [ ] MCP server skeleton (TypeScript + `@modelcontextprotocol/sdk`)
- [ ] Game definition parser + validator
- [ ] Scene navigation logic
- [ ] Basic variable/effect system
- [ ] Supabase integration for state persistence

### Phase 1B: Context Integration (Week 2-3)
- [ ] Context query router
- [ ] Calendar MCP adapter
- [ ] Notes MCP adapter  
- [ ] Weather MCP adapter (public API fallback)
- [ ] Context transformation pipeline

### Phase 1C: Voice + Platform (Week 3-4)
- [ ] PersonaPlex narration generator
- [ ] Telegram bot integration
- [ ] Voice mode toggle
- [ ] Basic analytics

### Phase 1 Exit Criteria
- [ ] "The Morning Decision" playable via Telegram text
- [ ] "The Morning Decision" playable via Telegram voice (PersonaPlex)
- [ ] Context injection working with at least 1 MCP
- [ ] 10 successful playthroughs logged

---

## 10. Open Questions

1. **Game authoring tool** — YAML files for v1, but should we plan for a visual editor?
2. **Multiplayer** — Document mentions multi-player CYOA in Phase 2. Defer or design hooks now?
3. **AI-generated scenes** — Should we allow LLM to generate scene content on-the-fly based on context?
4. **Monetization hooks** — Premium games, in-game purchases, or pure freemium?

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PersonaPlex latency too high for real-time | Medium | High | Fallback to TTS cascade, pre-generate common narrations |
| MCP query failures break game flow | High | Medium | Robust fallbacks at every injection point |
| Context feels invasive/creepy | Medium | High | Clear consent UI, "generic mode" option |
| Game content too thin for engagement | Medium | Medium | Ship 3-5 short games, not 1 long one |

---

## Appendix A: MCP Protocol Compliance

This server implements MCP 1.0 specification:
- **Transport:** stdio (local), SSE (remote)
- **Tools:** Listed in Section 3.2
- **Resources:** Game definitions exposed as `game://{slug}` URIs
- **Prompts:** Pre-built prompts for game discovery and onboarding

## Appendix B: PersonaPlex Voice Presets

| ID | Description | Best For |
|----|-------------|----------|
| NATF0 | Natural female, warm | Personal growth, calm scenes |
| NATM1 | Natural male, authoritative | Adventure, dramatic narration |
| VARF2 | Variety female, energetic | Comedic, fast-paced |
| VARM0 | Variety male, mysterious | Mystery, thriller |

---

*End of Specification*
