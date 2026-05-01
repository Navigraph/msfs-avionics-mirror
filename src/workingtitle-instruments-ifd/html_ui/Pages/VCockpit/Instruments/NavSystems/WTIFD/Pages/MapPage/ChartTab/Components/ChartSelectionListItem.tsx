import { ChartMetadata, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { DynamicListData } from '../../../../Components/List';
import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../Components/List/IfdListItemComponent';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';

import './ChartSelectionListItem.css';

/** Data for a generic chart list item */
export interface ChartSelectionListItemData extends DynamicListData {
  /** The text to display */
  text: string;
  /** The chart page */
  page: ChartMetadata;
}

/** Props for a {@link ChartSelectionPage} */
export interface ChartSelectionListItemProps extends IfdListItemComponentProps<ChartSelectionListItemData> {
  /** The charts manager */
  readonly chartsManager: IfdChartsManager;
  /** Function to run when selected */
  readonly onSelected: () => void;
}

/** An item found in a chart list.  */
export class ChartSelectionListItem extends IfdListItemComponent<ChartSelectionListItemProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();
  private readonly mouseDownListener = (): void => this.focus();

  /** @inheritdoc */
  public async onAfterRender(node: VNode): Promise<void> {
    super.onAfterRender(node);
    this.ref.instance.addEventListener('mousedown', this.mouseDownListener);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (event === IfdInteractionEvent.RightKnobPush) {
      this.onFocus();
      return true;
    } else {
      return false;
    }
  }

  /** @inheritdoc */
  public onFocus(): void {
    if (this._isSelected.get()) {
      this.props.chartsManager.selectedChart.set(this.props.data.page);
      this.props.onSelected();
    }

    super.onFocus();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div ref={this.ref} class={{ 'chart-list-item': true, 'chart-selected': this._isSelected }}>
        {this.props.data.text}
      </div>
    );
  }
}
