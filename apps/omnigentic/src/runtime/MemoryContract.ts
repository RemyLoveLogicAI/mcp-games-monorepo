/**
 * Standard interface for Agent Memory access.
 * Decouples the storage mechanism (Vector DB, Redis, JSON file) from the Agent.
 */
export interface MemoryIO {
    /**
     * Store a memory fragment.
     */
    write(fragment: MemoryFragment): Promise<string>;

    /**
     * Retrieve memories relevant to a query.
     */
    search(query: MemoryQuery): Promise<MemoryFragment[]>;

    /**
     * Retrieve specific memory by ID.
     */
    read(id: string): Promise<MemoryFragment | null>;

    /**
     * Update an existing memory.
     */
    update(id: string, update: Partial<MemoryFragment>): Promise<void>;

    /**
     * Hard delete execution.
     */
    forget(id: string): Promise<void>;
}

export interface MemoryFragment {
    id?: string;
    agentId: string;
    content: string;
    embedding?: number[];
    tags: string[];
    created: number;
    importance: number; // 0.0 to 1.0
    type: 'episodic' | 'semantic' | 'procedural';
}

export interface MemoryQuery {
    text?: string;
    embedding?: number[];
    tags?: string[];
    limit?: number;
    minRelevance?: number;
    timeRange?: { start: number; end: number };
}
