/**
 * Save Manager - Game state persistence layer
 *
 * Provides:
 * - Multiple save slots support
 * - In-memory storage (for development/testing)
 * - LocalStorage adapter (for browser)
 * - Generic storage adapter interface
 */

import type {
  GameState,
  SaveData,
  SaveMetadata,
  SaveSlot,
  Result,
} from 'shared-types';

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

/**
 * Save manager configuration
 */
export interface SaveManagerConfig {
  /** Maximum number of save slots */
  maxSlots?: number;
  /** Storage key prefix */
  keyPrefix?: string;
  /** Enable compression */
  compress?: boolean;
  /** Auto-backup on save */
  autoBackup?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SaveManagerConfig> = {
  maxSlots: 10,
  keyPrefix: 'cyoa_save_',
  compress: false,
  autoBackup: true,
};

/**
 * In-memory storage adapter for development/testing
 */
export class InMemoryStorage implements StorageAdapter {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (prefix) {
      return allKeys.filter(k => k.startsWith(prefix));
    }
    return allKeys;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Browser localStorage adapter
 */
export class LocalStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  }

  async delete(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    if (typeof localStorage === 'undefined') return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (!prefix || key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    return keys;
  }

  async clear(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.clear();
  }
}

/**
 * Generic save manager with pluggable storage
 */
export class SaveManager {
  private storage: StorageAdapter;
  private config: Required<SaveManagerConfig>;

