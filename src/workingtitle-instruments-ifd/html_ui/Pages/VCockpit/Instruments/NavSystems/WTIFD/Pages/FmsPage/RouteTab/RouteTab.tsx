import { EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';

import './RouteTab.css';

/** The properties for the {@link RouteTab} component. */
interface RouteTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
}

/** The RouteTab component. */
export class RouteTab extends TabContent<RouteTabProps> {
  public readonly title: string = 'ROUTE';

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="route-tab">{this.title}</div>
    );
  }
}
