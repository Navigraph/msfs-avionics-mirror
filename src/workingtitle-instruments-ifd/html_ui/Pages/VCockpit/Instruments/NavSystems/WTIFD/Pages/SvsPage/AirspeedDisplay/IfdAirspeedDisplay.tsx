import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, VNode } from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';
import { IfdDataProvider } from '../../../Utilities/IfdDataProvider';
import { IfdAirspeedDigitScroller } from './IfdAirspeedDigitScroller';
import { IfdAirspeedTape } from './IfdAirspeedTape';
import { IfdAirspeedTrendVector } from './IfdAirspeedTrendVector';

import './IfdAirspeedDisplay.css';

/** Props for {@link IfdAirspeedDisplay} */
interface IfdAirspeedDisplayProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
  /** The IfdDataProvider. */
  dataProvider: IfdDataProvider;
}

/**
 * Dumb component.
 * The IfdAirspeedDisplay, contains airspeed tape and a digit scroller.
 */
export class IfdAirspeedDisplay extends LifecycleComponent<IfdAirspeedDisplayProps> {
  private readonly ias = ConsumerSubject.create(null, 0);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents>();
    this.ias.setConsumer(sub.on('ext_adc_ias'));
  }

  /** @inheritDoc */
  public render(): VNode {
    const tapeWidth = 125;

    return (
      <div class="wt-ifd-airspeed-container">
        <div class="wt-ifd-airspeed-inner-container">
          <IfdAirspeedTrendVector
            bus={this.props.bus}
            className={'wt-ifd-ias-trend-vector-container'}
            ias={this.ias}
            svgUnitPerUnit={300 / 40}
          />
          <IfdAirspeedTape
            currentValue={this.ias}
            displayUnit={'KT'}
            align={'right'}
            width={tapeWidth}
            height={320}
            minValue={50}
            maxValue={999}
            minorStep={5}
            majorStep={10}
            majorTickLength={30}
            minorTickLength={20}
            visibleRange={40}
            simTime={this.props.dataProvider.events.clock.simTime}
            classNameArray={['airspeed-tape']}
            nearestMultiplePrecision={5}
            verticalOffsetPx={-133}
          />
          <IfdAirspeedDigitScroller
            value={this.ias}
            width={tapeWidth - 3}
            minValue={50}
            maxValue={999}
          />
        </div>
      </div>
    );
  }
}
