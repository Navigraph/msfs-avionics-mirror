import {
  AirportRunway, ComponentProps, DmsFormatter2, FSComponent, LifecycleComponent, MagVar, NumberFormatter, OneWayRunway, RunwayUtils, Subject, Subscribable,
  Unit, UnitFamily, UnitType, UserSetting, VNode
} from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../../../../Components/List';
import { UnitsNavAngleSettingMode } from '../../../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../../../Utilities/FormatUtils';
import { IfdRunwayUtils } from '../../../../../Utilities/IfdRunwayUtils';
import { InfoItem } from '../InfoItem';
import { RunwayDiagram } from './RunwayDiagram';

/** Interface for Runway list data. */
export interface RunwayListData extends DynamicListData {
  /** The runway */
  readonly runway: AirportRunway;
  /** Whether the runway is permanently expanded. Also hides the expand icon. */
  readonly forceExpanded?: boolean;
}

/** The properties for the {@link RunwayInfoItem} component. */
interface RunwayInfoItemProps extends ComponentProps {
  /** The runway */
  runwayData: RunwayListData;
  /** The runway display name */
  displayName: string;
  /** The distance unit from the user settings */
  distanceUnit: Subscribable<Unit<UnitFamily.Distance>>;
  /** The runway size display string */
  runwaySizeDisplay: string;
  /** The index of this item in the runway list */
  listIndex: number;
  /** The index of currently expanded item. Null if no item is expanded. */
  expandedIndex: Subscribable<number | null>;
  /** The index of currently selected item. Null if no item is selected. */
  selectedIndex: Subscribable<number | null>;
  /** Callback to expand an item by index */
  expandItem: (index: number) => void;
  /** Callback to collapse the item */
  collapseItem: () => void;
  /** Callback to select an item by index */
  selectItem: (index: number) => void;
  /** Nav angle user setting. */
  navAngleUserSetting: UserSetting<UnitsNavAngleSettingMode>;
}

/**
 * The Runway info item of the info tab
 */
export class RunwayInfoItem extends LifecycleComponent<RunwayInfoItemProps> {
  private static readonly latFormatter = DmsFormatter2.create('{+[N]-[S]}{dd}°{mm}\'{ss}"', UnitType.DEGREE, 0.0001, '- --°--\'--"');
  private static readonly lonFormatter = DmsFormatter2.create('{+[E]-[W]}{ddd}°{mm}\'{ss}"', UnitType.DEGREE, 0.0001, '- --°--\'--"');
  private static readonly bearingFormatter = ({ course, latitude, longitude }: OneWayRunway) => {
    return (navAngleSetting: UnitsNavAngleSettingMode): string => {
      const convertedCourse = navAngleSetting === UnitsNavAngleSettingMode.True ?
        course :
        MagVar.trueToMagnetic(course, latitude, longitude);
      return BearingFormatter.format(convertedCourse, navAngleSetting);
    };
  };
  private static readonly elevationFormatter = NumberFormatter.create({
    precision: 1,
    nanString: '-'
  });

  private readonly primaryOneWayRunway: OneWayRunway;
  private readonly secondaryOneWayRunway: OneWayRunway;

  private readonly primaryElevationDisplay = Subject.create('---');
  private readonly secondaryElevationDisplay = Subject.create('---');

  private readonly isExpanded = this.props.runwayData.forceExpanded
    ? Subject.create(true)
    : this.props.expandedIndex.map(index => index === this.props.listIndex).withLifecycle(this.defaultLifecycle);

