import { AirportFacility, ArraySubject, EventBus, FacilityFrequencyType, FSComponent, IcaoValue, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdList } from '../../../Components/List';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../../Events/IfdTuningControlsManager';
import { FrequencyListData, FrequencyRow } from '../Components/FrequencyRow';
import { FacilityInfoUtils } from '../../../Utilities/FacilityInfoUtils';

/** The properties for the {@link AirportTab} component. */
interface AirportTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The origin airport facility */
  readonly origin: Subscribable<AirportFacility | undefined>;
  /** The destination airport facility */
  readonly dest: Subscribable<AirportFacility | undefined>;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

/** The AirportTab component. */
export class AirportTab extends TabContent<AirportTabProps> {
  public readonly title: string = 'Airport';
  private readonly listRef = FSComponent.createRef<IfdList<FrequencyListData>>();

  private readonly data = ArraySubject.create<FrequencyListData>([]);

  private currentOriginIcao: IcaoValue | null = null;
  private currentDestIcao: IcaoValue | null = null;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.origin.sub((v) => this.getOriginFrequencyData(v), true);
    this.props.dest.sub((v) => this.getDestFrequencyData(v), true);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return this.listRef.getOrDefault()?.onInteractionEvent(event) ?? false;
  }

  /**
   * Gets the frequency list data for the origin airports
   * @param originFac The origin airport facility, or undefined if there is none.
   */
  private getOriginFrequencyData(originFac: AirportFacility | undefined): void {
    const removeFreqs = this.data.getArray().filter((freqData) => freqData.airportIcao === this.currentOriginIcao);

    for (const frequency of removeFreqs) {
      this.data.removeItem(frequency);
    }

    if (!originFac) { return; }

    this.currentOriginIcao = originFac.icaoStruct;
    this.insertFrequenciesFromAirport(originFac, 0);
  }

  /**
   * Gets the frequency list data for the destination airport
   * @param destFac The destination airport facility, or undefined if there is none.
   */
  private getDestFrequencyData(destFac: AirportFacility | undefined): void {
    const removeFreqs = this.data.getArray().filter((freqData) => freqData.airportIcao === this.currentDestIcao);

    for (const frequency of removeFreqs) {
      this.data.removeItem(frequency);
    }

    if (!destFac) { return; }

    this.currentDestIcao = destFac.icaoStruct;
    this.insertFrequenciesFromAirport(destFac, this.data.length);
  }

  /**
   * Inserts frequencies from an airport facility
   * @param fac The airport facility
   * @param insertIndex The index to insert it at
   */
  private insertFrequenciesFromAirport(fac: AirportFacility, insertIndex: number): void {
    this.data.insertRange(insertIndex, fac.frequencies.filter((v) => v.type !== FacilityFrequencyType.None).map((v) => {
      return {
        airportIcao: fac.icaoStruct,
        freq: v.freqMHz,
        title: FacilityInfoUtils.getFrequencyName(v, fac.icaoStruct.ident),
        isSelected: Subject.create(false),
        isVisible: Subject.create(true),
        heightPx: 40
      };
    }));
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="ifd-freq-tab">
        <IfdList<FrequencyListData>
          bus={this.props.bus}
          data={this.data}
          renderItem={(data, _index, focusFunc) => <FrequencyRow data={data} focus={focusFunc} tuningControlsManager={this.props.tuningControlsManager} />}
          listItemSpacingPx={5}
          heightPx={423}
          ref={this.listRef}
        />
      </div>
    );
  }
}
