import {
  BitFlags, ConsumerSubject, EventBus, ExpSmoother, FSComponent, HorizonLayer, HorizonLayerProps, HorizonProjection, HorizonProjectionChangeType, MappedSubject,
  MathUtils, ObjectSubject, Subscription, UnitType, Vec2Math, Vec2Subject, VNode
} from '@microsoft/msfs-sdk';

import { ArsSystemEvents } from '../../../Systems/ArsSystem';
import { ExternalHeadingSystemEvents } from '../../../Systems/ExternalHeadingSystem';
import { GnssReceiverEvents } from '../../../Systems/Gnss/GnssTypes';

import './IfdTotalVelocityVector.css';

/** Bounding box dimensions. */
interface BoundingBox {
  /** The top position. */
  top: number;
  /** The bottom position. */
  bottom: number;
  /** The left position. */
  left: number;
  /** The right position. */
  right: number;
}

// Values determined by calling getBoundingClientRect on each element in the debugger
// NOTE: IF THE POSITION OF THESE ELEMENTS CHANGES, THEY NEED TO BE MANUALLY UPDATED HERE
const collisionBoundaries: BoundingBox[] = [
  // Vertical deviation indicator
  {
    top: 134 - 24,
    bottom: 346 + 12,
    left: 426 - 24,
    right: 456 + 24,
  },
  // Lateral deviation indicator
  {
    top: 363 - 24,
    bottom: 393 + 12,
    left: 213 - 24,
    right: 425 + 24,
  },
  // Heading digital readout
  {
    top: 392 - 24,
    bottom: 425 + 12,
    left: 278 - 24,
    right: 361 + 24,
  }
];

/**
 * Component props for {@link IfdTotalVelocityVector}
 */
export interface IfdTotalVelocityVectorProps extends HorizonLayerProps {
  /** The event bus to use. */
  bus: EventBus;

  /** The minimum ground speed, in knots, required for the flight path marker to be displayed. Defaults to 30 knots. */
  minGroundSpeed?: number;

  /** The lookahead time of the flight path marker, in seconds. Defaults to 60 seconds. */
  lookahead?: number;

  /** The smoothing time constant for ground track and ground speed, in milliseconds. Defaults to `500 / ln(2)`. */
  smoothingTimeConstant?: number;
}

/**
 * The IFD Total Velocity Vector (TVV) aka. flight path marker
 * Displays an icon depicting the estimated position of the
 * airplane projected forward in time given the airplane's current horizontal and vertical speed and track.
 * Grows in size when visually behind deviation indicators or heading digital readout bubbles.
 */
export class IfdTotalVelocityVector extends HorizonLayer<IfdTotalVelocityVectorProps> {
  private static readonly SCALE_FACTOR = 1.3; // scale factor of the SVG when the indicator needs to grow in size.
  private static readonly DEFAULT_MIN_GS = 30; // knots
  private static readonly DEFAULT_LOOKAHEAD = 60; // seconds
  private static readonly DEFAULT_SMOOTHING_TIME_CONSTANT = 500 / Math.LN2; // milliseconds

  private static readonly vec2Cache = [Vec2Math.create()];

  private readonly style = ObjectSubject.create({
    position: 'absolute',
    display: '',
    transform: 'translate(-50%, -50%) translate3d(0, 0, 0) scale(1)'
  });

  private readonly minGs = this.props.minGroundSpeed ?? IfdTotalVelocityVector.DEFAULT_MIN_GS;
  private readonly lookahead = this.props.lookahead ?? IfdTotalVelocityVector.DEFAULT_LOOKAHEAD;
  private readonly smoothingTimeConstant = this.props.smoothingTimeConstant ?? IfdTotalVelocityVector.DEFAULT_SMOOTHING_TIME_CONSTANT;

  private readonly gs = ConsumerSubject.create<number | null>(null, null);
  private readonly track = ConsumerSubject.create<number | null>(null, null);
  private readonly vs = ConsumerSubject.create<number | null>(null, null);

  private readonly isHeadingDataValid = ConsumerSubject.create(null, false);
  private readonly isAttitudeDataValid = ConsumerSubject.create(null, false);

  private readonly show = MappedSubject.create(
    ([gs, track, isHeadingDataValid, isAttitudeDataValid]): boolean => {
      return isHeadingDataValid && isAttitudeDataValid && gs !== null && (gs >= this.minGs) && track !== null;
    },
    this.gs,
    this.track,
    this.isHeadingDataValid,
    this.isAttitudeDataValid,
  );

  private readonly groundTrackSmoother = new ExpSmoother(this.smoothingTimeConstant);
  private readonly gsSmoother = new ExpSmoother(this.smoothingTimeConstant);

  private readonly projectedPosition = Vec2Subject.createFromVector(Vec2Math.create());

  private needUpdate = false;

  private subs: Subscription[] = [];

  /** @inheritdoc */
  protected onVisibilityChanged(isVisible: boolean): void {
    if (isVisible) {
      this.style.set('display', '');
    } else {
      this.style.set('display', 'none');
      this.groundTrackSmoother.reset();
      this.gsSmoother.reset();
    }
  }

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();

    const sub = this.props.bus.getSubscriber<ArsSystemEvents & ExternalHeadingSystemEvents & GnssReceiverEvents>();

