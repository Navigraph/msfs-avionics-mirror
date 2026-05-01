import { EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../../../Components/Tabs';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdOptions } from '../../../IfdOptions';
import { TimerManager } from '../../../Systems/Timer/TimerManager';
import { IfdAuxTimers } from './AuxTimers/IfdAuxTimers';

import './UtilTab.css';

/** The properties for the {@link UtilTab} component. */
interface UtilTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The timer manager to use. */
  readonly timerManager: TimerManager;
  /** The IfdInstrumentConfig */
  readonly ifdOptions: IfdOptions;
}

/** The UtilTab component. */
export class UtilTab extends TabContent<UtilTabProps> {
  private readonly timersRef = FSComponent.createRef<IfdAuxTimers>();

  public override readonly title: string = 'UTIL';

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    return this.timersRef.getOrDefault()?.onInteractionEvent(event) ?? false;
  }

  /** @inheritdoc */
  public render(): VNode {
    // TODO need a tab container so we can have calculators and checklists
    return (
      <div class="ifd-aux-util-tab">
        <IfdAuxTimers
          ref={this.timersRef}
          bus={this.bus}
          ifdOptions={this.props.ifdOptions}
          timerManager={this.props.timerManager}
          knobState={this._knobState}
        />
      </div>
    );
  }
}
