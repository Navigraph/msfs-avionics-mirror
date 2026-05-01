import { FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { TabContentProps } from './TabContent';

import './TabWrapper.css';

/** Props for the TabWrapper component. */
export interface TabWrapperProps extends TabContentProps {
  /** Whether the page should be visible. */
  isVisible: Subscribable<boolean>;
}

/** Wraps each page component to control things like visibility. */
export class TabWrapper extends LifecycleComponent<TabWrapperProps> {
  public readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  render(): VNode {
    return (
      <div
        ref={this.rootRef}
        class={{
          'tab-wrapper': true,
          'hidden': this.props.isVisible.map(x => !x),
        }}
      >
        {this.props.children}
      </div>
    );
  }
}
