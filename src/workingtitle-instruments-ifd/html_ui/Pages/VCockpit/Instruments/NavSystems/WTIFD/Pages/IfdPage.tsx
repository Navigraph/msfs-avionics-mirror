import { Facility, NodeReference } from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../Components/Tabs';
import { TabContentContainer } from '../Components/Tabs/TabContentContainer';
import { IfdView, IfdViewProps } from '../ViewService/IfdView';
import { IfdPageRegistration } from './IfdPageRegistration';

import './IfdPage.css';

export enum IfdPageName {
  SVS = 'SVS',
  FMS = 'FMS',
  MAP = 'MAP',
  AUX = 'AUX',
  FREQ = 'FREQ',
}

/**
 * Props for IFD pages.
 */
export interface IfdPageProps extends IfdViewProps {
  /** The page registration. */
  pageRef: IfdPageRegistration;
}

/**
 * Base class for all IFD pages.
 */
export abstract class IfdPage<T extends IfdPageProps = IfdPageProps> extends IfdView<T> {
  /** An instance of the event bus. */
  protected readonly bus = this.props.bus;
  /** The IFD view service. */
  protected readonly viewService = this.props.viewService;

  /** A reference to the tab content container for this page, if it has one. */
  public readonly tabContentContainerRef?: NodeReference<TabContentContainer>;

  /**
   * Gets the currently active tab content if there is a tab container with an active tab in this page.
   * @returns The active tab, or undefined if none.
   */
  public getActiveTabContent(): TabContent<TabContentProps> | undefined {
    return this.tabContentContainerRef?.getOrDefault()?.getActiveTabContent();
  }

  /**
   * Gets the facility associated with the currently active page that will be used if a DIR TO is called up.
   * @returns The facility associated with the page, or undefined if there isn't one.
   */
  public getPageFacility(): Facility | undefined {
    return this.getActiveTabContent()?.getPageFacility?.();
  }
}
