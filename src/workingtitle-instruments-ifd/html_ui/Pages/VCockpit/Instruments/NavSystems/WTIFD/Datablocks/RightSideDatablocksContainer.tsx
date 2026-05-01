import { ArraySubject, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdList } from '../Components/List';
import { IfdView, IfdViewProps } from '../ViewService';
import { Datablock } from './Components/Datablock';
import { DatablockSlot } from './Components/DatablockSlot';
import { DatablockService } from './DatablocksService';

import './Datablocks.css';

/**
 * Props for datablock containers
 */
export interface RightSidebarDatablocksContainerProps extends IfdViewProps {
  /** The datablock service instance */
  datablockService: DatablockService;
}

/**
 * Right sidebar datablocks container
 */
export class RightSidebarDatablocksContainer extends IfdView<RightSidebarDatablocksContainerProps> {
  private rightSidebarSlots = this.props.datablockService.rightDatablocks;

  /** Used by DataSidebar to move around to other pages. */
  public readonly containerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly slotsToDisplay = ArraySubject.create<Datablock>([]);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.initializeContent();
  }

  /**
   * Initializes the component content.
   */
  private initializeContent(): void {
    this.rightSidebarSlots.sub((index, event, item, array) => {
      const datablocks: Datablock[] = [];
      let renderedSlots = 0;
      for (let i = 0; i < array.length; i++) {
        const datablock = array[i];

        if (datablock) {
          const size = datablock.getInfo().size ?? 0;
          renderedSlots += size;
          if (renderedSlots > DatablockService.RIGHT_SIDEBAR_SLOTS) {
            // Only render the slots that fit in the sidebar's limits
            break;
          }
          datablocks.push(datablock);
        }
      }

      this.slotsToDisplay.set(datablocks);

    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        ref={this.containerRef}
        class={{
          'datablocks-container': true,
          'datablocks-container-right-sidebar': true,
        }}
      >
        <IfdList<Datablock>
          bus={this.props.bus}
          class="datablocks-list"
          data={this.slotsToDisplay}
          heightPx={400}
          listItemSpacingPx={0}
          renderScrollBar={false}
          renderItem={(item, index, focus) =>
            <DatablockSlot
              bus={this.props.bus}
              datablock={item}
              focus={focus}
              data={item}
            />
          }
        />
      </div>
    );
  }
}