    this.isAttitudeDataValid.setConsumer(sub.on('ars_attitude_data_valid'));
    this.isHeadingDataValid.setConsumer(sub.on('ext_hdg_heading_data_valid'));
    this.gs.setConsumer(sub.on('gnss_ground_speed_kts'));
    this.track.setConsumer(sub.on('gnss_track_true_deg'));
    this.vs.setConsumer(sub.on('gnss_vertical_speed_fpm'));

    this.subs.push(
      this.show,
      this.show.sub(show => this.setVisible(show), true),
      this.gs.sub(() => this.needUpdate = true),
      this.track.sub(() => this.needUpdate = true),
      this.vs.sub(() => this.needUpdate = true),
      this.projectedPosition.sub(([tvvX, tvvY]) => {
        const grow: boolean = collisionBoundaries.some((staticRect: BoundingBox): boolean => (
          tvvX < staticRect.right && staticRect.left < tvvX && tvvY < staticRect.bottom && staticRect.top < tvvY));

        this.style.set(
          'transform',
          `translate(-50%, -50%) translate3d(${tvvX}px, ${tvvY}px, 0) ${grow ? `scale(${IfdTotalVelocityVector.SCALE_FACTOR})` : ''}`,
        );
      })
    );

    this.needUpdate = true;
  }

  /** @inheritdoc */
  public onProjectionChanged(_projection: HorizonProjection, changeFlags: number): void {
    if (BitFlags.isAny(
      changeFlags,
      HorizonProjectionChangeType.Fov
      | HorizonProjectionChangeType.ScaleFactor
      | HorizonProjectionChangeType.Offset
      | HorizonProjectionChangeType.ProjectedOffset
      | HorizonProjectionChangeType.Heading
      | HorizonProjectionChangeType.Pitch
      | HorizonProjectionChangeType.Roll
    )) {
      this.needUpdate = true;
    }
  }

  /** @inheritdoc */
  public onUpdated(_time: number, elapsed: number): void {
    if (!this.needUpdate || !this.isVisible()) {
      return;
    }

    const gs = this.gs.get();
    const vs = this.vs.get();

    const smoothedGs = gs !== null ? this.gsSmoother.next(gs, elapsed) : this.gsSmoother.reset();
    const smoothedTrack = this.smoothGroundTrack(this.track.get(), elapsed);
    const distance = smoothedGs !== null ? UnitType.KNOT.convertTo(smoothedGs, UnitType.MPS) * this.lookahead : 0;
    const height = vs !== null ? UnitType.FPM.convertTo(vs, UnitType.MPS) * this.lookahead : 0;
    const projected = this.props.projection.projectRelativeSpherical(
      smoothedTrack ?? 0, distance, height, IfdTotalVelocityVector.vec2Cache[0]
    );
    this.projectedPosition.set(MathUtils.round(projected[0], 0.1), MathUtils.round(projected[1], 0.1));

    this.needUpdate = false;
  }

  /** @inheritdoc */
  public onSleep(): void {
    super.onSleep();
    this.needUpdate = false;
  }

  /** @inheritdoc */
  public onWake(): void {
    super.onWake();
    this.needUpdate = true;
  }

  /**
   * Smooths a ground track value.
   * @param track A ground track value.
   * @param dt The elapsed time, in milliseconds, since the last smoothed value was calculated.
   * @returns A smoothed ground track value.
   */
  private smoothGroundTrack(track: number | null, dt: number): number | null {
    if (track === null) {
      this.groundTrackSmoother.reset();
      return null;
    }

    const last = this.groundTrackSmoother.last();

    if (last !== null && !isNaN(last)) {
      // need to handle wraparounds
      let delta = track - last;
      if (delta > 180) {
        delta = delta - 360;
      } else if (delta < -180) {
        delta = delta + 360;
      }
      track = last + delta;
    }

    const next = last !== null && isNaN(last) ? this.groundTrackSmoother.reset(track) : this.groundTrackSmoother.next(track, dt);
    const normalized = (next + 360) % 360; // enforce range 0-359
    return this.groundTrackSmoother.reset(normalized);
  }

  /** @inheritdoc */
  public onDetached(): void {
    super.onDetached();
    this.destroy();
  }

  /**
   * Renders the component.
   * @returns The component VNode.
   */
  public render(): VNode {
    return (
      <div class="wt-ifd-total-velocity-vector-container">
        <svg
          class="total-velocity-vector"
          style={this.style}
          viewBox='-27 -27 54 54'
        >
          <path
            d='M -10.8 0 a 10.8 10.8 0 1 0 21.6 0 m 13.2 0 l -13.2 0 a 10.8 10.8 0 1 0 -21.6 0 l -13 0 m 23.8 -10.8 l 0 -13'
            stroke='var(--flight-path-marker-outline-stroke)'
            stroke-width='var(--flight-path-marker-outline-stroke-width)'
            fill='none'
          />
          <path
            d='M -10.8 0 a 10.8 10.8 0 1 0 21.6 0 m 12 0 l -12 0 a 10.8 10.8 0 1 0 -21.6 0 l -12 0 m 22.8 -10.8 l 0 -12'
            stroke='var(--flight-path-marker-stroke)'
            stroke-width='var(--flight-path-marker-stroke-width)'
            fill='none'
          />
        </svg>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    this.subs.forEach((sub) => sub.destroy());
  }
}
