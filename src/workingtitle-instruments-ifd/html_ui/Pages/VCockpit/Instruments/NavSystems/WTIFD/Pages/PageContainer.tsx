import { ComponentProps, DisplayComponent, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdViewService } from '../ViewService';

import './PageContainer.css';

/** Props for the PageContainer component. */
export interface PageContainerProps extends ComponentProps {
  /** The IFD view service. */
  readonly viewService: IfdViewService;
}

/** The page container for the IFD. */
export class PageContainer extends DisplayComponent<PageContainerProps> {
  public readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  render(): VNode {
    return <div
      ref={this.rootRef}
      class={{
        'ifd-page-container': true,
      }}
    />;
  }
}
