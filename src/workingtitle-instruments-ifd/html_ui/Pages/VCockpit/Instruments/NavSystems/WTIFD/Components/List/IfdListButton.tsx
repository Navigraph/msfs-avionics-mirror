import { DisplayComponent, FSComponent, SetSubject, SubscribableSet, Subscription, ToggleableClassNameRecord, VNode } from '@microsoft/msfs-sdk';

import { GtcTouchButton, GtcTouchButtonProps } from '../TouchButton/GtcTouchButton';
import { IfdListItem, IfdListItemProps } from './IfdListItem';

/** The props for IfdListButton. */
export interface IfdListButtonProps extends
  Omit<IfdListItemProps, 'class'>,
  Pick<GtcTouchButtonProps, 'isEnabled' | 'isHighlighted' | 'onPressed' | 'label'> {

  /**
   * Whether the button should fill the entire list item.
   * Overrides hideBorder to be true when true.
   * Defaults to false. */
  fullSizeButton?: boolean;

  /** A callback function to execute when the list item is destroyed. */
  onDestroy?: () => void;

  /** CSS class(es) to apply to the list item div element. */
  listItemClasses?: string | SubscribableSet<string> | ToggleableClassNameRecord;

  /** CSS class(es) to apply to the list item div element. */
  touchButtonClasses?: string | SubscribableSet<string>;
}

/** A TouchButton used at the top level of a GtcList list item.
 * Handles cleaning up the TouchButton on destroy. */
export class IfdListButton extends DisplayComponent<IfdListButtonProps> {
  private static readonly RESERVED_CLASSES = ['list-item-button', 'full-size-list-item-button'];
  private static readonly BASE_CLASSES = ['list-item-button'];

  private readonly listItemRef = FSComponent.createRef<IfdListItem>();

  private cssClassSub?: Subscription;

  /** @inheritdoc */
  public render(): VNode {
    const {
      children,
      hideBorder,
      paddedListItem,
      fullSizeButton,
      label,
      isEnabled,
      isHighlighted,
      onPressed,
      listItemClasses,
      touchButtonClasses
    } = this.props;

    const touchButtonClassSubject = SetSubject.create(IfdListButton.BASE_CLASSES);

    if (fullSizeButton) {
      touchButtonClassSubject.add('full-size-list-item-button');
    }

    if (typeof touchButtonClasses === 'object') {
      this.cssClassSub = FSComponent.bindCssClassSet(touchButtonClassSubject, touchButtonClasses, IfdListButton.RESERVED_CLASSES);
    } else if (touchButtonClasses !== undefined && touchButtonClasses.length > 0) {
      FSComponent.parseCssClassesFromString(touchButtonClasses)
        .forEach(cssClass => {
          if (!IfdListButton.RESERVED_CLASSES.includes(cssClass)) {
            touchButtonClassSubject.add(cssClass);
          }
        });
    }

    return (
      <IfdListItem ref={this.listItemRef} hideBorder={fullSizeButton || hideBorder} paddedListItem={paddedListItem} class={listItemClasses}>
        <GtcTouchButton
          label={label}
          isInList
          isEnabled={isEnabled}
          isHighlighted={isHighlighted}
          onPressed={onPressed}
          class={touchButtonClassSubject}
        >
          {children}
        </GtcTouchButton>
      </IfdListItem>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.props.onDestroy && this.props.onDestroy();

    this.listItemRef.getOrDefault()?.destroy();

    this.cssClassSub?.destroy();

    super.destroy();
  }
}
