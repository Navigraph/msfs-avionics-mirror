import { ComponentProps, DisplayComponent, EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { DatablockService } from '../../Datablocks/DatablocksService';
import { LeftSidebarDatablocksContainer } from '../../Datablocks/LeftSideDatablocksContainer';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { IfdOptions } from '../../IfdOptions';

/**
 * Props for {@link LeftBar} component.
 */
export interface IfdLeftBarProps extends ComponentProps {
  /** The event bus instance */
  readonly bus: EventBus;
  /** The IfdTuningControlManager instance */
  readonly ifdTuningControlManager: IfdTuningControlsManager;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
  /** The datablock service instance */
  readonly datablockService: DatablockService;
}

/**
 * Dumb component.
 * The IFD left-side bar.
 */
export class LeftBar extends DisplayComponent<IfdLeftBarProps> {
  /** @inheritDoc */
  public render(): VNode | null {
    return (
      <div class={{
        'wt-ifd-left-sidebar': true,
        // TODO It should never be fully hidden, we will need to show LSK buttons in fullscreen mode when pressed,
        // TODO and LeftBar needs to be visible when on other pages like FMS
        // 'hidden': this.props.ifdOptions.svsFullScreen !== 'never'
      }}>
        <LeftSidebarDatablocksContainer
          bus={this.props.bus}
          datablockService={this.props.datablockService}
        />
      </div>
    );
  }
}
