import { ComponentProps, FSComponent, LifecycleComponent, VNode } from '@microsoft/msfs-sdk';

import { MapDataProvider } from '../../../Providers/Map/MapDataProvider';
import { FormatUtils } from '../../../Utilities/FormatUtils';

import './HeadingBox.css';

/**
 * The properties for the {@link HeadingBox} component.
 */
interface HeadingBoxProps extends ComponentProps {
  /** Map Data Provider. */
  readonly mapDataProvider: MapDataProvider;
}

/**
 * HeadingBox component for the IFD
 * Displays the heading box, map orientation and bearing reference
 */
export class HeadingBox extends LifecycleComponent<HeadingBoxProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'heading-box': true,
        'hidden': this.props.mapDataProvider.settings.getSetting('mapHeadingBox').map(o => !o).withLifecycle(this.defaultLifecycle),
      }}>
        <div class={{
          'heading-box-label': true,
          'heading-box-label-left': true,
          'hidden': this.props.mapDataProvider.displayHeadingIsHeading,
        }}>TRK</div>
        <div class="heading-box-heading">
          <div class="heading-box-heading-value">{this.props.mapDataProvider.displayHeading.map((v) => FormatUtils.formatCourse(v)).withLifecycle(this.defaultLifecycle)}</div>
        </div>
        <div class={{
          'heading-box-label': true,
          'heading-box-label-right': true,
          'hidden': this.props.mapDataProvider.displayHeadingIsMagnetic,
        }}>TRU</div>
      </div>
    );
  }
}