  constructor(storage?: StorageAdapter, config: SaveManagerConfig = {}) {
    this.storage = storage ?? new InMemoryStorage();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Save game state to a slot
   */
  async save(
    gameState: GameState,
    slotId?: string,
    name?: string
  ): Promise<Result<string>> {
    try {
      // Generate slot ID if not provided
      const id = slotId ?? this.generateSaveId(gameState.userId);

      // Check slot limit
      if (!slotId) {
        const existingSlots = await this.listSlots(gameState.userId);
        if (existingSlots.length >= this.config.maxSlots) {
          return {
            success: false,
            error: new Error(`Maximum save slots (${this.config.maxSlots}) reached`),
          };
        }
      }

      // Create save data
      const saveData: SaveData = {
        id,
        userId: gameState.userId,
        storyId: gameState.storyId,
        gameState,
        metadata: {
          name: name ?? `Save ${new Date().toLocaleString()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sceneTitle: gameState.currentSceneId,
          playTimeSeconds: this.calculatePlayTime(gameState),
          choiceCount: gameState.choiceHistory.length,
        },
      };

      // Backup existing save if auto-backup enabled
      if (this.config.autoBackup && slotId) {
        const existing = await this.storage.get(this.getKey(slotId));
        if (existing) {
          await this.storage.set(this.getKey(`${slotId}_backup`), existing);
        }
      }

      // Serialize and store
      const serialized = this.serialize(saveData);
      await this.storage.set(this.getKey(id), serialized);

      // Update user's save index
      await this.updateSaveIndex(gameState.userId, id);

      return { success: true, value: id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Save failed'),
      };
    }
  }

  /**
   * Load game state from a slot
   */
  async load(saveId: string): Promise<Result<GameState>> {
    try {
      const serialized = await this.storage.get(this.getKey(saveId));
      if (!serialized) {
        return {
          success: false,
          error: new Error(`Save ${saveId} not found`),
        };
      }

      const saveData = this.deserialize(serialized);

      // Validate save data
      if (!this.validateSaveData(saveData)) {
        return {
          success: false,
          error: new Error('Invalid or corrupted save data'),
        };
      }

      return { success: true, value: saveData.gameState };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Load failed'),
      };
    }
  }

  /**
   * Delete a save slot
   */
  async delete(saveId: string, userId?: string): Promise<Result<void>> {
    try {
      await this.storage.delete(this.getKey(saveId));
      await this.storage.delete(this.getKey(`${saveId}_backup`));

      if (userId) {
        await this.removeSaveFromIndex(userId, saveId);
      }

      return { success: true, value: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Delete failed'),
      };
    }
  }

  /**
   * List all save slots for a user
   */
  async listSlots(userId: string): Promise<SaveSlot[]> {
    const saveIds = await this.getSaveIndex(userId);
    const slots: SaveSlot[] = [];

    for (const saveId of saveIds) {
      const serialized = await this.storage.get(this.getKey(saveId));
      if (serialized) {
        try {
          const saveData = this.deserialize(serialized);
          slots.push({
            id: saveId,
            isEmpty: false,
            saveData,
            lastModified: saveData.metadata.updatedAt,
          });
        } catch {
          // Corrupted save, mark as empty
          slots.push({ id: saveId, isEmpty: true });
        }
      }
    }

    // Sort by last modified date
    slots.sort((a, b) => {
      const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return bTime - aTime;
    });

    return slots;
  }

  /**
   * Get a specific save slot
   */
  async getSlot(saveId: string): Promise<SaveSlot | null> {
    const serialized = await this.storage.get(this.getKey(saveId));
    if (!serialized) return null;

    try {
      const saveData = this.deserialize(serialized);
      return {
        id: saveId,
        isEmpty: false,
        saveData,
        lastModified: saveData.metadata.updatedAt,
      };
    } catch {
      return { id: saveId, isEmpty: true };
    }
  }

  /**
   * Export save data as JSON string
   */
  async export(saveId: string): Promise<string | null> {
    const serialized = await this.storage.get(this.getKey(saveId));
    return serialized;
  }

  /**
   * Import save data from JSON string
   */
  async import(data: string, userId: string): Promise<Result<string>> {
    try {
      const saveData = this.deserialize(data);

      // Validate
      if (!this.validateSaveData(saveData)) {
        return {
          success: false,
          error: new Error('Invalid save data format'),
        };
      }

      // Assign new ID and update user
      const newId = this.generateSaveId(userId);
      saveData.id = newId;
      saveData.userId = userId;
      saveData.gameState.userId = userId;
      saveData.metadata.updatedAt = new Date().toISOString();

      // Store
      await this.storage.set(this.getKey(newId), this.serialize(saveData));
      await this.updateSaveIndex(userId, newId);

      return { success: true, value: newId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Import failed'),
      };
    }
  }

  /**
   * Clear all saves for a user
   */
  async clearUser(userId: string): Promise<void> {
    const saveIds = await this.getSaveIndex(userId);
    for (const saveId of saveIds) {
      await this.storage.delete(this.getKey(saveId));
      await this.storage.delete(this.getKey(`${saveId}_backup`));
    }
    await this.storage.delete(this.getIndexKey(userId));
  }

  /**
   * Clear all saves (use with caution)
   */
  async clearAll(): Promise<void> {
    const keys = await this.storage.keys(this.config.keyPrefix);
    for (const key of keys) {
      await this.storage.delete(key);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getKey(id: string): string {
    return `${this.config.keyPrefix}${id}`;
  }

  private getIndexKey(userId: string): string {
    return `${this.config.keyPrefix}index_${userId}`;
  }

  private generateSaveId(userId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${userId}_${timestamp}_${random}`;
  }

  private async getSaveIndex(userId: string): Promise<string[]> {
    const indexData = await this.storage.get(this.getIndexKey(userId));
    if (!indexData) return [];
    try {
      return JSON.parse(indexData) as string[];
    } catch {
      return [];
    }
  }

  private async updateSaveIndex(userId: string, saveId: string): Promise<void> {
    const index = await this.getSaveIndex(userId);
    if (!index.includes(saveId)) {
      index.push(saveId);
      await this.storage.set(this.getIndexKey(userId), JSON.stringify(index));
    }
  }

  private async removeSaveFromIndex(userId: string, saveId: string): Promise<void> {
    const index = await this.getSaveIndex(userId);
    const filtered = index.filter(id => id !== saveId);
    await this.storage.set(this.getIndexKey(userId), JSON.stringify(filtered));
  }

  private serialize(saveData: SaveData): string {
    const json = JSON.stringify(saveData);

    if (this.config.compress) {
      // Simple compression - in production use a proper compression library
      return btoa(json);
    }

    return json;
  }

  private deserialize(data: string): SaveData {
    let json = data;

    if (this.config.compress) {
      json = atob(data);
    }

    return JSON.parse(json) as SaveData;
  }

  private validateSaveData(data: SaveData): boolean {
    return !!(
      data &&
      data.id &&
      data.userId &&
      data.storyId &&
      data.gameState &&
      data.gameState.currentSceneId &&
      data.metadata
    );
  }

  private calculatePlayTime(gameState: GameState): number {
    // Estimate play time based on choice count
    // In a real implementation, track actual play time
    return gameState.choiceHistory.length * 30; // ~30 seconds per choice
  }
}

/**
 * Create a save manager with in-memory storage
 */
export function createInMemorySaveManager(config?: SaveManagerConfig): SaveManager {
  return new SaveManager(new InMemoryStorage(), config);
}

/**
 * Create a save manager with localStorage (browser)
 */
export function createLocalStorageSaveManager(config?: SaveManagerConfig): SaveManager {
  return new SaveManager(new LocalStorageAdapter(), config);
}
