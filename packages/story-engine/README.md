# Story Engine 📖

Core game logic for managing story state, choices, and progression.

## Features

- Story state machine
- Choice tree navigation
- Variable tracking and evaluation
- Save/load game states
- Consequence calculation
- Variable substitution in narratives
- Story validation

## Usage

```typescript
import { StoryEngine, StoryState } from 'story-engine';

// Initialize engine
const engine = new StoryEngine(story);

// Start story
const initialState = engine.start(userId);

// Make a choice
const nextState = engine.makeChoice(currentState, choiceId);

// Save progress
await engine.saveState(state);

// Load progress
const loadedState = await engine.loadState(userId, storyId);
```
