import {
  ArraySubject, ArrayUtils, BingComponent, ConsumerSubject, FSComponent, GNSSEvents, MappedSubject, MathUtils, Subject, SVGUtils, UnitType, VNode, WxrMode,
} from '@microsoft/msfs-sdk';
import { TabContent, TabContentProps } from '../../../Components/Tabs';
import { LineSelectKeyButtonType } from '../../../LineSelectKeyButtons';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';

import './RadarTab.css';

/** The operating mode of an IFD weather radar. */
export enum IfdWeatherRadarOperatingMode {
  Standby = 'Standby',
  Weather = 'Weather'
}

/** The scan mode of an IFD weather radar. */
export enum IfdWeatherRadarScanMode {
  Horizontal = 'Horizontal',
  Vertical = 'Vertical'
}

const HORIZONTAL_SCAN_ANGULAR_WIDTH = 100.8;
const VERTICAL_SCAN_ANGULAR_WIDTH = 60;
const RANGE_ARRAY_NM: number[] = [10, 20, 40, 60, 80, 120, 160, 240, 320];
const BING_WXR_GAIN = 6;
const BING_WXR_COLORS: (readonly [number, number])[] = [
  [BingComponent.hexaToRGBAColor('#00000000'), 23],
  [BingComponent.hexaToRGBAColor('#00ff00ff'), 25],
  [BingComponent.hexaToRGBAColor('#0cde00ff'), 27],
  [BingComponent.hexaToRGBAColor('#18bd00ff'), 29],
  [BingComponent.hexaToRGBAColor('#249b00ff'), 31],
  [BingComponent.hexaToRGBAColor('#307a00ff'), 33],
  [BingComponent.hexaToRGBAColor('#ffff00ff'), 35],
  [BingComponent.hexaToRGBAColor('#f6db00ff'), 37],
  [BingComponent.hexaToRGBAColor('#eeb600ff'), 39],
  [BingComponent.hexaToRGBAColor('#e59200ff'), 41],
  [BingComponent.hexaToRGBAColor('#ff0000ff'), 43],
  [BingComponent.hexaToRGBAColor('#dc0000ff'), 45],
  [BingComponent.hexaToRGBAColor('#b90000ff'), 47],
  [BingComponent.hexaToRGBAColor('#960000ff'), 49],
  [BingComponent.hexaToRGBAColor('#dd50ffff'), 51],
  [BingComponent.hexaToRGBAColor('#b228c3ff'), 54],
  [BingComponent.hexaToRGBAColor('#870087ff'), 54]
];

const PRECIP_RATE_TABLE = [
  [20, 0.25], [25, 1.27], [30, 2.54], [35, 5.59], [40, 11.43],
  [45, 23.37], [50, 48.26], [55, 101.6], [60, 203.2], [65, 406.4]
];

const HORIZONTAL_PLANE_PATH = 'M 0 -17 C -3 -17 -3 -13 -3 -11 V -7 C -3 -5 -5 -5 -6 -5 H -28 C -30 -5 -30 -4 -30 -3 C -25 3 -29 1 -3 4 C -2 4 -2 6 -2 7 V 12 C -2 14 -2 15 -4 15 C -9 15 -11 15 -11 17 C -11 19 -9 19 -4 19 H 0 H 4 C 9 19 11 19 11 17 S 9 15 4 15 C 2 15 2 14 2 12 V 7 C 2 6 2 4 3 4 C 29 1 25 3 30 -3 C 30 -4 30 -5 28 -5 H 6 C 5 -5 3 -5 3 -7 V -11 C 3 -13 3 -17 0 -17';
const VERTICAL_PLANE_PATH = 'm 5 -2 h -12 c -1 0 -1 0 -2 -1 c -2 -2 -4 -4 -5 -4 c 0 0 -2 0 -1 2 l 5 7 c 1 1 1 1 2 1 h 19 c 4 0 4 -2 4 -2 c 0 -1 -1 -1 -3 -1 c -5 0 -4 -2 -7 -2';

/** The props for the {@link RadarTab} component. */
interface MapTabProps extends TabContentProps {
  /** The instrument index. */
  instrumentIndex: number;
}

/** The Radar tab for the Map page. */
export class RadarTab extends TabContent<MapTabProps> {
  public readonly title: string = 'RADAR';
  private readonly bingRef = FSComponent.createRef<BingComponent>();
  private prevGroundSpeed = 0;

  private readonly scanMode = Subject.create(IfdWeatherRadarScanMode.Horizontal);
  private readonly operatingMode = Subject.create(IfdWeatherRadarOperatingMode.Standby);
  private readonly rangeIndex = Subject.create(2);
  private readonly range= this.rangeIndex.map(index => RANGE_ARRAY_NM[index]);
  private readonly position = ConsumerSubject.create(
    // Throttle map position update to once a second
    this.props.bus.getSubscriber<GNSSEvents>().on('gps-position').atFrequency(1),
    new LatLongAlt(0, 0, 0),
    (a, b) => a.lat === b.lat && a.long === b.long
  );
  private readonly wxrMode = Subject.create<WxrMode>(
    {
      mode: EWeatherRadar.HORIZONTAL,
      arcRadians: MathUtils.HALF_PI
    },
    (a, b) => a.mode === b.mode && a.arcRadians === b.arcRadians
  );

