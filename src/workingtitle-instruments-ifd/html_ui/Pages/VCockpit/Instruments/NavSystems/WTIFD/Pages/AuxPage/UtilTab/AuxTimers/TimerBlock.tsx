import { ComponentProps, DateTimeFormatter, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdListItemComponent } from '../../../../Components/List/IfdListItemComponent';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { TimerListItemData } from './TimerListItem';

import './TimerBlock.css';

/**
 * Props for {@link TimerBlock} component.
 */
export interface TimerBlockProps extends ComponentProps {
  /** The data for this timer. */
  readonly data: TimerListItemData;

  /** A method to focus/select this block. */
  readonly focus: () => void;

  /** A method that opens the keyboard for entry into this block. */
  readonly openKeyboard: (
    smartPrefill: string,
    keyboardInputType: KeyboardInputType,
    onEnter: (value: string) => void,
    onClose: () => void,
    anchorEl?: HTMLElement
  ) => void;

  /** A method that closes the keyboard. */
  readonly closeKeyboard: () => void;
}

/**
 * The AUX Util page's timer block
 */
export abstract class TimerBlock<P extends TimerBlockProps> extends IfdListItemComponent<P> {
  protected static readonly timeFormatter = DateTimeFormatter.create('{HH}:{mm}:{ss}');

  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  protected abstract readonly minFieldIndex: number;
  protected abstract readonly maxFieldIndex: number;
  /**
   * The selected field index.
   * Should be set to a number less than the minFieldIndex or greater than maxFieldIndex when no field is selected.
   */
  protected readonly selectedFieldIndex = Subject.create(-1);

  protected readonly isWholeBlockSelected = MappedSubject.create(
    ([isSelected, selectedFieldIndex]) => isSelected && (selectedFieldIndex < this.minFieldIndex || selectedFieldIndex > this.maxFieldIndex),
    this.isSelected,
    this.selectedFieldIndex,
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Get the next selectable field index.
   * @param direction The direction to look.
   * @returns The next selectable field index in the given direction, or undefined if none.
   */
  protected getNextSelectableField(direction: 1 | -1): number | undefined {
    const selectedFieldIndex = this.selectedFieldIndex.get();
    if (direction > 0 && selectedFieldIndex < this.maxFieldIndex) {
      return selectedFieldIndex + 1;
    }
    if (direction < 0 && selectedFieldIndex > this.minFieldIndex) {
      return selectedFieldIndex - 1;
    }

    return undefined;
  }

  protected abstract onFieldAction(fieldIndex: number, action: IfdInteractionEvent.ENTR | IfdInteractionEvent.RightKnobPush | IfdInteractionEvent.CLR): boolean;

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobInnerDec:
        {
          const nextFieldIndex = this.getNextSelectableField(-1);
          if (nextFieldIndex !== undefined) {
            this.selectedFieldIndex.set(nextFieldIndex);
            return true;
          } else {
            this.selectedFieldIndex.set(this.minFieldIndex - 1);
          }
        }
        break;
      case IfdInteractionEvent.RightKnobInnerInc:
        {
          const nextFieldIndex = this.getNextSelectableField(1);
          if (nextFieldIndex !== undefined) {
            this.selectedFieldIndex.set(nextFieldIndex);
            return true;
          } else {
            this.selectedFieldIndex.set(this.maxFieldIndex + 1);
          }
        }
        break;
      case IfdInteractionEvent.CLR:
      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        {
          const selectedFieldIndex = this.selectedFieldIndex.get();
          if (selectedFieldIndex >= this.minFieldIndex && selectedFieldIndex <= this.maxFieldIndex) {
            this.onFieldAction(selectedFieldIndex, event);
          }
        }
        break;
    }

    return false;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.ref.instance.addEventListener('mousedown', this.focus);

    // de-select field on block de-select
    this.isSelected.sub((isSelected) => {
      const selectedFieldIndex = this.selectedFieldIndex.get();
      if (!isSelected && selectedFieldIndex >= this.minFieldIndex && selectedFieldIndex <= this.maxFieldIndex) {
        this.selectedFieldIndex.set(this.minFieldIndex - 1);
      }
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        ref={this.ref}
        class={{
          'timer-block': true,
          'selected': this.isWholeBlockSelected,
        }}
      >
        <div class="timer-name">{this.renderName()}</div>
        <div class="timer-type">{this.renderTypeButtons()}</div>
        <div class="timer-state">{this.renderState()}</div>

      </div>
    );
  }

  /**
   * Renders the timer name in the first column.
   * @returns The name node.
   */
  protected renderName(): VNode {
    return <>{this.props.data.label}</>;
  }

  /** Renders the timer type buttons in the middle column. */
  protected abstract renderTypeButtons(): VNode;

  /** Renders the timer state in the right column. */
  protected abstract renderState(): VNode;

  /** This method should de-select any selected field (allowing the whole block to be selected). */
  protected deselectFields(): void {
    this.selectedFieldIndex.set(this.minFieldIndex - 1);
  }

  /**
   * Focus this list item.
   */
  protected focus = (): void => {
    this.deselectFields();
    if (!this.isSelected.get()) {
      this.props.focus();
    }
  };

  /** @inheritdoc */
  public override destroy(): void {
    this.ref.getOrDefault()?.removeEventListener('mousedown', this.focus);
    super.destroy();
  }
}
