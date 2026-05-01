import { ComponentProps, FSComponent, LifecycleComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { IfdListCursor } from '../../../../Components/List/IfdListCursor';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanLegData, FlightPlanLegListData, FlightPlanListData, FlightPlanStore } from '../../../../FlightPlan';
import { Fms } from '../../../../Fms';
import { IfdInteractionEventHandler } from '../../../../RightKnob';
import { EmptyBlock } from './EmptyBlock';

/** Properties for the FplCursor */
export interface FplCursorProps extends ComponentProps {
  /** The flight plan list data, or undefined if this is the cursor before the start of the plan. */
  readonly data?: FlightPlanLegListData;
  /** The flight plan list cursor. */
  readonly cursor: IfdListCursor<FlightPlanListData>;
  /** The fms to use. */
  readonly fms: Fms;
  /** The flight plan store. */
  readonly store: FlightPlanStore;

  /**
   * Callback invoked when the user chooses to insert a waypoint *after* this leg.
   * @param anchorEl The DOM element that was clicked; used for positioning the menu/keyboard.
   * @param legData The leg that anchors the insert action.
   * @param showKeyboard Whether the keyboard should open immediately.
   */
  readonly onInsertMenuRequested: (
    anchorEl: HTMLElement,
    legData: FlightPlanLegData | null,
    showKeyboard: boolean,
  ) => void;
}

/** Cursor item shown between legs in the flight plan list. There are multiple of these (one per gap between legs). */
export class FplCursor extends LifecycleComponent<FplCursorProps> implements IfdInteractionEventHandler {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  private readonly isSelected = this.props.data ?
    MappedSubject.create(
      ([globalLegIndex, cursorItem, cursorSpaceAfterSelected]) => !!(cursorItem && cursorItem.type === 'leg' && cursorItem.legData.globalLegIndex.get() === globalLegIndex && cursorSpaceAfterSelected),
      this.props.data.legData.globalLegIndex,
      this.props.cursor.activeItem,
      this.props.cursor.spaceAfterItemSelected,
    ).withLifecycle(this.defaultLifecycle) :
    MappedSubject.create(
      ([cursorIndex, originFacility]) => cursorIndex < 0 && originFacility === undefined,
      this.props.cursor.activeIndex,
      this.props.store.originFacility,
    ).withLifecycle(this.defaultLifecycle);

  /**
   * Opens the context menu for inserting a waypoint at the given anchor.
   *
   * @param anchorEl The HTMLElement used to compute on-screen menu position.
   * @param showKeyboard Whether the keyboard should open immediately.
   */
  private openInsertMenu(anchorEl: HTMLElement, showKeyboard: boolean): void {
    this.props.onInsertMenuRequested(anchorEl, this.props.data?.legData ?? null, showKeyboard);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (!this.isSelected.get()) {
      return false;
    }

    switch (event) {
      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.openInsertMenu(this.rootRef.instance, false);
        return true;
    }

    return false;
  }

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.rootRef.instance.addEventListener('click', this.onClick);
  }

  private onClick = (): void => {
    if (this.isSelected.get()) {
      this.openInsertMenu(this.rootRef.instance, true);
    } else {
      this.props.cursor.setActiveItem(this.props.data, true, 'click');
    }
  };

  /** @inheritdoc */
  public override render(): VNode | null {
    return (
      <div
        ref={this.rootRef}
        style={{
          'position': 'relative',
          'bottom': '0',
        }}
      >
        <EmptyBlock isSelected={this.isSelected} isBefore={this.props.data === undefined} />
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.rootRef.instance.removeEventListener('click', this.onClick);
    super.destroy();
  }
}
