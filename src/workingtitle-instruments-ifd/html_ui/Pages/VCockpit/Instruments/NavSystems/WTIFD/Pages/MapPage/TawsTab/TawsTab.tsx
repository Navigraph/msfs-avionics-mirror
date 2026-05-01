import { EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';

import './TawsTab.css';

/** The properties for the {@link TawsTab} component. */
interface TawsTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
}

/** The TawsTab component. */
export class TawsTab extends TabContent<TawsTabProps> {
  public readonly title: string = 'TAWS';

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="ifd-map-taws-tab">{this.title}</div>
    );
  }
}
