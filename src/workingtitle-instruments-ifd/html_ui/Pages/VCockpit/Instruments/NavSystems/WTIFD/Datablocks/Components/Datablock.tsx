import { ComponentProps, EventBus, FSComponent, LifecycleComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../Components/List';
import { DatablockService } from '../DatablocksService';
import { DataBlockId, DatablockInfo, DatablockSizeMap, DatablockSlotLocation } from '../DatablockTypes';

/**
 * Base props for all datablock components
 */
export interface BaseDatablockProps extends ComponentProps {
  /** Event bus */
  bus: EventBus;
  /** Datablock service */
  datablockService: DatablockService;
  /** The ID of the datablock */
  datablockId: DataBlockId;
  /** The bar the datablock is located in */
  location: DatablockSlotLocation;
  /** The position of the datablock within the bar */
  position: number;
}

/**
 * Generic datablock component.
 */
export abstract class Datablock<T extends BaseDatablockProps = BaseDatablockProps> extends LifecycleComponent<T> implements DynamicListData {
  public readonly isVisible = Subject.create(true);
  public readonly heightPx = ((this.props.datablockId === DataBlockId.Blank || this.props.location === DatablockSlotLocation.TopBar)
    ? 1 : DatablockSizeMap.get(this.props.datablockId)!) * 25;

  protected isSelected = Subject.create(false);

  protected datablockRef = FSComponent.createRef<HTMLDivElement>();

  public readonly datablockPosition: [DatablockSlotLocation, number] = [this.props.location, this.props.position];

  /**
   * Gets the datablock info for this instance
   * @returns The datablock info for this instance.
   */
  public abstract getInfo(): DatablockInfo;

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    if (this.datablockRef.instance) {
      this.datablockRef.instance.addEventListener('click', this.onDatablockClick.bind(this));
    }

    this.props.datablockService.selectedDatablock.sub((selectedDatablock) => {
      this.isSelected.set(this.isDatablockSelected(selectedDatablock, this.datablockPosition));
    }, true).withLifecycle(this.defaultLifecycle);
    this.isSelected.sub((selected) => {
      this.datablockRef.getOrDefault()?.classList.toggle('datablock-selected', selected);
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Abstract render method that must be implemented by all datablock subclasses
   */
  public abstract render(): VNode;

  /** Datablock click handler */
  protected onDatablockClick(): void {
    this.selectCurrentDatablock();
  }

  /**
   * Determines whether the datablock is currently selected
   * @param selectedPosition The selected datablock position
   * @param datablockPosition The position of this datablock
   * @returns True if the datablock is currently selected, false otherwise.
   */
  protected isDatablockSelected(selectedPosition: [DatablockSlotLocation, number] | null, datablockPosition: [DatablockSlotLocation, number]): boolean {
    return !!(selectedPosition && selectedPosition[0] === datablockPosition[0] && selectedPosition[1] === datablockPosition[1]);
  }

  /** Selects the current datablock if editing is enabled and it is not already selected */
  protected selectCurrentDatablock(): void {
    if (!this.props.datablockService.editingDatablocks.get() || this.isSelected.get()) {
      return;
    }

    this.props.datablockService.selectPosition(...this.datablockPosition);
  }

  /** @inheritDoc */
  public destroy(): void {
    this.datablockRef.getOrDefault()?.removeEventListener('click', this.onDatablockClick.bind(this));

    super.destroy();
  }
}
