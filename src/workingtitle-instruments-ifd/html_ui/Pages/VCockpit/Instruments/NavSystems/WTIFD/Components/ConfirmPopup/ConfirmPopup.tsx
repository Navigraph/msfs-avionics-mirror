import { ComputedSubject, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { LineSelectKeyButtonType } from '../../LineSelectKeyButtons';
import { LskStateReadonly } from '../../LineSelectKeyButtons/LskState';
import { IfdViewService } from '../../ViewService';
import { IfdDialog, IfdDialogProps } from '../../ViewService/IfdDialog';
import { TouchButton } from '../TouchButton/TouchButton';

import './ConfirmPopup.css';

/** Props for the confirm popup. */
export interface ConfirmPopupProps extends IfdDialogProps {
  /** The view service to use. */
  viewService: IfdViewService;
}

/** Posible colours for the confirm text. */
export type ConfirmTextColor = 'white' | 'mint';

/**
 * A confirmation pop up.
 * DO NOT use this directly. Instead call it through IfdViewService.requestConfirmation.
 */
export class ConfirmPopup extends IfdDialog<ConfirmPopupProps> {
  private static readonly DEFAULT_MIN_HEIGHT = 'unset';
  private static readonly DEFAULT_MIN_WIDTH = 'unset';
  private static readonly DEFAULT_TEXT_COLOR: ConfirmTextColor = 'white';

  private readonly _isVisible = Subject.create(false);
  public readonly isVisible: Subscribable<boolean> = this._isVisible;
  private readonly message = Subject.create('');
  private readonly textColor = ComputedSubject.create('white', (v) => `var(--wtdyne-color-${v})`);
  private readonly minHeight = Subject.create(ConfirmPopup.DEFAULT_MIN_HEIGHT);
  private readonly minWidth = Subject.create(ConfirmPopup.DEFAULT_MIN_WIDTH);
  private readonly noWrap = Subject.create(false);

  private confirmResolve?: VoidFunction;
  private confirmReject?: VoidFunction;

  public readonly lskState: LskStateReadonly = {
    lsk2: {
      type: Subject.create(LineSelectKeyButtonType.State),
      label: Subject.create(undefined),
      value: Subject.create(undefined),
      isVisible: Subject.create(false),
      onClick: Subject.create(undefined),
      onKnobEvent: Subject.create(undefined),
    },
    lsk3: {
      type: Subject.create(LineSelectKeyButtonType.Action),
      label: Subject.create('Enter'),
      value: Subject.create(undefined),
      isVisible: Subject.create(true),
      onClick: Subject.create(this.onConfirm.bind(this)),
      onKnobEvent: Subject.create(undefined),
    },
    lsk4: {
      type: Subject.create(LineSelectKeyButtonType.Action),
      label: Subject.create('Cancel'),
      value: Subject.create(undefined),
      isVisible: Subject.create(true),
      onClick: Subject.create(this.onReject.bind(this)),
      onKnobEvent: Subject.create(undefined),
    },
    selectedButton: Subject.create(undefined),
    isVisible: Subject.create(true),
  };

  /**
   * Pops up the confirmation popup asking for user confirmation of something.
   * @param message The mssage to ask the user.
   * @param textColor The text colour to show.
   * @param minHeight The minmum height in pixels for the box.
   * @param minWidth The minmum width in pixels for the box.
   * @param noWrap Whether to disable word wrapping. Defaults to false.
   * @returns A promise that either resolves when the user confirms the action, or rejects if they cancel or another request is sent.
   */
  public askConfirmation(
    message: string,
    textColor: ConfirmTextColor = ConfirmPopup.DEFAULT_TEXT_COLOR,
    minHeight?: number,
    minWidth?: number,
    noWrap = false,
  ): Promise<void> {
    // if somebody else was already waiting, we should reject their promise
    if (this.confirmReject) {
      this.onReject();
    }

    this.message.set(message);
    this.textColor.set(textColor);
    this.minHeight.set(minHeight !== undefined ? `${minHeight}px` : ConfirmPopup.DEFAULT_MIN_HEIGHT);
    this.minWidth.set(minWidth !== undefined ? `${minWidth}px` : ConfirmPopup.DEFAULT_MIN_WIDTH);
    this.noWrap.set(noWrap);
    this._isVisible.set(true);

    return new Promise((resolve, reject) => {
      this.confirmResolve = resolve;
      this.confirmReject = reject;
    });
  }

  /** @inheritdoc */
  public close(): void {
    if (this._isVisible.get()) {
      this.onReject();
    }
  }

  /**
   * Confirm the popup.
   */
  public confirm(): void {
    this.onConfirm();
  }

  /**
   * Reject/cancel the popup.
   */
  public reject(): void {
    this.onReject();
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this._isVisible.get()) {
      switch (event) {
        case IfdInteractionEvent.ENTR:
          this.onConfirm();
          return true;
        case IfdInteractionEvent.CLR:
          this.onReject();
          return true;
        default:
          break;
      }
    }
    return false;
  }

  /** Handles positive confirmation. */
  private onConfirm(): void {
    this._isVisible.set(false);
    if (this.confirmResolve) {
      this.confirmResolve();
    }
    this.reset();
  }

  /** Handles negative confirmation/nack. */
  private onReject(): void {
    this._isVisible.set(false);
    if (this.confirmReject) {
      this.confirmReject();
    }
    this.reset();
  }

  /** Resets the popup state. */
  private reset(): void {
    this.confirmResolve = undefined;
    this.confirmReject = undefined;
    this.minWidth.set(ConfirmPopup.DEFAULT_MIN_WIDTH);
    this.minHeight.set(ConfirmPopup.DEFAULT_MIN_HEIGHT);
    this.textColor.set(ConfirmPopup.DEFAULT_TEXT_COLOR);
    this.noWrap.set(false);
    this.message.set('');
  }

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.viewService.registerDialog(this);
  }

  /** @inheritdoc */
  public override render(): VNode {
    /* The transform (+CSS) provides the transition effect for the button to slide onto the screen. */
    return (
      <div
        class={{
          'confirm-popup': true,
          'no-wrap': this.noWrap,
        }}
        style={{
          'min-height': this.minHeight,
          'min-width': this.minWidth,
          'color': this.textColor,
          'transform': this._isVisible.map((show) => show ? 'translate3d(0px, 0px, 0px)' : 'translate3d(180px, 0px, 0px)').withLifecycle(this.defaultLifecycle),
        }}
      >
        <TouchButton
          isVisible={this._isVisible}
          onPressed={this.onConfirm.bind(this)}
        >
          <div class="confirm-button-text">{this.message}</div>
        </TouchButton>
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.onReject();
    super.destroy();
  }
}
