import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, VNode } from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';
import { IfdDataProvider } from '../../../Utilities/IfdDataProvider';
import { IfdAltitudeDigitScroller } from './IfdAltitudeDigitScroller';
import { IfdAltitudeTape } from './IfdAltitudeTape';
import { IfdAltitudeTrendVector } from './IfdAltitudeTrendVector';

import './IfdAltitudeDisplay.css';

/** Props for {@link IfdAltitudeDisplay} */
interface IfdAltitudeDisplayProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
  /** The IfdDataProvider. */
  dataProvider: IfdDataProvider;
}

/**
 * Dumb component.
 * The IfdAltitudeDisplay, contains altitude tape and a digit scroller.
 */
export class IfdAltitudeDisplay extends LifecycleComponent<IfdAltitudeDisplayProps> {
  private readonly barodAltitude = ConsumerSubject.create(null, 0);
  private readonly baroVerticalSpeed = ConsumerSubject.create(null, 0);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents>();
    this.barodAltitude.setConsumer(sub.on('ext_adc_indicated_alt'));
    this.baroVerticalSpeed.setConsumer(sub.on('ext_adc_vertical_speed'));
  }
  /** @inheritDoc */
  public render(): VNode {
    const altTapeWidth = 140;

    return (
      <div class="wt-ifd-altitude-container">
        <div class="wt-ifd-altitude-inner-container">
          <IfdAltitudeTrendVector
            baroVerticalSpeed={this.baroVerticalSpeed}
            bus={this.props.bus}
            className={'wt-ifd-altitude-trend-vector-container'}
            svgUnitPerUnit={300 / 15000}
          />
          <IfdAltitudeTape
            currentValue={this.barodAltitude}
            displayUnit={'Ft'}
            align={'left'}
            width={altTapeWidth}
            height={320}
            minValue={-1000}
            maxValue={99999}
            minorStep={100}
            majorStep={500}
            majorTickLength={30}
            minorTickLength={20}
            majorHighlightStep={1000}
            visibleRange={1500}
            simTime={this.props.dataProvider.events.clock.simTime}
            classNameArray={['altitude-tape']}
            nearestMultiplePrecision={100}
            verticalOffsetPx={-164}
          />
          <IfdAltitudeDigitScroller
            value={this.barodAltitude}
            width={altTapeWidth - 3}
            minValue={-1000}
            maxValue={99999}
          />
        </div>
      </div>
    );
  }
}
