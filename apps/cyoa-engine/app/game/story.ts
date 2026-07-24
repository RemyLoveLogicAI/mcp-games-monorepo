export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
}

export interface Scene {
  id: string;
  narrative: string;
  choices: Choice[];
  endingLink?: string;
  endingText?: string;
}

export interface Story {
  title: string;
  scenes: Scene[];
}

export const story: Story = {
  title: 'Activation',
  scenes: [
    {
      id: 'start',
      narrative: `The Agentic Web is booting.

Three agents are live on the console. Each one turns language into action, but in a different domain.

Which one do you activate first?`,
      choices: [
        { id: 'agentic-os', text: 'Agentic OS — the voice-native execution runtime', nextSceneId: 'agentic-os' },
        { id: 'mcp-games', text: 'MCP Games — a story engine that reads your tools', nextSceneId: 'mcp-games' },
        { id: 'quantico', text: 'Quantico AI Agency — a financial forensic investigator', nextSceneId: 'quantico' },
      ],
    },
    {
      id: 'agentic-os',
      narrative: `You activate Agentic OS.

The room dims. A voice interface wakes up. You say: "Execute the sweep and report back."

The router dispatches the command to a tiered runtime, waits for an approval gate, then calls the tool. Every step is written to SQLite and JSONL.

In seconds, a trade is executed, a receipt is generated, and an evidence chain is locked.`,
      choices: [
        { id: 'agentic-os-end', text: 'Open the Agentic OS repo', nextSceneId: 'agentic-os-end' },
      ],
    },
    {
      id: 'agentic-os-end',
      narrative: `The Agentic OS flag is raised.

Autonomous action is no longer a demo. It is the operating system.`,
      choices: [],
      endingLink: 'https://github.com/RemyLoveLogicAI/agentic-os',
      endingText: 'Follow Agentic OS on GitHub',
    },
    {
      id: 'mcp-games',
      narrative: `You activate MCP Games.

The story engine opens a semantic channel to your calendar, notes, and messages. Instead of a generic plot, the game asks about your actual first meeting.

You choose a path. The context engine rewrites the narrative in real time, pulling real data through MCP. The boundary between your tools and the story dissolves.`,
      choices: [
        { id: 'mcp-games-end', text: 'Run another cycle', nextSceneId: 'mcp-games-end' },
      ],
    },
    {
      id: 'mcp-games-end',
      narrative: `The game is now your context.

MCP turns every tool into a narrative source. The next chapter is already loading from your own data.`,
      choices: [],
      endingLink: 'https://github.com/RemyLoveLogicAI/mcp-games-monorepo',
      endingText: 'Explore MCP Games on GitHub',
    },
    {
      id: 'quantico',
      narrative: `You activate Quantico AI Agency.

A recursive investigator ingests corporate registries, campaign finance, lobbying disclosures, and contracts. It resolves entities, traces shell companies, and surfaces hidden connections.

A graph blooms on screen. One node, a Delaware LLC, shares an address with a super PAC. The evidence is cited. The trail is live.`,
      choices: [
        { id: 'quantico-end', text: 'Open the dossier', nextSceneId: 'quantico-end' },
      ],
    },
    {
      id: 'quantico-end',
      narrative: `The connection is verified.

Quantico turned raw data into a lead. The investigation is just beginning.`,
      choices: [],
      endingLink: 'https://github.com/RemyLoveLogicAI/quantico-ai-agency',
      endingText: 'Follow Quantico on GitHub',
    },
  ],
};
