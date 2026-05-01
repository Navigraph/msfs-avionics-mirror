import { ComponentProps, EventBus, LifecycleComponent, Subject } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../Events/IfdInteractionEvent';
import { LskStateReadonly } from '../LineSelectKeyButtons/LskState';
import { LskUtils } from '../LineSelectKeyButtons/LskUtils';
import { IfdInteractionEventHandler, RightKnobStateReadonly, RightKnobUtils } from '../RightKnob';
import { IfdViewService } from './IfdViewService';

/**
 * Props for IFD views.
 */
export interface IfdViewProps extends ComponentProps {
  /** The bus context to use with this component. */
  bus: EventBus;
  /** The IFD view service. */
  viewService: IfdViewService;
}

/**
 * Base class for all IFD views.
 */
export abstract class IfdView<T extends IfdViewProps = IfdViewProps>
  extends LifecycleComponent<T>
  implements IfdInteractionEventHandler {

  /** An instance of the event bus. */
  protected readonly bus = this.props.bus;
  /** The IFD view service. */
  protected readonly viewService = this.props.viewService;

  protected readonly _activeComponent = Subject.create<IfdInteractionEventHandler | null>(null);

  protected readonly _knobState = RightKnobUtils.createState();
  /** The knob state requested by this view. */
  public readonly knobState = this._knobState as RightKnobStateReadonly;

  protected readonly _lskState = LskUtils.createState();
  /** The LSK state requested by this view. */
  public readonly lskState = this._lskState as LskStateReadonly;

  /** Called when there is an interaction event when this is the active view.
   * @param event The event.
   * @returns Whether the event was handled or not.
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return !!this._activeComponent.get()?.onInteractionEvent(event);
  }
}
