import { DisplayComponent, FSComponent, MappedSubject, MutableSubscribable, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { SetupRowBase, SetupRowBaseProps } from './SetupRowBase';

/**
 * Props for the StateRow component.
 */
export interface StateRowProps extends SetupRowBaseProps {
  /** The possible states */
  readonly states: string[];
  /** The index of the current state. If it is mutable, it will be set when the setting is changed in the UI. */
  readonly currentStateIndex: Subscribable<number> | MutableSubscribable<number>;
  /** Callback when the new state is confirmed. */
  readonly onStateConfirmed?: (stateIndex: number, stateName: string) => void;
  /** Callback when the CLR key is pressed while the field is selected but not in editing mode. */
  readonly onStateCleared?: () => void;
}

/**
 * Props for the StateRowContent component.
 */
export interface StateRowContentProps {
  /** The index of the current state */
  readonly currentStateIndex: Subscribable<number>;
  /** The possible states */
  readonly states: string[];
  /** Whether the row is focused but not in edit mode */
  readonly isFocusedNotEditing: Subscribable<boolean>;
  /** Whether the row is in edit mode */
  readonly isEditing: Subscribable<boolean>;
}

/**
 * Component to render the content of a state row.
 */
export class StateRowContent extends DisplayComponent<StateRowContentProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="settings-row-content">
        <div class={{
          'settings-state-row-value': true,
          'settings-state-row-focused': this.props.isFocusedNotEditing,
          'settings-state-row-editing': this.props.isEditing
        }}>
          {this.props.currentStateIndex.map(index => this.props.states[index])}
        </div>
      </div>
    );
  }
}

/**
 * A setup row for rotating through possible states.
 */
export class StateRow<T extends StateRowProps = StateRowProps> extends SetupRowBase<T> {
  private readonly states: string[] = this.props.states;

  protected readonly isRowStateSelected = Subject.create(true);
  protected readonly isRowStateEditing = Subject.create<boolean>(false);
  private readonly isFocusedNotEditing = MappedSubject.create(
    ([isSelected, isRowStateEditing, isRowStateSelected]) => isSelected && isRowStateSelected && !isRowStateEditing,
    this.isSelected,
    this.isRowStateEditing,
    this.isRowStateSelected,
  );

  private readonly pendingStateIndex = Subject.create(0);

  private readonly valuePipe = this.props.currentStateIndex.pipe(this.pendingStateIndex, true);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isSelected.sub((isSelected) => !isSelected && this.isRowStateEditing.set(false)).withLifecycle(this.defaultLifecycle);

    this.isRowStateEditing.sub((isEditing) => {
      if (isEditing) {
        this.valuePipe.pause();
      } else {
        this.valuePipe.resume(true);
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Rotates to the next state.
   * @param direction The direction to rotate
   */
  protected rotateState(direction: 1 | -1): void {
    const nextIndex = (this.pendingStateIndex.get() + direction) % this.states.length;
    this.updateState(nextIndex >= 0 ? nextIndex : this.states.length - 1);
  }

  /**
   * Updates the current state.
   * @param stateIndex The new state index.
   */
  private updateState(stateIndex: number): void {
    this.pendingStateIndex.set(stateIndex);
  }

  /** @inheritdoc*/
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.isRowStateEditing.get()) {
      switch (event) {
        case IfdInteractionEvent.RightKnobInnerDec:
          this.rotateState(-1);
          return true;
        case IfdInteractionEvent.RightKnobInnerInc:
          this.rotateState(1);
          return true;
      }
    }

    return super.onInteractionEvent(event);
  }

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click', bypassStateRow = false): void {
    if (this.props.isEnabled !== false && !bypassStateRow) {
      if (this.isSelected.get()) {
        if (this.isRowStateEditing.get() && event === 'click') {
          return this.rotateState(1);
        }
        return this.isRowStateEditing.set(!this.isRowStateEditing.get());
      }
    }

    return super.onFocus(event);
  }

  /** @inheritdoc */
  protected onEnter(): void {
    if (this.isRowStateEditing.get()) {
      const stateIndex = this.pendingStateIndex.get();

      if (SubscribableUtils.isMutableSubscribable(this.props.currentStateIndex)) {
        this.props.currentStateIndex.set(stateIndex);
      }

      if (this.props.onStateConfirmed) {
        this.props.onStateConfirmed(stateIndex, this.states[stateIndex]);
      }
    }
    this.isRowStateEditing.set(!this.isRowStateEditing.get());
  }

  /** @inheritdoc */
  protected onClear(): void {
    if (!this.isRowStateEditing.get()) {
      this.props.onStateCleared?.();
    }
  }

  /** @inheritdoc */
  protected renderContent(): VNode {
    return (
      <StateRowContent
        currentStateIndex={this.pendingStateIndex}
        states={this.states}
        isFocusedNotEditing={this.isFocusedNotEditing}
        isEditing={this.isRowStateEditing}
      />
    );
  }
}
