import { DisplayComponent, FSComponent, NodeReference, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { LskButtonState } from './LskState';

import './LineSelectKeyButton.css';

/** The type of line select key button. */
export enum LineSelectKeyButtonType {
  /** Only a label, single color, fires onClick on mouseup */
  Action = 'action',
  /** Label and value display, different colors, fires onClick on mouseup */
  State = 'state'
}

/** Props for the LineSelectKeyButton component. */
export interface LineSelectKeyButtonProps {
  /** The state of the line select key button. */
  readonly lskState: LskButtonState;
  /** Whether the button is selected. */
  readonly isSelected: Subscribable<boolean>;
}

/**
 * LineSelectKeyButton component for the Working Title IFD.
 * Displays a single line select key button.
 */
export class LineSelectKeyButton extends DisplayComponent<LineSelectKeyButtonProps> {
  // Refs
  private readonly buttonRef = FSComponent.createRef<HTMLDivElement>();
  private readonly labelDivRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(): void {
    const buttonElement = this.buttonRef.instance;

    // Setup event listeners for mousedown/mouseup behavior
    buttonElement.addEventListener('mouseup', this.onMouseUp);

    this.props.lskState.label.sub(label => this.updateContent(this.labelDivRef, label), true);
    this.props.lskState.value.sub(value => this.updateContent(this.valueDivRef, value), true);
  }

  /**
   * Updates the content of a given ref.
   * @param ref The ref to update.
   * @param content The new content, can be a string or a VNode.
   */
  private updateContent(ref: NodeReference<HTMLDivElement>, content: string | (() => VNode) | undefined): void {
    ref.instance.innerHTML = '';

    if (typeof content === 'string') {
      ref.instance.textContent = content;
      ref.instance.style.whiteSpace = 'pre-wrap';
    } else if (typeof content === 'function') {
      FSComponent.render(content(), ref.instance);
      ref.instance.style.whiteSpace = 'normal';
    } else {
      ref.instance.textContent = '';
      ref.instance.style.whiteSpace = 'normal';
    }
  }

  // Add a ref for the value div
  private readonly valueDivRef = FSComponent.createRef<HTMLDivElement>();


  /** @inheritdoc */
  public destroy(): void {
    // Clean up event listeners
    const buttonElement = this.buttonRef.instance;
    buttonElement.removeEventListener('mouseup', this.onMouseUp);

    super.destroy();
  }

  /**
   * Mouseup handler for the button element.
   */
  private readonly onMouseUp = (): void => {
    // Fire the onClick handler on mouseup, not on mousedown
    if (this.props.lskState.onClick) {
      this.props.lskState.onClick.get()?.();
    }
  };

  /** @inheritdoc */
  render(): VNode {
    return (
      <div
        ref={this.buttonRef}
        class={{
          'lsk-button': true,
          'lsk-button-state': this.props.lskState.type.map(x => x === LineSelectKeyButtonType.State),
          'lsk-button-action': this.props.lskState.type.map(x => x === LineSelectKeyButtonType.Action),
          'lsk-button-hidden': this.props.lskState.isVisible.map(x => !x),
          'lsk-button-selected': this.props.isSelected,
        }}
      >
        <div ref={this.labelDivRef} class="lsk-button-label"></div>
        <div ref={this.valueDivRef} class="lsk-button-value"></div>
      </div>
    );
  }
}
