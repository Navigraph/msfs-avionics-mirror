import { AirportFacility, ArraySubject, EventBus, FacilityFrequencyType, FSComponent, Subject, SubscribableArrayEventType, VNode } from '@microsoft/msfs-sdk';

import { IfdList } from '../../../Components/List';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../../Events/IfdTuningControlsManager';
import { FrequencyListData, FrequencyRow } from '../Components/FrequencyRow';
import { FacilityInfoUtils } from '../../../Utilities/FacilityInfoUtils';

/** The properties for the {@link EnrouteTab} component. */
interface EnrouteTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The enroute airport array subject. */
  readonly enrouteAirports: ArraySubject<AirportFacility>;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

/** The EnrouteTab component. */
export class EnrouteTab extends TabContent<EnrouteTabProps> {
  public readonly title: string = 'Enroute';
  private readonly listRef = FSComponent.createRef<IfdList<FrequencyListData>>();

  private readonly data = ArraySubject.create<FrequencyListData>([]);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.enrouteAirports.sub((_, type, item) => {
      const items = item ? Array.isArray(item) ? item as AirportFacility[] : [item as AirportFacility] : [];

      switch (type) {
        case SubscribableArrayEventType.Added:
          for (const it of items) {
            this.insertFrequenciesFromAirport(it);
          }
          break;
        case SubscribableArrayEventType.Removed: {
          for (const it of items) {
            const removeFreqs = this.data.getArray().filter((freqData) => freqData.airportIcao!.ident === it.icaoStruct.ident);

            for (const frequency of removeFreqs) {
              this.data.removeItem(frequency);
            }
          }
          break;
        }
      }
    }, true);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return this.listRef.getOrDefault()?.onInteractionEvent(event) ?? false;
  }

  /**
   * Inserts frequencies from an airport facility
   * @param fac The airport facility
   */
  private insertFrequenciesFromAirport(fac: AirportFacility): void {
    this.data.insertRange(this.data.length, fac.frequencies.filter((v) => v.type !== FacilityFrequencyType.None).map((v) => {
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