  private static readonly bingWxrColors = ArraySubject.create<readonly [number, number]>(
    BING_WXR_COLORS.map(colorStop => {
      const dbz: number = colorStop[1] - BING_WXR_GAIN;
      const first: number[] = ArrayUtils.first(PRECIP_RATE_TABLE);
      const last: number[] = ArrayUtils.last(PRECIP_RATE_TABLE);
      let precipRate: number = -1;

      if (dbz < first[0]) {
        precipRate = Math.pow(10, (dbz - first[0]) / 10) * first[1];
      } else if (dbz > last[0]) {
        precipRate = Math.pow(2, (dbz - last[0]) / 5) * last[1];
      }

      for (let i = 1; i < PRECIP_RATE_TABLE.length; i++) {
        const breakpoint: number[] = PRECIP_RATE_TABLE[i];

        if (dbz < breakpoint[0]) {
          const prevBreakpoint = PRECIP_RATE_TABLE[i - 1];
          precipRate = Math.pow(breakpoint[1] / prevBreakpoint[1], (dbz - prevBreakpoint[0]) / (breakpoint[0] - prevBreakpoint[0])) * prevBreakpoint[1];
        } else if (dbz === breakpoint[0]) {
          precipRate = breakpoint[1];
        }
      }

      return [colorStop[0], MathUtils.round(precipRate, 0.01)];
    }));

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // Knob labels
    this._knobState.leftText.set('Range');
    this._knobState.rightText.set('');

    // Radar LSK
    this._lskState.lsk2.type.set(LineSelectKeyButtonType.State);
    this._lskState.lsk2.label.set('Radar');
    this.operatingMode.pipe(
      this._lskState.lsk2.value,
      mode => mode === IfdWeatherRadarOperatingMode.Weather ? 'On' : 'Standby',
    );
    this._lskState.lsk2.isVisible.set(true);
    this._lskState.lsk2.onClick.set(() => this.operatingMode.set(
      this.operatingMode.get() === IfdWeatherRadarOperatingMode.Weather ?
        IfdWeatherRadarOperatingMode.Standby : IfdWeatherRadarOperatingMode.Weather));

    // Vertical Profile LSK
    this._lskState.lsk3.type.set(LineSelectKeyButtonType.State);
    this._lskState.lsk3.label.set('Vert. Profile');
    this.scanMode.pipe(
      this._lskState.lsk3.value,
      mode => mode === IfdWeatherRadarScanMode.Vertical ? 'On' : 'Off',
    );
    this._lskState.lsk3.isVisible.set(true);
    this._lskState.lsk3.onClick.set(() => this.scanMode.set(
      this.scanMode.get() === IfdWeatherRadarScanMode.Vertical ?
        IfdWeatherRadarScanMode.Horizontal : IfdWeatherRadarScanMode.Vertical));

    // Set Bing map position and range
    MappedSubject.create(this.operatingMode, this.position, this.range)
      .sub(([operatingMode, position, range]): void => {
        if (operatingMode === IfdWeatherRadarOperatingMode.Weather) {
          this.bingRef.instance.setPositionRadius(
            new LatLong(position),
            UnitType.NMILE.convertTo(range, UnitType.METER),
          );
        }
      }, true);

    // Set Bing map scan mode
    this.scanMode.sub((scanMode: IfdWeatherRadarScanMode): void => {
      this.wxrMode.set({
        arcRadians: UnitType.DEGREE.convertTo(
          scanMode === IfdWeatherRadarScanMode.Horizontal ?
            HORIZONTAL_SCAN_ANGULAR_WIDTH :
            VERTICAL_SCAN_ANGULAR_WIDTH,
          UnitType.RADIAN
        ),
        mode: scanMode === IfdWeatherRadarScanMode.Horizontal ?
          EWeatherRadar.HORIZONTAL :
          EWeatherRadar.VERTICAL,
      });
    }, true);

    // Sleep Bing map when tab not active
    this.props.viewService.activePageTab.sub((val) => {
      if (val?.tabInfo.title === this.title) {
        this.bingRef.instance.wake();
      } else {
        this.bingRef.instance.sleep();
      }
    });

    this.props.bus.getSubscriber<GNSSEvents>()
      .on('ground_speed')
      .withPrecision(0)
      .handle(gs => {
        if (gs < 20 && this.prevGroundSpeed >= 20) {
          this.operatingMode.set(IfdWeatherRadarOperatingMode.Standby);
        }
        this.prevGroundSpeed = gs;
      });
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const currentRangeIndex = this.rangeIndex.get();

