import {
  ArraySubject, BingComponent, ColorUtils, FSComponent, HorizonLayer, HorizonLayerProps, HorizonProjection, HorizonSyntheticVisionCameraParamMode, HorizonSyntheticVisionLayer,
  Subject, Subscribable, Subscription, Vec2Math, Vec2Subject, VNode,
} from '@microsoft/msfs-sdk';

/** Props for an IfdSvs */
export interface IfdSvsProps extends HorizonLayerProps {
  /** Whether synthetic vision is enabled. */
  isEnabled: Subscribable<boolean>;
}

const SKY_COLOR = '#2269CC';
const EARTH_COLORS: number[] = BingComponent.createEarthColorsArray(
  '#000084',
  [
    { elev: -1400, color: '#9b9f92' },
    { elev:  1500, color: '#627352' },
    { elev:  3000, color: '#8e8c69' },
    { elev:  4000, color: '#a5996b' },
    { elev:  4500, color: '#746246' },
    { elev: 10000, color: '#8c7252' },
    { elev: 20000, color: '#483a1d' },
    { elev: 30000, color: '#000000' },
  ],
  -1500,
  30000,
  56
).map(color => {
  const hsl = ColorUtils.hexToHsl(color, new Float64Array(3), true);
  hsl[2] *= 0.8;

  return ColorUtils.hslToHex(hsl, true);
});

/** An IfdSvs */
export class IfdSvs extends HorizonLayer<IfdSvsProps> {
  private readonly synVisRef = FSComponent.createRef<HorizonSyntheticVisionLayer>();

  private isEnabledSub?: Subscription;

  /** @inheritDoc */
  protected onVisibilityChanged(isVisible: boolean): void {
    this.synVisRef.instance.setVisible(isVisible);
  }

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();
    this.isEnabledSub = this.props.isEnabled.sub(this.setVisible.bind(this), true);
    this.synVisRef.instance.onAttached();
  }

  /** @inheritDoc */
  public onProjectionChanged(projection: HorizonProjection, changeFlags: number): void {
    this.synVisRef.instance.onProjectionChanged(projection, changeFlags);
  }

  /** @inheritDoc */
  public onWake(): void {
    this.synVisRef.instance.onWake();
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.synVisRef.instance.onSleep();
  }

  /** @inheritDoc */
  public onUpdated(): void {
    this.synVisRef.instance.onUpdated();
  }

  /** @inheritDoc */
  public onDetached(): void {
    super.onDetached();
    this.destroy();
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="ifd-svs">
        <HorizonSyntheticVisionLayer
          ref={this.synVisRef}
          projection={this.props.projection}
          bingId="IFD-SVS"
          earthColors={ArraySubject.create(EARTH_COLORS)}
          earthColorsElevationRange={Vec2Subject.create(Vec2Math.create(-1500, 30000))}
          skyColor={Subject.create(BingComponent.hexaToRGBColor(SKY_COLOR))}
          cameraRotationMode={HorizonSyntheticVisionCameraParamMode.Auto}
        />
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.synVisRef.getOrDefault()?.destroy();
    this.isEnabledSub?.destroy();
    super.destroy();
  }
}
