import { Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';

/**
 * Interface for a suggestion item
 */
export interface SuggestionItem {
  /** The display text for the suggestion */
  displayText: string;
  /** The value that will be used when selecting this suggestion */
  value: string;
  /** Optional distance from current position in nautical miles */
  distanceFromPosNM?: number;
}

/**
 * Interface for suggestion handler types
 */
export enum KeyboardInputType {
  Facility = 'facility',
  Frequency = 'frequency',
  FreeText = 'freeText',
  Altitude = 'altitude',
}

/**
 * Interface for a suggestion handler
 */
export interface SuggestionHandler {
  /**
   * The type of suggestions this handler provides
   */
  type: KeyboardInputType;

  /**
   * Gets suggestions based on the current input
   * @param input The current input value
   * @returns An array of suggestion items
   */
  getSuggestions(input: string): Promise<SuggestionItem[]>;
}

/**
 * Configuration options for the suggestion service
 */
export interface SuggestionServiceOptions {
  /** Maximum number of suggestions to display */
  maxSuggestions?: number;
}

/**
 * Service for providing input suggestions for the virtual keyboard
 */
export class SuggestionService {
  /** The current input text */
  private inputText = '';

  /** The current active type of suggestions */
  private readonly activeType = Subject.create<KeyboardInputType | null>(null);

  /** The current suggestions */
  private readonly suggestions = Subject.create<SuggestionItem[]>([]);

  /** Handlers registered with this service */
  private readonly handlers = new Map<KeyboardInputType, SuggestionHandler>();

  /** Maximum number of suggestions to return */
  private readonly maxSuggestions: number;

  /** Tracks whether suggestions are being processed */
  private isProcessing = false;

  /** Active subscriptions */
  private readonly subs: Subscription[] = [];

  /**
   * Creates a new suggestion service
   * @param options Configuration options
   */
  constructor(options: SuggestionServiceOptions = {}) {
    this.maxSuggestions = options.maxSuggestions ?? 5;

    // Clear suggestions when active type changes to null
    this.subs.push(this.activeType.sub((type) => {
      if (type === null) {
        this.suggestions.set([]);
      }
    }));
  }

  /**
   * Registers a suggestion handler with this service
   * @param handler The handler to register
   */
  public registerHandler(handler: SuggestionHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /**
   * Sets the active suggestion type
   * @param type The type to activate, or null to deactivate suggestions
   */
  public setActiveType(type: KeyboardInputType | null): void {
    this.activeType.set(type);
    // Update suggestions immediately if we have input and a valid type
    if (type !== null) {
      this.updateSuggestions(this.inputText).catch(console.error);
    }
  }

  /**
   * Gets the active suggestion type
   * @returns Subscribable for the active suggestion type
   */
  public getActiveType(): Subscribable<KeyboardInputType | null> {
    return this.activeType;
  }

  /**
   * Updates the current input text
   * @param text The current input text
   */
  public refreshSuggestions(text: string): void {
    this.inputText = text;
    this.updateSuggestions(text).catch(console.error);
  }

  /**
   * Gets the current suggestions
   * @returns Subscribable for the current suggestions
   */
  public getSuggestions(): Subscribable<SuggestionItem[]> {
    return this.suggestions;
  }

  /**
   * Updates suggestions based on the current input
   * @param text The current input text
   * @returns Promise that resolves when suggestions have been updated
   */
  private async updateSuggestions(text: string): Promise<void> {
    if (this.isProcessing || this.activeType.get() === null) {
      return;
    }

    this.isProcessing = true;
    try {
      const type = this.activeType.get()!;
      const handler = this.handlers.get(type);

      if (handler) {
        this.suggestions.set([]);
        const items = await handler.getSuggestions(text);
        const limitedItems = items.slice(0, this.maxSuggestions);
        this.suggestions.set(limitedItems);
      } else {
        this.suggestions.set([]);
      }
    } catch (e) {
      console.error('[SuggestionService] Error updating suggestions:', e);
      this.suggestions.set([]);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.subs.forEach(sub => sub.destroy());
    this.subs.length = 0;
  }
}
