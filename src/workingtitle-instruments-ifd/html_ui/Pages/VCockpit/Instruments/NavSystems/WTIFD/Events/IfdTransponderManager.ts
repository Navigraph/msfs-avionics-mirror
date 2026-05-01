import {
  ConsumerSubject, ControlEvents, DebounceTimer, EventBus, MappedSubject, MathUtils, MutableSubscribable, Subject, Subscribable, XPDRMode, XPDRSimVarEvents
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IfdInteractions } from './IfdInteractionEvent';
import { IfdTuningControlsManager } from './IfdTuningControlsManager';
import { RadioTuningControlModes } from './types';

/**
 * The IfdTransponderManager, providing XPDR data for TransponderDataBlock
 */
export class IfdTransponderManager {
  private readonly xpdrSub = this.bus.getSubscriber<XPDRSimVarEvents>();
  private readonly controlSub = this.bus.getSubscriber<IfdInteractions>();
  private readonly _isBeingEdited = Subject.create<boolean>(false);
  public readonly isBeingEdited = this._isBeingEdited as Subscribable<boolean>;

  private readonly _xpdrCode = ConsumerSubject.create(this.xpdrSub.on(`xpdr_code_${this.transponderIndex}`), 0);
  public readonly xpdrCode = this._xpdrCode as Subscribable<number>;

  private readonly _xpdrMode = ConsumerSubject.create(this.xpdrSub.on(`xpdr_mode_${this.transponderIndex}`), XPDRMode.OFF);
  private readonly _xpdrModeToStringMap = this._xpdrMode.map((mode: XPDRMode) => {
    switch (mode) {
      case XPDRMode.ALT:
        return 'ALT';
      case XPDRMode.STBY:
        return 'SBY';
      case XPDRMode.GROUND:
        return 'GND';
      case XPDRMode.ON:
        return 'ON';
      case XPDRMode.OFF:
        return '';
      case XPDRMode.TEST:
      default:
        console.error('Unknown transponder mode: ', mode);
        return '';
    }
  });

  private readonly xpdrIdent = ConsumerSubject.create(this.xpdrSub.on(`xpdr_ident_${this.transponderIndex}`), false);
  public readonly isIdentActive: Subscribable<boolean> = MappedSubject.create(
    ([xpdrMode, xpdrIdent]) => xpdrIdent && xpdrMode >= XPDRMode.ON,
    this._xpdrMode,
    this.xpdrIdent,
  );

  private readonly _isXpdrActiveReply = this._xpdrMode.map((mode: XPDRMode) => [XPDRMode.ALT, XPDRMode.ON].includes(mode));
  // New transponder code value will only be applied after 3 seconds
  // of no further interactions that change the code value
  private readonly _xpdrSetTimer = new DebounceTimer();

  public readonly xpdrModeDisplay = this._xpdrModeToStringMap as Subscribable<string>;
  public readonly isXpdrActiveReply = this._isXpdrActiveReply as Subscribable<boolean>;

  private readonly editEffectTimer = new DebounceTimer();

  /**
   * Constructor
   * @param bus An instance of the EventBus.
   * @param activeTuningControl The currently selected tuning control (NAV / COM or XPDR)
   * @param transponderIndex The transponder index. If 0, no transponder will be managed.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly activeTuningControl: MutableSubscribable<RadioTuningControlModes>,
    public readonly transponderIndex: number,
  ) {
    if (this.transponderIndex !== 0) {
      this.handleKnobEvents();
    }
  }

  /** Handles IfdInteractionEvents */
  private handleKnobEvents(): void {
    this.controlSub.on('ifd_interaction_event').handle((event: IfdInteractionEvent) => {
      if (this.activeTuningControl.get() !== RadioTuningControlModes.XPDR) {
        return;
      }
      if (this._xpdrCode.get() === 0) {
        return;
      }

      switch (event) {
        case IfdInteractionEvent.LeftKnobOuterInc:
          this.setXpdrCode(this._changeXpdrCode('COARSE', 1, this._xpdrCode.get()));
          break;
        case IfdInteractionEvent.LeftKnobOuterDec:
          this.setXpdrCode(this._changeXpdrCode('COARSE', -1, this._xpdrCode.get()));
          break;
        case IfdInteractionEvent.LeftKnobInnerInc:
          this.setXpdrCode(this._changeXpdrCode('FINE', 1, this._xpdrCode.get()));
          break;
        case IfdInteractionEvent.LeftKnobInnerDec:
          this.setXpdrCode(this._changeXpdrCode('FINE', -1, this._xpdrCode.get()));
          break;
        default:
          break;
      }
    });
  }

  /**
   * Increments or decrements the transponder code.
   * @param increment Whether to make coarse or fine adjustments
   * @param sign Whether to increment or decrement the code.
   * @param code The current transponder code value.
   * @returns a number
   */
  private _changeXpdrCode(
    increment: 'COARSE' | 'FINE',
    sign: 1 | -1,
    code: number,
  ): number {
    const codeString = code.toString();
    return parseInt(
      MathUtils.clamp(
        parseInt(codeString, 8) + Math.sign(sign) * (increment === 'COARSE' ? 64 : 1),
        0,
        4095, // 7777 octal
      ).toString(8)
    );
  }

  /**
   * Increments or decrements the transponder code in the sim
   * TODO connect the XPDR virtual keyboard to this method
   * @param code The current transponder code value.
   */
  public setXpdrCode(
    code: number,
  ): void {
    if (this.transponderIndex === 0) {
      return;
    }
    this.bus.getPublisher<ControlEvents>().pub(`publish_xpdr_code_${this.transponderIndex}`, code, true);
    this._isBeingEdited.set(true);
    this.editEffectTimer.schedule(() => this._isBeingEdited.set(false), IfdTuningControlsManager.EDIT_EFFECT_TIME);
  }

  /**
   * Set the transponder mode in the sim.
   * TODO connect the XPDR virtual keyboard to this method
   * @param mode The transponder mode.
   */
  public setXpdrMode(mode: XPDRMode): void {
    if (this.transponderIndex === 0) {
      return;
    }
    SimVar.SetSimVarValue(`TRANSPONDER STATE:${this.transponderIndex}`, 'number', mode);
  }
}
