import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { IfdViewService } from '../../ViewService';
import { IfdPageName } from '../IfdPage';

import './SvsFullscreenContainer.css';

/** The properties for the {@link SvsFullscreenContainer} component. */
interface SvsFullscreenContainerProps extends ComponentProps {
  /** The IFD view service. */
  readonly viewService: IfdViewService
}

/**
 * The SvsFullscreenContainer component.
 * In certain aircraft, the SVS is only displayed in fullscreen mode.
 * The SVS page will be moved into this element if it is in fullscreen mode.
 */
export class SvsFullscreenContainer extends DisplayComponent<SvsFullscreenContainerProps> {
  public readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'svs-fullscreen-container': true,
          'hidden': MappedSubject.create(
            this.props.viewService.isSvsFullscreen,
            this.props.viewService.activePage
          ).map(([isFullscreen, activePage]) => !isFullscreen || activePage?.name !== IfdPageName.SVS),
        }}
        ref={this.rootRef} />
    );
  }
}