  private readonly headerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly contentRef = FSComponent.createRef<HTMLDivElement>();
  private readonly iconContainerRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritDoc */
  public constructor(props: RunwayInfoItemProps) {
    super(props);

    const oneWayRunways = RunwayUtils.getOneWayRunways(this.props.runwayData.runway, this.props.listIndex);
    this.primaryOneWayRunway = oneWayRunways[0];
    this.secondaryOneWayRunway = oneWayRunways[1];
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isExpanded.sub(expanded => {
      this.headerRef.instance.classList.toggle('expanded', expanded);
      this.contentRef.instance.classList.toggle('expanded', expanded);
    }, true).withLifecycle(this.defaultLifecycle);

    if (this.props.runwayData.forceExpanded) {
      this.iconContainerRef.instance.style.display = 'none';
    }

    this.headerRef.instance.addEventListener('click', this.onHeaderClick.bind(this));
    this.iconContainerRef.instance.addEventListener('click', this.onIconClick.bind(this));

    this.props.distanceUnit.sub(unit => {
      this.primaryElevationDisplay.set(`${RunwayInfoItem.elevationFormatter(UnitType.METER.convertTo(this.primaryOneWayRunway.elevation, unit))}${unit.equals(UnitType.FOOT) ? 'Ft' : 'M'}`);
      this.secondaryElevationDisplay.set(`${RunwayInfoItem.elevationFormatter(UnitType.METER.convertTo(this.secondaryOneWayRunway.elevation, unit))}${unit.equals(UnitType.FOOT) ? 'Ft' : 'M'}`);
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Toggles the expanded state of the runway info item
   */
  private toggleExpanded(): void {
    const currentlyExpanded = this.props.expandedIndex.get() === this.props.listIndex;
    if (currentlyExpanded && !this.props.runwayData.forceExpanded) {
      this.props.collapseItem();
    } else {
      this.props.expandItem(this.props.listIndex);
    }
  }

  /**
   * Handles click on the header row
   * @param e The mouse event
   */
  private onHeaderClick(e: MouseEvent): void {
    e.stopPropagation();

    this.props.selectItem(this.props.listIndex);
  }

  /**
   * Handles click on the expand icon
   * @param e The mouse event
   */
  private onIconClick(e: MouseEvent): void {
    e.stopPropagation();

    this.toggleExpanded();
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="runway-info-item-container">
        <InfoItem
          class='runway-item'
          isSelected={this.props.selectedIndex.map(v => v === this.props.listIndex).withLifecycle(this.defaultLifecycle)}
        >
          <div class="runway-item-header-row" ref={this.headerRef}>
            <div class="runway-item-name">{this.props.displayName}</div>
            <div class="runway-item-size">{this.props.runwaySizeDisplay}</div>
            <div class="runway-item-expand-icon" ref={this.iconContainerRef}>
              <img src="/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/chevron.png" alt="Expand runway information" />
            </div>
          </div>
          <div class="runway-item-content" ref={this.contentRef}>
            <div class="runway-item-header-row">
              <div class="runway-item-name"></div>
              <div class="runway-item-size">{IfdRunwayUtils.getRunwaySurfaceName(this.props.runwayData.runway.surface)}</div>
            </div>
            <div class="runway-item-body-row">
              <div class="runway-item-body-left">{RunwayInfoItem.latFormatter(this.primaryOneWayRunway.latitude)}</div>
              <div class="runway-item-body-right">{RunwayInfoItem.latFormatter(this.secondaryOneWayRunway.latitude)}</div>
            </div>
            <div class="runway-item-body-row">
              <div class="runway-item-body-left">{RunwayInfoItem.lonFormatter(this.primaryOneWayRunway.longitude)}</div>
              <div class="runway-item-body-right">{RunwayInfoItem.lonFormatter(this.secondaryOneWayRunway.longitude)}</div>
            </div>
            <div class="runway-item-body-row">
              <div class="runway-item-body-left">
                <span class="runway-item-body-label">Brg:&nbsp;</span>
                {this.props.navAngleUserSetting.map(RunwayInfoItem.bearingFormatter(this.primaryOneWayRunway))}
              </div>
              <div class="runway-item-body-right">
                <span class="runway-item-body-label">Brg:&nbsp;</span>
                {this.props.navAngleUserSetting.map(RunwayInfoItem.bearingFormatter(this.secondaryOneWayRunway))}
              </div>
            </div>
            <div class="runway-item-body-row">
              <div class="runway-item-body-left">
                <span class="runway-item-body-label">Elev:&nbsp;</span>
                {this.primaryElevationDisplay}
              </div>
              <div class="runway-item-body-right">
                <span class="runway-item-body-label">Elev:&nbsp;</span>
                {this.secondaryElevationDisplay}
              </div>
            </div>
          </div>
        </InfoItem>
        <RunwayDiagram runway={this.props.runwayData.runway} isVisible={this.isExpanded} />
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.headerRef.instance.removeEventListener('click', this.onHeaderClick);
    this.iconContainerRef.instance.removeEventListener('click', this.onIconClick);

    super.destroy();
  }
}
