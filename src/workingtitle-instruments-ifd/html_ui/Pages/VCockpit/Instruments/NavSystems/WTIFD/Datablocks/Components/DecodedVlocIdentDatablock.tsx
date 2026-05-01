import { ComputedSubject, FSComponent, MappedSubject, MathUtils, NumberFormatter, NumberUnitSubject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { NumberUnitDisplay } from '../../Components/NumberDisplays';
import { IfdNavSources } from '../../Navigation/Sources/IfdNavSources';
import { NavRadioNavSource } from '../../Navigation/Sources/NavRadioNavSource';
import { UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

import './DecodedVlocIdentDatablock.css';

/** Props for {@link DecodedVlocIdentDatablock} */
interface DecodedVlocIdentDatablockProps extends BaseDatablockProps {
  /** The source of the VLOC data. */
  vlocSource?: NavRadioNavSource<IfdNavSources>;
}

/** Datablock for displaying the Decoded VLOC Identifier */
export class DecodedVlocIdentDatablock extends Datablock<DecodedVlocIdentDatablockProps> {
  private readonly radialFormatter = NumberFormatter.create({
    precision: 1,
    pad: 3,
    nanString: '---'
  });
  private readonly distanceFormatter = NumberFormatter.create({
    precision: 0.1,
    nanString: '--.-'
  });

  private readonly isIls = ComputedSubject.create<boolean | null, boolean>(false, (v) => !!v);
  private readonly identDisplay = ComputedSubject.create<string | null, string>(null, (v) => {
    return (v || '---').toUpperCase();
  });
  private readonly radialDisplay = ComputedSubject.create<number | null, string>(
    null,
    (v) => {
      return this.radialFormatter(v ?? NaN);
    }
  );
  private readonly airportDisplay = ComputedSubject.create<string | null, string>(
    null,
    (v) => {
      return (v || '----').toUpperCase();
    }
  );
  private readonly runwayDisplay = ComputedSubject.create<string | null, string>(
    null,
    (v) => {
      return (v || '--').toUpperCase();
    }
  );
  private readonly distanceNm = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  private readonly distanceUnit = UnitsUserSettings.getManager(this.props.bus).distanceUnitsLarge;

  /**
   * Gets the datablock info for DecodedVlocIdentDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Decoded VLOC Identifier',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.props.vlocSource) {
      this.props.vlocSource.hasLocalizer.pipe(this.isIls).withLifecycle(this.defaultLifecycle);
      MappedSubject.create(
        ([ident, hasNav]) => {
          if (hasNav) {
            this.identDisplay.set(ident);
          } else {
            this.identDisplay.set(null);
          }
        },
        this.props.vlocSource.ident,
        this.props.vlocSource.hasNav,
      ).withLifecycle(this.defaultLifecycle);
      MappedSubject.create(
        ([bearing, hasNav]) => {
          if (hasNav) {
            this.radialDisplay.set(bearing === null ? NaN : MathUtils.round(bearing, 1));
          } else {
            this.radialDisplay.set(null);
          }
        },
        this.props.vlocSource.bearing,
        this.props.vlocSource.hasNav,
      ).withLifecycle(this.defaultLifecycle);
      MappedSubject.create(
        ([distance, hasNav]) => {
          if (hasNav) {
            this.distanceNm.set(distance === null ? NaN : MathUtils.round(distance, 0.1), UnitType.NMILE);
          } else {
            this.distanceNm.set(NaN, UnitType.NMILE);
          }
        },
        this.props.vlocSource.distance,
        this.props.vlocSource.hasNav,
      ).withLifecycle(this.defaultLifecycle);
      MappedSubject.create(
        ([locAirportIdent, hasNav, hasLocalizer]) => {
          if (hasNav && hasLocalizer) {
            this.airportDisplay.set(locAirportIdent);
          } else {
            this.airportDisplay.set(null);
          }
        },
        this.props.vlocSource.localizerAirportIdent,
        this.props.vlocSource.hasNav,
        this.props.vlocSource.hasLocalizer,
      ).withLifecycle(this.defaultLifecycle);
      MappedSubject.create(
        ([locRunway, hasNav, hasLocalizer]) => {
          if (hasNav && hasLocalizer) {
            this.runwayDisplay.set(locRunway);
          } else {
            this.runwayDisplay.set(null);
          }
        },
        this.props.vlocSource.localizerRunway,
        this.props.vlocSource.hasNav,
        this.props.vlocSource.hasLocalizer,
      ).withLifecycle(this.defaultLifecycle);
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-decoded-vloc-ident" ref={this.datablockRef}>
        <div class={{ hidden: this.isIls }}>
          <div class="datablock-content-row">
            <div class="decoded-vloc-label datablock-indent datablock-space-after datablock-font-small datablock-text-mint">VOR</div>
            <div class="datablock-font-large datablock-text-cyan">{this.identDisplay}</div>
          </div>
          <div class="datablock-content-row">
            <div class="decoded-vloc-label datablock-indent datablock-space-after datablock-font-small datablock-text-mint">RAD</div>
            <div class="datablock-font-large datablock-text-cyan">{this.radialDisplay}°</div>
          </div>
          <div class="datablock-content-row space-below">
            <div class="decoded-vloc-label datablock-indent datablock-space-after datablock-font-small datablock-text-mint">DIS</div>
            <NumberUnitDisplay
              class="datablock-numberunit"
              value={this.distanceNm}
              displayUnit={this.distanceUnit}
              formatter={this.distanceFormatter}
            />
          </div>
        </div>
        <div class={{ hidden: this.isIls.map(v => !v).withLifecycle(this.defaultLifecycle) }}>
          <div class="datablock-content-row">
            <div class="decoded-vloc-label datablock-indent datablock-space-after datablock-font-small datablock-text-mint">ILS</div>
            <div class="datablock-font-large datablock-text-cyan">{this.identDisplay}</div>
          </div>
          <div class="datablock-content-row">
            <div class="decoded-vloc-label datablock-indent datablock-space-after datablock-font-small datablock-text-mint">Arpt</div>
            <div class="datablock-font-large datablock-text-cyan">{this.airportDisplay}</div>
          </div>
          <div class="datablock-content-row space-below">
            <div class="decoded-vloc-label datablock-indent datablock-space-after datablock-font-small datablock-text-mint">RWY</div>
            <div class="datablock-font-large datablock-text-cyan">{this.runwayDisplay}</div>
          </div>
        </div>
      </div>
    );
  }
}
