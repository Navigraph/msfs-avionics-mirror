import {
  ComponentProps, DisplayComponent, FSComponent, SetSubject, Subscribable, SubscribableSet, SubscribableUtils, Subscription, ToggleableClassNameRecord, VNode
} from '@microsoft/msfs-sdk';

import './IfdListItem.css';

/** The props for IfdListItem. */
export interface IfdListItemProps extends ComponentProps {
  /**
   * Hides the list item border, allowing the content to easily fill the entire space of the list-item.
   * Defaults to false.
   */
  hideBorder?: boolean | Subscribable<boolean>;

  /**
   * Adds some default, commonly used padding to the list item.
   * Defaults to false.
   */
  paddedListItem?: boolean | Subscribable<boolean>;

  /** A callback function to execute when the list item is destroyed. */
  onDestroy?: () => void;

  /** CSS class(es) to apply to the list item div element. */
  class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
}

/** A component that wraps list item content for use with GtcList. */
export class IfdListItem extends DisplayComponent<IfdListItemProps> {
  private static readonly RESERVED_CLASSES = ['list-item', 'hide-border', 'padded-list-item'];
  private static readonly BASE_CLASSES = ['list-item'];

  private readonly hideBorder = SubscribableUtils.toSubscribable(this.props.hideBorder ?? false, true) as Subscribable<boolean>;
  private readonly paddedListItem = SubscribableUtils.toSubscribable(this.props.paddedListItem ?? false, true) as Subscribable<boolean>;

  private thisNode?: VNode;

  private readonly subscriptions: Subscription[] = [];

  /** @inheritdoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;
  }

  /** @inheritdoc */
  public render(): VNode {
    const { children, class: classes } = this.props;

    const cssClasses = SetSubject.create(IfdListItem.BASE_CLASSES);

    this.subscriptions.push(this.hideBorder.sub(hideBorder => {
      cssClasses.toggle('hide-border', hideBorder);
    }, true));

    this.subscriptions.push(this.paddedListItem.sub(paddedListItem => {
      cssClasses.toggle('padded-list-item', paddedListItem);
    }, true));

    if (typeof classes === 'object') {
      const sub = FSComponent.bindCssClassSet(cssClasses, classes, IfdListItem.RESERVED_CLASSES);
      if (Array.isArray(sub)) {
        this.subscriptions.push(...sub);
      } else {
        this.subscriptions.push(sub);
      }
    } else if (classes !== undefined && classes.length > 0) {
      FSComponent.parseCssClassesFromString(classes)
        .forEach(cssClass => {
          if (!IfdListItem.RESERVED_CLASSES.includes(cssClass)) {
            cssClasses.add(cssClass);
          }
        });
    }

    return (
      <div class={cssClasses}>
        {children}
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.props.onDestroy && this.props.onDestroy();

    this.thisNode && FSComponent.shallowDestroy(this.thisNode);

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}
