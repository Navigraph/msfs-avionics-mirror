import { ConsumerSubject, FSComponent, LNavEvents, LNavUtils, MappedSubject, MathUtils, NumberFormatter, Subject, VNode } from '@microsoft/msfs-sdk';

import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/** Props for the TAE data block. */
export interface TrackAngleErrorDatablockProps extends BaseDatablockProps {
  /** the LNAV index to use. */
  lnavIndex: number;
}

/** Datablock for displaying the Track Angle Error */
export class TrackAngleErrorDatablock extends Datablock<TrackAngleErrorDatablockProps> {
  private readonly angleErrorFormatter = NumberFormatter.create({
    precision: 1,
    pad: 3,
    nanString: '---',
  });

  /*
    Both of these are true while the displays are magnetic, but the magvar is the same for both,
    so there is no difference for the track angle error calculation.
   */
  private readonly trackTrue =
    ConsumerSubject.create(this.props.bus.getSubscriber<GnssReceiverEvents>().on('gnss_track_true_deg').withPrecision(0.1), NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly dtkTrue = ConsumerSubject.create(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly isTracking = ConsumerSubject.create(null, false).withLifecycle(this.defaultLifecycle);

  private readonly angleErrorDisplay = Subject.create('---');

  private readonly arrowRef = FSComponent.createRef<SVGElement>();

  /**
   * Gets the datablock info for this TrackAngleErrorDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Track Angle Error',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<LNavEvents>();
    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.props.lnavIndex);

    this.dtkTrue.setConsumer(sub.on(`lnav_dtk${lnavSuffix}`).withPrecision(0.1));
    this.isTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));

    MappedSubject.create(
      ([currentTrack, desiredTrack, isTracking]) => {
        if (currentTrack === null || desiredTrack === null || !isTracking) {
          this.angleErrorDisplay.set(this.angleErrorFormatter(NaN));
          this.arrowRef.instance.classList.add('hidden');
          return;
        }
        this.arrowRef.instance.classList.remove('hidden');
        const angularDistanceClockwise = MathUtils.angularDistanceDeg(currentTrack, desiredTrack, 1);
        const angularDistanceCounterClockwise = MathUtils.angularDistanceDeg(currentTrack, desiredTrack, -1);
        this.angleErrorDisplay.set(this.angleErrorFormatter(Math.min(angularDistanceClockwise, angularDistanceCounterClockwise)));
        if (angularDistanceCounterClockwise < angularDistanceClockwise) {
          this.arrowRef.instance.style.transform = 'scaleX(-1)';
        } else {
          this.arrowRef.instance.style.transform = 'scaleX(1)';
        }
      },
      this.trackTrue,
      this.dtkTrue,
      this.isTracking,
    ).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-track-angle-error" ref={this.datablockRef}>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-space-after datablock-font-small datablock-text-mint" style="width: 39px;">TKE</div>
          <div class="datablock-font-large datablock-text-cyan">{this.angleErrorDisplay}°</div>
        </div>
        <div class="datablock-content-row" style="justify-content: center; align-items: center;">
          <svg viewBox="-1 -1 20 12" style="width: 24px; margin: 7px 0;" ref={this.arrowRef}>
            <path d="M 1 5 L 13 5" style="stroke: var(--wtdyne-color-light-cyan);" stroke-width="2" fill="none" />
            <path d="M 17 5 L 10 9 C 9 7 9 6 9 5 C 9 4 9 3 10 1 L 17 5" fill="var(--wtdyne-color-light-cyan)" stroke="none" />
          </svg>
        </div>
      </div>
    );
  }
}
