import { ArraySubject, EventBus, FacilityFrequency, FSComponent, Subject, SubscribableArrayEventType, VNode } from '@microsoft/msfs-sdk';

import { IfdList } from '../../../Components/List';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../../Events/IfdTuningControlsManager';
import { FrequencyListData, FrequencyRow } from '../Components/FrequencyRow';
import { FacilityInfoUtils } from '../../../Utilities/FacilityInfoUtils';

/** The properties for the {@link RecentTab} component. */
interface RecentTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

/** The RecentTab component. */
export class RecentTab extends TabContent<RecentTabProps> {
  public readonly title: string = 'Recent';
  private readonly listRef = FSComponent.createRef<IfdList<FrequencyListData>>();

  private readonly data = ArraySubject.create<FrequencyListData>([]);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.tuningControlsManager.navComManager.recentComFrequencies.sub((_, type, item) => {
      const items = item ? Array.isArray(item) ? item as FacilityFrequency[] : [item as FacilityFrequency] : [];

      switch (type) {
        case SubscribableArrayEventType.Added:
          for (const it of items) {
            this.data.insert({
              freq: it.freqMHz,
              title: FacilityInfoUtils.getFrequencyName(it),
              isVisible: Subject.create(true),
              heightPx: 40
            }, 0);
          }
          break;
        case SubscribableArrayEventType.Removed: {
          for (const it of items) {
            const freq = this.data.getArray().find(v => v.freq === it.freqMHz);
            freq && this.data.removeItem(freq);
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
