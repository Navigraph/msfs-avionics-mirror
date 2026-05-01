import { EventBus, Facility } from '@microsoft/msfs-sdk';

import { IfdView, IfdViewProps } from '../../ViewService';
import { TouchTabInfo } from './TouchTabGroup';

/** The properties for the {@link TabContent} component. */
export interface TabContentProps extends IfdViewProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The tab info object. */
  readonly tabInfo: TouchTabInfo;
}

/** The TabContent component. */
export abstract class TabContent<P extends TabContentProps = TabContentProps> extends IfdView<P> {
  public abstract readonly title: string;

  /** Gets the facility associated with the currently active page that will be used if a DIR TO is called up. */
  public getPageFacility?(): Facility | undefined;
}
