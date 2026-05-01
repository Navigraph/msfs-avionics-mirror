import { MutableSubscribable, NodeReference, VNode } from '@microsoft/msfs-sdk';

import { TouchTabInfo } from '../Components/Tabs/TouchTabGroup';
import { IfdPage, IfdPageName } from './IfdPage';
import { PageWrapper } from './PageWrapper';

/** Stores info about an IFD page registration. */
export interface IfdPageRegistration {
  /** The name of the page. Matches the button label on the IFD bezel. */
  name: IfdPageName;
  /** Renders the page. */
  render: IfdPageRenderFunction;
  /** A Ref to to the rendered page. */
  pageRef: NodeReference<IfdPage>;
  /** A Ref to the rendered page wrapper. */
  wrapperRef: NodeReference<PageWrapper>;
  /** Whether the page has been rendered yet. */
  isRendered?: boolean;
  /** The page's tabs. */
  tabs?: readonly TouchTabInfo[];
  /** The page's active tab. */
  activeTab: MutableSubscribable<TouchTabInfo | undefined>;
}

/**
 * A function that renders an IFD page.
 * @param pageRef A reference to the page.
 */
export type IfdPageRenderFunction = (pageRef: IfdPageRegistration) => VNode;