    switch (event) {
      case IfdInteractionEvent.RightKnobOuterDec:
        if (currentRangeIndex > 0) {
          this.rangeIndex.set(currentRangeIndex - 1);
        }
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        if (currentRangeIndex < RANGE_ARRAY_NM.length - 1) {
          this.rangeIndex.set(currentRangeIndex + 1);
        }
        return true;
      default:
        return false; // Event not handled
    }
  }

  /** @inheritDoc */
  render(): VNode {
    return (
      <div
        class={{
          'ifd-map-radar-tab': true,
          'weather-radar-horizontal': this.scanMode.map(mode => mode === IfdWeatherRadarScanMode.Horizontal),
          'weather-radar-vertical': this.scanMode.map(mode => mode === IfdWeatherRadarScanMode.Vertical),
        }}
      >

        <div class={{
          'weather-radar-bing-container': true,
          hidden: this.operatingMode.map(mode => mode === IfdWeatherRadarOperatingMode.Standby),
        }}>
          <BingComponent
            ref={this.bingRef}
            id={`ifd-wx-radar-${this.props.instrumentIndex}`}
            mode={EBingMode.PLANE}
            wxrMode={this.wxrMode}
            wxrColors={RadarTab.bingWxrColors}
          />
        </div>

        {/* HORIZONTAL reference lines and labels */}
        <svg class={{
          'weather-radar-overlay': true,
          hidden: this.scanMode.map(mode => mode === IfdWeatherRadarScanMode.Vertical),
        }}>
          <line class='weather-radar-range-line' x1={248} y1={100} x2={248} y2={330} />
          {[1, 2, 3, 4].map((i) => (
            <path
              class='weather-radar-range-line'
              d={SVGUtils.describeArc(248, 368, 67 * i, -50, 50)}
            />
          ))}
          <path
            class='weather-radar-plane-icon weather-radar-plane-icon-horizontal'
            d={HORIZONTAL_PLANE_PATH}
          />
        </svg>
        <div class={{
          'weather-radar-range-labels': true,
          'weather-radar-range-labels-horizontal': true,
          hidden: this.scanMode.map(mode => mode === IfdWeatherRadarScanMode.Vertical),
        }}>
          {[0, 1, 2, 3].map(i => (
            <div
              class='weather-radar-range-label-horizontal'
              style={{
                left: `${52 * i}px`,
                bottom: `${43 * i}px`,
              }}
            >
              <div class={{
                'weather-radar-range-label-dist': true,
                hidden: i === 3,
              }}>
                <span>{this.range.map(range => (range * (i + 1) / 4).toFixed())}</span>
                <span class='weather-radar-range-label-unit'> NM</span>
              </div>
              <div
                class='weather-radar-range-label-alt'
                style={{ transform: `translateY(${i === 3 ? -10 : 0}px)` }}
              >
                <span>0</span>
                <span class='weather-radar-range-label-unit'> KFt</span>
              </div>
            </div>
          ))}
          <div class='weather-radar-range-label-dist weather-radar-range-label-dist-top weather-radar-range-label-dist-top-horizontal'>
            <span>{this.range}</span>
            <span class='weather-radar-range-label-unit'> NM</span>
          </div>
        </div>

        {/* VERTICAL reference lines and labels */}
        <svg class={{
          'weather-radar-overlay': true,
          hidden: this.scanMode.map(mode => mode === IfdWeatherRadarScanMode.Horizontal),
        }}>
          <line class='weather-radar-range-line' x1={200} x2={400} y1={146} y2={146} />
          <line class='weather-radar-range-line' x1={120} x2={400} y1={226} y2={226} />
          <line class='weather-radar-range-line' x1={200} x2={400} y1={306} y2={306} />
          {[1, 2, 3, 4].map((i) => (
            <path
              class='weather-radar-range-line'
              d={SVGUtils.describeArc(80, 226, (320 / 4) * i, 60, 120)}
            />
          ))}
          <path
            class='weather-radar-plane-icon weather-radar-plane-icon-vertical'
            d={VERTICAL_PLANE_PATH}
          />
        </svg>
        <div class={{
          'weather-radar-range-labels': true,
          'weather-radar-range-labels-vertical': true,
          hidden: this.scanMode.map(mode => mode === IfdWeatherRadarScanMode.Horizontal),
        }}>
          {[0, 1, 2, 3].map(i => (
            <div
              class={{
                'weather-radar-range-label-dist': true,
                'weather-radar-range-label-dist-top': i === 3,
              }}
              style={{
                position: 'absolute',
                right: `${-70 * i - (i === 3 ? 20 : 0)}px`,
                top: `${-43 * i}px`,
              }}
            >
              <span>{this.range.map(range => (range * (i + 1) / 4).toFixed())}</span>
              <span class='weather-radar-range-label-unit'> NM</span>
            </div>
          ))}
          <div
            class='weather-radar-range-label-alt'
            style='position: absolute; left: 251px; top: -30px'
          >
            <span>+30</span>
            <span class='weather-radar-range-label-unit'> KFt</span>
          </div>
          <div
            class='weather-radar-range-label-alt'
            style='position: absolute; left: 258px; top: 50px'
          >0</div>
          <div
            class='weather-radar-range-label-alt'
            style='position: absolute; left: 251px; top: 129px'
          >
            <span>-30</span>
            <span class='weather-radar-range-label-unit'> KFt</span>
          </div>
        </div>

      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    this.bingRef.getOrDefault()?.destroy();
    this.position.destroy();
  }
}
