# MCP Games Monorepo 🎮

**Prime AI Agents Ecosystem - MCP Games v2.0**

> A Turborepo monorepo for building Choose Your Own Adventure (CYOA) experiences that semantically query connected Model Context Protocol (MCP) servers to create deeply personalized narrative experiences.

## 🌟 Vision

MCP Games represents the first product in the Prime AI Agents ecosystem, focusing on **unrestricted OmniAgents** that leverage MCP integrations to create dynamic, context-aware gaming experiences. By semantically querying connected MCPs (Linear, Notion, GitHub, filesystem, databases, etc.), we generate narratives that adapt to real user data, preferences, and contexts.

## 🏗️ Architecture

This monorepo uses **Turborepo** for optimal build orchestration and **PNPM** for efficient dependency management.

```
mcp-games-monorepo/
├── apps/
│   ├── cyoa-engine/          # Next.js frontend - Interactive CYOA UI
│   ├── mcp-connector/        # Express.js API - MCP integration layer
│   └── narrative-ai/         # FastAPI service - AI narrative generation
├── packages/
│   ├── shared-types/         # TypeScript definitions for cross-service types
│   ├── mcp-sdk/             # MCP client library for semantic querying
│   └── story-engine/        # Core story logic, state management, choice trees
└── [config files]
```

## 📦 Applications

### 🎯 cyoa-engine (Next.js)
The primary user-facing application providing:
- Interactive narrative UI with choice selection
- Real-time story progression
- User profile management
- MCP connection configuration
- Progress tracking and save states

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS

### 🔌 mcp-connector (Express.js)
The MCP integration service responsible for:
- Connecting to multiple MCP servers (Linear, Notion, GitHub, etc.)
- Semantic querying of user data and context
- Data aggregation and normalization
- Authentication and authorization with MCP servers
- Caching and query optimization

**Tech Stack:** Node.js, Express, TypeScript, MCP SDK

### 🤖 narrative-ai (FastAPI)
The AI-powered narrative generation engine:
- Dynamic story generation based on MCP context
- Character personality modeling
- Plot branching and consequence tracking
- Narrative consistency maintenance
- Integration with LLM providers (OpenAI, Anthropic, etc.)

**Tech Stack:** Python, FastAPI, LangChain, OpenAI SDK

## 📚 Shared Packages

### shared-types
Central TypeScript type definitions:
- MCP protocol types
- Story structure interfaces
- User profile schemas
- API contracts between services

### mcp-sdk
Custom MCP client library:
- Type-safe MCP server connections
- Semantic query builder
- Connection pooling
- Error handling and retry logic
- Query caching

### story-engine
Core game logic:
- Choice tree management
- State machine for story progression
- Save/load functionality
- Consequence tracking
- Variable substitution in narratives

## 🚀 Sprint 1 v2.0 Goals

### Phase 1: Foundation (Weeks 1-2)
- [x] Set up Turborepo monorepo structure
- [ ] Configure PNPM workspaces
- [ ] Implement basic MCP SDK with connection handling
- [ ] Create shared TypeScript types for MCP protocol
- [ ] Set up development environments for all services

### Phase 2: MCP Integration (Weeks 3-4)
- [ ] Build mcp-connector service with Express.js
- [ ] Implement semantic query system for GitHub MCP
- [ ] Add Linear MCP integration for project context
- [ ] Create data normalization layer
- [ ] Implement caching strategy

### Phase 3: Narrative Engine (Weeks 5-6)
- [ ] Develop narrative-ai service with FastAPI
- [ ] Integrate LLM provider (OpenAI/Anthropic)
- [ ] Build prompt engineering system for context injection
- [ ] Implement story generation with MCP data
- [ ] Create character and plot tracking

### Phase 4: Frontend & Story Engine (Weeks 7-8)
- [ ] Build Next.js frontend (cyoa-engine)
- [ ] Implement story-engine package with state management
- [ ] Create interactive UI for choice selection
- [ ] Build MCP configuration interface
- [ ] Implement save/load system

### Phase 5: Integration & Polish (Weeks 9-10)
- [ ] End-to-end integration testing
- [ ] Performance optimization
- [ ] Create sample CYOA story using GitHub/Linear data
- [ ] Documentation and developer guides
- [ ] Demo preparation

## 🛠️ Getting Started

### Prerequisites
- Node.js >= 18.0.0
- PNPM >= 8.0.0
- Python >= 3.11 (for narrative-ai)

### Installation

```bash
# Clone the repository
git clone https://github.com/RemyLoveLogicAI/mcp-games-monorepo.git
cd mcp-games-monorepo

# Install dependencies
pnpm install

# Set up Python environment for narrative-ai
cd apps/narrative-ai
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### Development

```bash
# Run all services in development mode
pnpm dev

# Build all packages and apps
pnpm build

# Run linting
pnpm lint

# Run tests
pnpm test
```

### Individual Service Commands

```bash
# Run only the frontend
pnpm --filter cyoa-engine dev

# Run only the MCP connector
pnpm --filter mcp-connector dev

# Run narrative AI service
cd apps/narrative-ai
source venv/bin/activate
uvicorn main:app --reload
```

## 🔗 MCP Integration Examples

### Semantic Querying
The system can query connected MCPs to personalize narratives:

```typescript
// Query GitHub for user's recent activity
const githubContext = await mcpClient.query('github', {
  semantic: 'recent repositories and contributions',
  filters: { timeframe: '30days' }
});

// Query Linear for project context
const projectContext = await mcpClient.query('linear', {
  semantic: 'active issues and team dynamics',
  filters: { status: 'in_progress' }
});

// Generate narrative with context
const narrative = await narrativeAI.generate({
  scene: 'office_scenario',
  context: { github: githubContext, linear: projectContext },
  userProfile: currentUser
});
```

## 🎯 Use Cases

1. **Developer's Journey**: A CYOA story where choices reflect your actual GitHub contributions, issue triaging style, and code review patterns

2. **Project Manager's Dilemma**: Navigate team challenges based on real Linear project data, deadlines, and team member interactions

3. **Personal Productivity Quest**: A gamified experience using filesystem and database MCPs to reflect your actual work patterns

## 🤝 Contributing

This is an active project under the Prime AI Agents ecosystem. Contributions welcome!

1. Follow the Turborepo structure
2. Maintain type safety across all TypeScript packages
3. Document MCP integrations thoroughly
4. Write tests for core functionality

## 📄 License

MIT License - see LICENSE file for details

## 🔮 Future Roadmap

- **Multi-player experiences**: Real-time collaborative CYOA with shared MCP context
- **Additional MCP integrations**: Notion, Slack, calendar systems
- **AI-generated visuals**: Dynamic scene generation based on narrative
- **Voice narration**: Text-to-speech with character voices
- **Mobile apps**: Native iOS/Android experiences
- **Story marketplace**: Community-created CYOA scenarios

## 📧 Contact

**Prime AI Agents Team**
- Project Lead: Jeremy Morgan-Jones SR.
- GitHub: [@RemyLoveLogicAI](https://github.com/RemyLoveLogicAI)

---

*Built with ❤️ by the Prime AI Agents team. Powered by MCP and unrestricted OmniAgents.*
