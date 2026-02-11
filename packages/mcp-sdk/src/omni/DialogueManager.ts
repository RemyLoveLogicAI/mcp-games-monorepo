/**
 * Dialogue Manager - Multi-turn conversation state machine
 *
 * Provides sophisticated dialogue management including:
 * - Finite state machine for conversation flows
 * - Multi-turn context tracking
 * - Slot filling for structured data collection
 * - Confirmation and clarification handling
 * - Dialogue policies and strategies
 * - Conversation repair mechanisms
 *
 * @example
 * ```typescript
 * const dialogue = new DialogueManager();
 *
 * // Register a dialogue flow
 * dialogue.registerFlow('book-meeting', {
 *   slots: ['date', 'time', 'attendees', 'topic'],
 *   states: {
 *     start: { next: 'collect-date', prompt: 'When would you like to meet?' },
 *     'collect-date': { slot: 'date', next: 'collect-time' },
 *     'collect-time': { slot: 'time', next: 'collect-attendees' },
 *     // ...
 *   },
 *   onComplete: async (slots) => { /* create meeting */ },
 * });
 *
 * // Process user input
 * const response = await dialogue.process(userId, 'Schedule a meeting');
 * ```
 */

import type { DetectedIntent, ExtractedEntity } from './ConversationMemory';

// =============================================================================
// Types
// =============================================================================

/**
 * Dialogue flow definition
 */
export interface DialogueFlow {
  id: string;
  name: string;
  description?: string;
  /** Slots to collect */
  slots: SlotDefinition[];
  /** Flow states */
  states: Record<string, DialogueState>;
  /** Initial state */
  initialState: string;
  /** Flow priority for intent matching */
  priority?: number;
  /** Intent triggers */
  triggers: FlowTrigger[];
  /** Callback when flow completes */
  onComplete?: (context: DialogueContext) => Promise<string | void>;
  /** Callback when flow is cancelled */
  onCancel?: (context: DialogueContext) => Promise<string | void>;
  /** Maximum turns before timeout */
  maxTurns?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Slot definition
 */
export interface SlotDefinition {
  name: string;
  type: SlotType;
  required: boolean;
  prompt: string;
  reprompt?: string;
  validation?: (value: unknown) => boolean | string;
  transform?: (value: unknown) => unknown;
  entityType?: string;
  defaultValue?: unknown;
  confirmationRequired?: boolean;
}

/**
 * Slot types
 */
export type SlotType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'url'
  | 'entity'
  | 'enum'
  | 'list'
  | 'custom';

/**
 * Dialogue state
 */
export interface DialogueState {
  /** State ID */
  id?: string;
  /** Slot to fill in this state */
  slot?: string;
  /** Next state */
  next?: string | ((context: DialogueContext) => string);
  /** Prompt to display */
  prompt?: string | ((context: DialogueContext) => string);
  /** Actions to execute */
  actions?: StateAction[];
  /** Conditions for state transitions */
  conditions?: StateCondition[];
  /** Whether this is a terminal state */
  terminal?: boolean;
  /** State timeout (ms) */
  timeout?: number;
  /** Handler for this state */
  handler?: (input: ProcessedInput, context: DialogueContext) => Promise<StateResult>;
}

/**
 * State action
 */
export interface StateAction {
  type: 'set-slot' | 'clear-slot' | 'api-call' | 'mcp-query' | 'emit-event' | 'custom';
  config: Record<string, unknown>;
}

/**
 * State condition
 */
export interface StateCondition {
  when: string | ((context: DialogueContext) => boolean);
  then: string;
}

/**
 * Flow trigger
 */
export interface FlowTrigger {
  type: 'intent' | 'keyword' | 'pattern' | 'entity' | 'custom';
  value: string | RegExp | ((input: ProcessedInput) => boolean);
  confidence?: number;
}

/**
 * Dialogue context for a user session
 */
export interface DialogueContext {
  userId: string;
  sessionId: string;
  activeFlow?: string;
  currentState?: string;
  slots: Map<string, SlotValue>;
  turnCount: number;
  startedAt: string;
  lastActivityAt: string;
  history: DialogueTurn[];
  metadata: Record<string, unknown>;
}

/**
 * Slot value
 */
export interface SlotValue {
  value: unknown;
  confidence: number;
  source: 'user' | 'inferred' | 'default' | 'api';
  confirmed: boolean;
  timestamp: string;
}

/**
 * Dialogue turn
 */
export interface DialogueTurn {
  turnId: number;
  userInput: string;
  processedInput: ProcessedInput;
  state: string;
  response: string;
  slotsUpdated: string[];
  timestamp: string;
}

/**
 * Processed user input
 */
export interface ProcessedInput {
  raw: string;
  normalized: string;
  intent?: DetectedIntent;
  entities: ExtractedEntity[];
  sentiment?: number;
  language?: string;
  isQuestion: boolean;
  isConfirmation: boolean;
  isNegation: boolean;
  isCancellation: boolean;
}

/**
 * State result
 */
export interface StateResult {
  response: string;
  nextState?: string;
  slotsUpdated?: Record<string, unknown>;
  flowComplete?: boolean;
  flowCancelled?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Dialogue manager configuration
 */
export interface DialogueManagerConfig {
  /** Default timeout for flows (ms) */
  defaultTimeoutMs: number;
  /** Maximum turns per flow */
  maxTurnsPerFlow: number;
  /** Enable automatic slot confirmation */
  autoConfirmSlots: boolean;
  /** Confirmation threshold (confidence above this doesn't need confirmation) */
  confirmationThreshold: number;
  /** Enable clarification for low-confidence inputs */
  enableClarification: boolean;
  /** Clarification threshold */
  clarificationThreshold: number;
  /** Debug mode */
  debug: boolean;
}

const DEFAULT_CONFIG: DialogueManagerConfig = {
  defaultTimeoutMs: 5 * 60 * 1000, // 5 minutes
  maxTurnsPerFlow: 20,
  autoConfirmSlots: true,
  confirmationThreshold: 0.9,
  enableClarification: true,
  clarificationThreshold: 0.5,
  debug: false,
};

// =============================================================================
// Input Processor
// =============================================================================

/**
 * Process raw user input
 */
export class InputProcessor {
  private confirmationPatterns = [
    /^(yes|yeah|yep|sure|ok|okay|correct|right|confirm|definitely|absolutely|of course)$/i,
    /^(that'?s? (right|correct))$/i,
  ];

  private negationPatterns = [
    /^(no|nope|nah|wrong|incorrect|not really)$/i,
    /^(that'?s? (wrong|incorrect|not right))$/i,
  ];

  private cancellationPatterns = [
    /^(cancel|stop|quit|exit|never ?mind|forget it)$/i,
    /^(i (don'?t|do not) want to)$/i,
  ];

  /**
   * Process raw input into structured format
   */
  process(
    raw: string,
    intent?: DetectedIntent,
    entities: ExtractedEntity[] = []
  ): ProcessedInput {
    const normalized = raw.toLowerCase().trim();

    return {
      raw,
      normalized,
      intent,
      entities,
      isQuestion: raw.includes('?') || /^(what|where|when|who|why|how|can|could|would|will|is|are|do|does)/i.test(normalized),
      isConfirmation: this.confirmationPatterns.some(p => p.test(normalized)),
      isNegation: this.negationPatterns.some(p => p.test(normalized)),
      isCancellation: this.cancellationPatterns.some(p => p.test(normalized)),
    };
  }
}

// =============================================================================
// Slot Filler
// =============================================================================

/**
 * Fill slots from processed input
 */
export class SlotFiller {
  /**
   * Attempt to fill a slot from input
   */
  fill(
    slot: SlotDefinition,
    input: ProcessedInput,
    context: DialogueContext
  ): { value: unknown; confidence: number } | null {
    // Try to extract from entities first
    if (slot.entityType) {
      const entity = input.entities.find(e => e.type === slot.entityType);
      if (entity) {
        const value = slot.transform ? slot.transform(entity.value) : entity.value;
        return { value, confidence: entity.confidence };
      }
    }

    // Type-specific extraction
    switch (slot.type) {
      case 'boolean':
        return this.extractBoolean(input);

      case 'number':
        return this.extractNumber(input);

      case 'date':
        return this.extractDate(input);

      case 'time':
        return this.extractTime(input);

      case 'email':
        return this.extractEmail(input);

      case 'phone':
        return this.extractPhone(input);

      default:
        // Use raw input for string types
        if (input.normalized.length > 0) {
          const value = slot.transform ? slot.transform(input.raw) : input.raw;
          return { value, confidence: 0.7 };
        }
    }

    return null;
  }

  private extractBoolean(input: ProcessedInput): { value: boolean; confidence: number } | null {
    if (input.isConfirmation) {
      return { value: true, confidence: 0.95 };
    }
    if (input.isNegation) {
      return { value: false, confidence: 0.95 };
    }
    return null;
  }

  private extractNumber(input: ProcessedInput): { value: number; confidence: number } | null {
    const match = input.normalized.match(/\d+(?:\.\d+)?/);
    if (match) {
      return { value: parseFloat(match[0]), confidence: 0.9 };
    }

    // Word numbers
    const wordNumbers: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };

    for (const [word, num] of Object.entries(wordNumbers)) {
      if (input.normalized.includes(word)) {
        return { value: num, confidence: 0.85 };
      }
    }

    return null;
  }

  private extractDate(input: ProcessedInput): { value: string; confidence: number } | null {
    const entity = input.entities.find(e => e.type === 'date');
    if (entity) {
      return { value: entity.value, confidence: entity.confidence };
    }

    // Relative dates
    const today = new Date();
    if (input.normalized.includes('today')) {
      return { value: today.toISOString().split('T')[0], confidence: 0.95 };
    }
    if (input.normalized.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { value: tomorrow.toISOString().split('T')[0], confidence: 0.95 };
    }

    return null;
  }

  private extractTime(input: ProcessedInput): { value: string; confidence: number } | null {
    const entity = input.entities.find(e => e.type === 'time');
    if (entity) {
      return { value: entity.value, confidence: entity.confidence };
    }
    return null;
  }

  private extractEmail(input: ProcessedInput): { value: string; confidence: number } | null {
    const entity = input.entities.find(e => e.type === 'email');
    if (entity) {
      return { value: entity.value, confidence: entity.confidence };
    }
    return null;
  }

  private extractPhone(input: ProcessedInput): { value: string; confidence: number } | null {
    const entity = input.entities.find(e => e.type === 'phone');
    if (entity) {
      return { value: entity.value, confidence: entity.confidence };
    }
    return null;
  }

  /**
   * Validate a slot value
   */
  validate(slot: SlotDefinition, value: unknown): { valid: boolean; error?: string } {
    if (slot.validation) {
      const result = slot.validation(value);
      if (typeof result === 'string') {
        return { valid: false, error: result };
      }
      return { valid: result };
    }
    return { valid: true };
  }
}

// =============================================================================
// Dialogue Manager
// =============================================================================

/**
 * Multi-turn dialogue manager
 */
export class DialogueManager {
  private config: DialogueManagerConfig;
  private flows: Map<string, DialogueFlow> = new Map();
  private contexts: Map<string, DialogueContext> = new Map();
  private inputProcessor: InputProcessor;
  private slotFiller: SlotFiller;

  constructor(config: Partial<DialogueManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.inputProcessor = new InputProcessor();
    this.slotFiller = new SlotFiller();
  }

  /**
   * Register a dialogue flow
   */
  registerFlow(flow: DialogueFlow): void {
    this.flows.set(flow.id, flow);
    this.log(`Registered flow: ${flow.id}`);
  }

  /**
   * Unregister a dialogue flow
   */
  unregisterFlow(flowId: string): void {
    this.flows.delete(flowId);
  }

  /**
   * Process user input
   */
  async process(
    userId: string,
    input: string,
    intent?: DetectedIntent,
    entities: ExtractedEntity[] = []
  ): Promise<DialogueResponse> {
    // Process input
    const processedInput = this.inputProcessor.process(input, intent, entities);

    // Get or create context
    let context = this.contexts.get(userId);

    // Handle cancellation
    if (processedInput.isCancellation && context?.activeFlow) {
      return this.cancelFlow(userId);
    }

    // Check for active flow
    if (context?.activeFlow) {
      return this.continueFlow(userId, processedInput);
    }

    // Try to match a new flow
    const matchedFlow = this.matchFlow(processedInput);
    if (matchedFlow) {
      return this.startFlow(userId, matchedFlow.id, processedInput);
    }

    // No flow matched - return fallback
    return {
      response: "I'm not sure how to help with that. Could you try rephrasing?",
      flowActive: false,
      understood: false,
    };
  }

  /**
   * Start a dialogue flow
   */
  async startFlow(
    userId: string,
    flowId: string,
    input?: ProcessedInput
  ): Promise<DialogueResponse> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    // Create context
    const context: DialogueContext = {
      userId,
      sessionId: this.generateSessionId(),
      activeFlow: flowId,
      currentState: flow.initialState,
      slots: new Map(),
      turnCount: 0,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      history: [],
      metadata: {},
    };

    this.contexts.set(userId, context);
    this.log(`Started flow ${flowId} for user ${userId}`);

    // Process initial state
    return this.processState(context, flow, input);
  }

  /**
   * Continue an active flow
   */
  private async continueFlow(
    userId: string,
    input: ProcessedInput
  ): Promise<DialogueResponse> {
    const context = this.contexts.get(userId);
    if (!context || !context.activeFlow) {
      throw new Error(`No active flow for user ${userId}`);
    }

    const flow = this.flows.get(context.activeFlow);
    if (!flow) {
      throw new Error(`Flow not found: ${context.activeFlow}`);
    }

    // Check timeout
    const elapsed = Date.now() - new Date(context.lastActivityAt).getTime();
    const timeout = flow.timeoutMs ?? this.config.defaultTimeoutMs;

    if (elapsed > timeout) {
      return this.timeoutFlow(userId, 'Flow timed out due to inactivity.');
    }

    // Check turn limit
    if (context.turnCount >= (flow.maxTurns ?? this.config.maxTurnsPerFlow)) {
      return this.timeoutFlow(userId, 'Maximum turns reached.');
    }

    // Update context
    context.turnCount++;
    context.lastActivityAt = new Date().toISOString();

    // Process current state with input
    return this.processState(context, flow, input);
  }

  /**
   * Process a dialogue state
   */
  private async processState(
    context: DialogueContext,
    flow: DialogueFlow,
    input?: ProcessedInput
  ): Promise<DialogueResponse> {
    const state = flow.states[context.currentState!];
    if (!state) {
      throw new Error(`State not found: ${context.currentState}`);
    }

    // If state has a custom handler, use it
    if (state.handler && input) {
      const result = await state.handler(input, context);
      return this.handleStateResult(context, flow, result, input);
    }

    // If collecting a slot
    if (state.slot && input) {
      return this.handleSlotCollection(context, flow, state, input);
    }

    // Generate prompt and wait for input
    const prompt = typeof state.prompt === 'function'
      ? state.prompt(context)
      : state.prompt ?? 'Please continue.';

    return {
      response: prompt,
      flowActive: true,
      currentState: context.currentState,
      slotsCollected: this.getSlotsObject(context),
      understood: true,
    };
  }

  /**
   * Handle slot collection
   */
  private async handleSlotCollection(
    context: DialogueContext,
    flow: DialogueFlow,
    state: DialogueState,
    input: ProcessedInput
  ): Promise<DialogueResponse> {
    const slotDef = flow.slots.find(s => s.name === state.slot);
    if (!slotDef) {
      throw new Error(`Slot definition not found: ${state.slot}`);
    }

    // Try to fill the slot
    const extracted = this.slotFiller.fill(slotDef, input, context);

    if (!extracted) {
      // Couldn't extract value
      const reprompt = slotDef.reprompt ?? slotDef.prompt;
      return {
        response: `I didn't quite get that. ${reprompt}`,
        flowActive: true,
        currentState: context.currentState,
        slotsCollected: this.getSlotsObject(context),
        understood: false,
      };
    }

    // Validate
    const validation = this.slotFiller.validate(slotDef, extracted.value);
    if (!validation.valid) {
      return {
        response: validation.error ?? `That doesn't seem right. ${slotDef.reprompt ?? slotDef.prompt}`,
        flowActive: true,
        currentState: context.currentState,
        slotsCollected: this.getSlotsObject(context),
        understood: false,
      };
    }

    // Check if confirmation needed
    const needsConfirmation =
      slotDef.confirmationRequired ||
      (this.config.autoConfirmSlots && extracted.confidence < this.config.confirmationThreshold);

    if (needsConfirmation && !context.metadata.pendingConfirmation) {
      context.metadata.pendingConfirmation = {
        slot: state.slot,
        value: extracted.value,
      };

      return {
        response: `Just to confirm, you said "${extracted.value}" for ${slotDef.name}. Is that correct?`,
        flowActive: true,
        currentState: context.currentState,
        slotsCollected: this.getSlotsObject(context),
        awaitingConfirmation: true,
        understood: true,
      };
    }

    // Handle pending confirmation
    if (context.metadata.pendingConfirmation) {
      const pending = context.metadata.pendingConfirmation as { slot: string; value: unknown };

      if (input.isConfirmation) {
        // Confirmed - save the slot
        context.slots.set(pending.slot, {
          value: pending.value,
          confidence: 1.0,
          source: 'user',
          confirmed: true,
          timestamp: new Date().toISOString(),
        });
        delete context.metadata.pendingConfirmation;
      } else if (input.isNegation) {
        // Rejected - re-prompt
        delete context.metadata.pendingConfirmation;
        return {
          response: slotDef.prompt,
          flowActive: true,
          currentState: context.currentState,
          slotsCollected: this.getSlotsObject(context),
          understood: true,
        };
      }
    } else {
      // Save slot directly
      context.slots.set(state.slot!, {
        value: extracted.value,
        confidence: extracted.confidence,
        source: 'user',
        confirmed: extracted.confidence >= this.config.confirmationThreshold,
        timestamp: new Date().toISOString(),
      });
    }

    // Move to next state
    return this.transitionToNextState(context, flow, state, input);
  }

  /**
   * Transition to next state
   */
  private async transitionToNextState(
    context: DialogueContext,
    flow: DialogueFlow,
    currentState: DialogueState,
    input?: ProcessedInput
  ): Promise<DialogueResponse> {
    // Check conditions
    if (currentState.conditions) {
      for (const condition of currentState.conditions) {
        const shouldTransition = typeof condition.when === 'function'
          ? condition.when(context)
          : this.evaluateCondition(condition.when, context);

        if (shouldTransition) {
          context.currentState = condition.then;
          return this.processState(context, flow, input);
        }
      }
    }

    // Get next state
    const next = typeof currentState.next === 'function'
      ? currentState.next(context)
      : currentState.next;

    if (!next || currentState.terminal) {
      // Flow complete
      return this.completeFlow(context, flow);
    }

    context.currentState = next;
    return this.processState(context, flow);
  }

  /**
   * Handle state result
   */
  private async handleStateResult(
    context: DialogueContext,
    flow: DialogueFlow,
    result: StateResult,
    input?: ProcessedInput
  ): Promise<DialogueResponse> {
    // Update slots if any
    if (result.slotsUpdated) {
      for (const [name, value] of Object.entries(result.slotsUpdated)) {
        context.slots.set(name, {
          value,
          confidence: 1.0,
          source: 'user',
          confirmed: true,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (result.flowComplete) {
      return this.completeFlow(context, flow);
    }

    if (result.flowCancelled) {
      return this.cancelFlow(context.userId);
    }

    if (result.nextState) {
      context.currentState = result.nextState;
      return this.processState(context, flow);
    }

    return {
      response: result.response,
      flowActive: true,
      currentState: context.currentState,
      slotsCollected: this.getSlotsObject(context),
      understood: true,
    };
  }

  /**
   * Complete a flow
   */
  private async completeFlow(
    context: DialogueContext,
    flow: DialogueFlow
  ): Promise<DialogueResponse> {
    this.log(`Flow ${flow.id} completed for user ${context.userId}`);

    let completionMessage = 'Done!';

    if (flow.onComplete) {
      const result = await flow.onComplete(context);
      if (result) {
        completionMessage = result;
      }
    }

    // Clean up context
    this.contexts.delete(context.userId);

    return {
      response: completionMessage,
      flowActive: false,
      flowCompleted: true,
      slotsCollected: this.getSlotsObject(context),
      understood: true,
    };
  }

  /**
   * Cancel a flow
   */
  private async cancelFlow(userId: string): Promise<DialogueResponse> {
    const context = this.contexts.get(userId);
    if (!context || !context.activeFlow) {
      return {
        response: 'Nothing to cancel.',
        flowActive: false,
        understood: true,
      };
    }

    const flow = this.flows.get(context.activeFlow);
    this.log(`Flow ${context.activeFlow} cancelled for user ${userId}`);

    let cancelMessage = 'Cancelled.';

    if (flow?.onCancel) {
      const result = await flow.onCancel(context);
      if (result) {
        cancelMessage = result;
      }
    }

    this.contexts.delete(userId);

    return {
      response: cancelMessage,
      flowActive: false,
      flowCancelled: true,
      understood: true,
    };
  }

  /**
   * Timeout a flow
   */
  private async timeoutFlow(userId: string, reason: string): Promise<DialogueResponse> {
    this.contexts.delete(userId);

    return {
      response: `${reason} Let's start over.`,
      flowActive: false,
      flowTimedOut: true,
      understood: true,
    };
  }

  /**
   * Match input to a flow
   */
  private matchFlow(input: ProcessedInput): DialogueFlow | null {
    const matches: Array<{ flow: DialogueFlow; score: number }> = [];

    for (const flow of this.flows.values()) {
      for (const trigger of flow.triggers) {
        const matched = this.matchTrigger(trigger, input);
        if (matched > 0) {
          matches.push({
            flow,
            score: matched * (flow.priority ?? 1),
          });
          break;
        }
      }
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => b.score - a.score);
    return matches[0].flow;
  }

  /**
   * Match a trigger against input
   */
  private matchTrigger(trigger: FlowTrigger, input: ProcessedInput): number {
    switch (trigger.type) {
      case 'intent':
        if (input.intent?.name === trigger.value) {
          return input.intent.confidence;
        }
        break;

      case 'keyword':
        if (input.normalized.includes(trigger.value as string)) {
          return 0.7;
        }
        break;

      case 'pattern':
        if ((trigger.value as RegExp).test(input.normalized)) {
          return 0.8;
        }
        break;

      case 'entity':
        if (input.entities.some(e => e.type === trigger.value)) {
          return 0.85;
        }
        break;

      case 'custom':
        if ((trigger.value as (input: ProcessedInput) => boolean)(input)) {
          return trigger.confidence ?? 0.9;
        }
        break;
    }

    return 0;
  }

  /**
   * Evaluate a condition string
   */
  private evaluateCondition(condition: string, context: DialogueContext): boolean {
    // Simple slot-based conditions: "slot:name=value" or "slot:name"
    if (condition.startsWith('slot:')) {
      const rest = condition.slice(5);
      if (rest.includes('=')) {
        const [name, value] = rest.split('=');
        return context.slots.get(name)?.value === value;
      }
      return context.slots.has(rest);
    }
    return false;
  }

  /**
   * Get slots as plain object
   */
  private getSlotsObject(context: DialogueContext): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [name, slot] of context.slots) {
      obj[name] = slot.value;
    }
    return obj;
  }

  /**
   * Get context for a user
   */
  getContext(userId: string): DialogueContext | undefined {
    return this.contexts.get(userId);
  }

  /**
   * Check if user has active flow
   */
  hasActiveFlow(userId: string): boolean {
    return this.contexts.has(userId) && !!this.contexts.get(userId)?.activeFlow;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[DialogueManager] ${message}`);
    }
  }
}

/**
 * Dialogue response
 */
export interface DialogueResponse {
  response: string;
  flowActive: boolean;
  currentState?: string;
  slotsCollected?: Record<string, unknown>;
  awaitingConfirmation?: boolean;
  flowCompleted?: boolean;
  flowCancelled?: boolean;
  flowTimedOut?: boolean;
  understood: boolean;
  suggestedActions?: string[];
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a dialogue manager
 */
export function createDialogueManager(
  config?: Partial<DialogueManagerConfig>
): DialogueManager {
  return new DialogueManager(config);
}

/**
 * Create a simple dialogue flow
 */
export function createFlow(
  id: string,
  config: Omit<DialogueFlow, 'id'>
): DialogueFlow {
  return { id, ...config };
}
