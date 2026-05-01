import { FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdPageProps } from './IfdPage';

import './PageWrapper.css';

/** Props for the PageWrapper component. */
export interface PageWrapperProps extends IfdPageProps {
  /** Whether the page should be visible. */
  isVisible: Subscribable<boolean>;
}

/** Wraps each page component to control things like visibility. */
export class PageWrapper extends LifecycleComponent<PageWrapperProps> {
  public readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  render(): VNode {
    return (
      <div
        ref={this.rootRef}
        class={{
          'ifd-page-wrapper': true,
          'hidden': this.props.isVisible.map(x => !x),
        }}
      >
        {this.props.children}
        {/* PageTabs is passed in through children from the view service. */}
      </div>
    );
  }
}
