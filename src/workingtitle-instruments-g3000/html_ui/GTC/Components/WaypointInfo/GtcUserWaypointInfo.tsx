import {
  ArraySubject, BasicNavAngleSubject, BasicNavAngleUnit, ComponentProps, DisplayComponent, Facility, FacilityLoader,
  FacilitySearchType, FacilityUtils, FacilityWaypoint, FSComponent, GeoPoint, ICAO, IcaoValue, MagVar,
  MutableSubscribable, NodeReference, NumberFormatter, NumberUnitSubject, SetSubject, Subject, Subscribable,
  SubscribableArray, SubscribableArrayEventType, Subscription, Unit, UnitFamily, UnitType, UserFacility,
  UserFacilityType, VNode
} from '@microsoft/msfs-sdk';

import { LatLonDisplayFormat, UnitsUserSettingManager, WaypointInfoStore } from '@microsoft/msfs-garminsdk';

import { BearingDisplay, DynamicListData, GarminLatLonDisplay, NumberUnitDisplay } from '@microsoft/msfs-wtg3000-common';

import { GtcBearingArrow } from '../../Components/BearingArrow/GtcBearingArrow';
import { GtcList } from '../../Components/List/GtcList';
import { GtcListButton } from '../../Components/List/GtcListButton';
import { TabbedContainer, TabConfiguration } from '../../Components/Tabs/TabbedContainer';
import { TabbedContent } from '../../Components/Tabs/TabbedContent';
import { GtcWaypointDisplay } from '../../Components/Waypoint/GtcWaypointDisplay';
import { GtcUserWaypointDialog } from '../../Dialog/GtcUserWaypointDialog';
import { GtcInteractionEvent, GtcInteractionHandler } from '../../GtcService/GtcInteractionEvent';
import { GtcService } from '../../GtcService/GtcService';
import { GtcViewKeys } from '../../GtcService/GtcViewKeys';
import { SidebarState } from '../../GtcService/Sidebar';
import { GtcWaypointInfo, GtcWaypointInfoNoWaypointMessage, GtcWaypointInfoProps } from './GtcWaypointInfo';

import './GtcUserWaypointInfo.css';

/**
 * Component props for {@link GtcUserWaypointInfo}.
 */
export interface GtcUserWaypointInfoProps extends GtcWaypointInfoProps<FacilitySearchType.User> {
  /** The facility loader to use. */
  facLoader: FacilityLoader;

  /**
   * An array of all existing user waypoints. If not defined, then the display's user waypoints list tab will be
   * disabled. If {@link allowWaypointSelection | `allowWaypointSelection`} is false, then the list tab will always be
   * disabled and this prop is ignored.
   */
  userWaypoints?: SubscribableArray<FacilityWaypoint<UserFacility>>;

  /** The SidebarState to use. */
  sidebarState: SidebarState;
}

/**
 * A GTC user waypoint information display.
 */
export class GtcUserWaypointInfo extends GtcWaypointInfo<FacilitySearchType.User, GtcUserWaypointInfoProps> {
  protected readonly waypointSelectType = FacilitySearchType.User;

  private readonly tabContainerRef = FSComponent.createRef<TabbedContainer>();
  private activeTab: GtcUserWaypointInfoTabContent | null = null;

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    super.onAfterRender(thisNode);

    this._title.set('User Waypoint Information');
  }

  /** @inheritDoc */
  public onOpen(): void {
    super.onOpen();

    this.tabContainerRef.instance.selectTab(1);
  }

  /** @inheritDoc */
  public onResume(): void {
    super.onResume();

    this.tabContainerRef.instance.resume();
  }

  /** @inheritDoc */
  public onPause(): void {
    super.onPause();

    this.tabContainerRef.instance.pause();
  }

  /** @inheritDoc */
  public onGtcInteractionEvent(event: GtcInteractionEvent): boolean {
    if (this.activeTab) {
      return this.activeTab.onGtcInteractionEvent(event);
    } else {
      return false;
    }
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'user-info';
  }

  /** @inheritDoc */
  protected renderContent(): VNode {
    return (
      <TabbedContainer ref={this.tabContainerRef} configuration={TabConfiguration.LeftRight4} class='user-info-tab-container'>
        {this.renderTab(1, 'Info', this.renderInfoTab.bind(this))}
        {this.renderTab(2, 'WPT List', this.props.allowWaypointSelection && this.props.userWaypoints ? this.renderWaypointListTab.bind(this) : undefined)}
      </TabbedContainer>
    );
  }

  /**
   * Renders a tab for this display's tab container.
   * @param position The position of the tab.
   * @param label The tab label.
   * @param renderContent A function which renders the tab contents.
   * @returns A tab for this display's tab container, as a VNode.
   */
  private renderTab(
    position: number,
    label: string,
    renderContent?: (
      contentRef: NodeReference<GtcUserWaypointInfoTabContent>,
      sidebarState: Subscribable<SidebarState | null>
    ) => VNode
  ): VNode {
    const contentRef = FSComponent.createRef<GtcUserWaypointInfoTabContent>();
    const sidebarState = Subject.create<SidebarState | null>(null);

    return (
      <TabbedContent
        position={position}
        label={label}
        onPause={(): void => {
          this.activeTab = null;
          sidebarState.set(null);
          contentRef.instance.onPause();
        }}
        onResume={(): void => {
          this.activeTab = contentRef.getOrDefault();
          sidebarState.set(this.props.sidebarState);
          contentRef.instance.onResume();
        }}
        onDestroy={(): void => {
          contentRef.getOrDefault()?.destroy();
        }}
        disabled={renderContent === undefined}
      >
        {renderContent && renderContent(contentRef, sidebarState)}
      </TabbedContent>
    );
  }

  /**
   * Renders the info tab.
   * @param contentRef A reference to assign to the tab's content.
   * @param sidebarState The sidebar state to use.
   * @returns The info tab, as a VNode.
   */
  private renderInfoTab(
    contentRef: NodeReference<GtcUserWaypointInfoTabContent>,
    sidebarState: Subscribable<SidebarState | null>
  ): VNode {
    return (
      <GtcUserWaypointInfoInfoTab
        ref={contentRef}
        gtcService={this.props.gtcService}
        waypoint={this.props.selectedWaypoint}
        facility={this.selectedFacility}
        sidebarState={sidebarState}
        facLoader={this.props.facLoader}
        waypointInfo={this.selectedWaypointInfo}
        waypointRelativeBearing={this.selectedWaypointRelativeBearing}
        unitsSettingManager={this.props.unitsSettingManager}
      />
    );
  }

  /**
   * Renders the waypoint list tab.
   * @param contentRef A reference to assign to the tab's content.
   * @param sidebarState The sidebar state to use.
   * @returns The waypoint list tab, as a VNode.
   */
  private renderWaypointListTab(
    contentRef: NodeReference<GtcUserWaypointInfoTabContent>,
    sidebarState: Subscribable<SidebarState | null>
  ): VNode {
    return (
      <GtcUserWaypointInfoListTab
        ref={contentRef}
        gtcService={this.props.gtcService}
        waypoint={this.props.selectedWaypoint}
        facility={this.selectedFacility}
        sidebarState={sidebarState}
        // NOTE: this tab is only rendered if the user waypoints array prop is defined.
        userWaypoints={this.props.userWaypoints!}
        onFacilitySelected={facility => {
          this.tabContainerRef.instance.selectTab(1);
          // NOTE: this tab is only rendered if waypoint selection is allowed, so we will assume
          // this.props.selectedWaypoint is a mutable subscribable.
          (this.props.selectedWaypoint as MutableSubscribable<FacilityWaypoint<UserFacility> | null>).set(
            this.props.waypointCache.get(facility)
          );
        }}
      />
    );
  }
}

/**
 * Component props for GTC user waypoint information display tab contents.
 */
interface GtcUserWaypointInfoTabContentProps extends ComponentProps {
  /** The GTC service. */
  gtcService: GtcService;

  /** The selected waypoint. */
  waypoint: Subscribable<FacilityWaypoint<UserFacility> | null>;

  /** The facility associated with the selected waypoint. */
  facility: Subscribable<UserFacility | null>;

  /** The SidebarState to use. */
  sidebarState: Subscribable<SidebarState | null>;
}

/**
 * A content component for a GTC user waypoint information display tab.
 */
interface GtcUserWaypointInfoTabContent extends DisplayComponent<GtcUserWaypointInfoTabContentProps>, GtcInteractionHandler {
  /** A method which is called when this component's parent tab is paused. */
  onPause(): void;

  /** A method which is called when this component's parent tab is resumed. */
  onResume(): void;
}

/**
 * Component props for {@link GtcUserWaypointInfoInfoTab}.
 */
interface GtcUserWaypointInfoInfoTabProps extends GtcUserWaypointInfoTabContentProps {
  /** A facility loader. */
  facLoader: FacilityLoader;

  /** An information store for the selected user waypoint. */
  waypointInfo: WaypointInfoStore;

  /**
   * The bearing to the selected airport waypoint, relative to the airplane's current heading, or `NaN` if there is no
   * selected waypoint or position/heading data is invalid.
   */
  waypointRelativeBearing: Subscribable<number>;

  /** A manager for display units user settings. */
  unitsSettingManager: UnitsUserSettingManager;
}

/**
 * A GTC user waypoint information display info tab.
 */
class GtcUserWaypointInfoInfoTab extends DisplayComponent<GtcUserWaypointInfoInfoTabProps> implements GtcUserWaypointInfoTabContent {
  private static readonly BEARING_FORMATTER = NumberFormatter.create({ precision: 1, pad: 3, nanString: '___' });
  private static readonly DISTANCE_FORMATTER = NumberFormatter.create({ precision: 0.1, maxDigits: 3, nanString: '__._' });

  private thisNode?: VNode;

  private readonly paramsPosSectionCssClass = SetSubject.create([
    'user-info-info-section',
    'user-info-info-section-bottom-separator',
    'user-info-info-params-pos'
  ]);
  private readonly paramsSectionCssClass = SetSubject.create([
    'user-info-info-section',
    'user-info-info-section-bottom-separator',
    'user-info-info-params'
  ]);
  private readonly posSectionCssClass = SetSubject.create([
    'user-info-info-section',
    'user-info-info-section-bottom-separator',
    'user-info-info-pos'
  ]);
  private readonly coordsSectionCssClass = SetSubject.create([
    'user-info-info-section',
    'user-info-info-section-bottom-separator',
    'user-info-info-coords'
  ]);

  private readonly paramsRow2CssClass = SetSubject.create(['user-info-info-params-row']);

  private readonly paramsDis1CssClass = SetSubject.create(['user-info-info-params-dis']);

  private facilityOpId = 0;
  private facility?: UserFacility;

  private readonly type = Subject.create('');

  private readonly ref1 = Subject.create<Facility | null>(null);
  private readonly rad1 = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(0));
  private readonly dis1 = NumberUnitSubject.create<UnitFamily.Distance, Unit<UnitFamily.Distance>>(UnitType.NMILE.createNumber(0));

  private readonly ref2 = Subject.create<Facility | null>(null);
  private readonly rad2 = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(0));

  private sidebarStateSub?: Subscription;
  private facilitySub?: Subscription;

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;

    this.sidebarStateSub = this.props.sidebarState.sub(sidebarState => {
      sidebarState?.slot5.set(null);
    }, true);

    this.facilitySub = this.props.facility.sub(this.onFacilityChanged.bind(this), false, true);
  }

  /**
   * Responds to when the selected user facility changes.
   * @param facility The selected user facility.
   */
  private async onFacilityChanged(facility: UserFacility | null): Promise<void> {
    if (facility === null || facility === this.facility) {
      return;
    }

    if (facility.userFacilityType === UserFacilityType.LAT_LONG) {
      this.paramsSectionCssClass.add('hidden');
      this.posSectionCssClass.add('hidden');
      this.coordsSectionCssClass.add('hidden');
      this.paramsPosSectionCssClass.delete('hidden');
    } else {
      const opId = ++this.facilityOpId;

      let ref1: Facility | null = null;
      let ref2: Facility | null = null;
      if (facility.reference1IcaoStruct && ICAO.isValueFacility(facility.reference1IcaoStruct)) {
        ref1 = await this.getReference(facility.reference1IcaoStruct);
      }
      if (facility.reference2IcaoStruct && ICAO.isValueFacility(facility.reference2IcaoStruct)) {
        ref2 = await this.getReference(facility.reference2IcaoStruct);
      }

      if (opId !== this.facilityOpId) {
        return;
      }

      if (facility.userFacilityType === UserFacilityType.RADIAL_DISTANCE) {
        this.type.set('RAD / DIS');

        this.ref1.set(ref1);
        this.setReferenceRadial(facility, ref1, facility.reference1Radial, facility.reference1MagVar, this.rad1);
        this.setReferenceDistance(facility, ref1, facility.reference1Distance, this.dis1);

        this.paramsDis1CssClass.delete('hidden');
        this.paramsRow2CssClass.add('hidden');
      } else {
        this.type.set('RAD / RAD');

        this.ref1.set(ref1);
        this.setReferenceRadial(facility, ref1, facility.reference1Radial, facility.reference1MagVar, this.rad1);
        this.ref2.set(ref2);
        this.setReferenceRadial(facility, ref2, facility.reference2Radial, facility.reference2MagVar, this.rad2);

        this.paramsRow2CssClass.delete('hidden');
        this.paramsDis1CssClass.add('hidden');
      }

      this.paramsPosSectionCssClass.add('hidden');
      this.paramsSectionCssClass.delete('hidden');
      this.posSectionCssClass.delete('hidden');
      this.coordsSectionCssClass.delete('hidden');
    }

    this.facility = facility;
  }

  /**
   * Attempts to retrieve a reference facility.
   * @param icao The ICAO of the reference facility to retrieve.
   * @returns A Promise which is fulfilled with the requested facility, or `null` if it could not be retrieved.
   */
  private async getReference(icao: IcaoValue): Promise<Facility | null> {
    return await this.props.facLoader.tryGetFacility(ICAO.getFacilityTypeFromValue(icao), icao);
  }

  /**
   * Sets a reference radial for a user facility. If the reference facility is `null` or a unique radial could not be
   * calculated, the user facility's stored value for the radial will be used (if the stored value does not exist, then
   * the radial will be set to zero degrees magnetic).
   * @param facility A user facility.
   * @param reference The reference facility.
   * @param storedRadial The user facility's stored magnetic radial, in degrees, for the reference.
   * @param storedMagVar The user facility's stored magnetic variation, in degrees, for the reference.
   * @param subject The subject to which to write the radial.
   */
  private setReferenceRadial(
    facility: UserFacility,
    reference: Facility | null,
    storedRadial: number | undefined,
    storedMagVar: number | undefined,
    subject: BasicNavAngleSubject
  ): void {
    let trueRadial: number | undefined;
    let magVar = storedMagVar ?? 0;
    if (reference !== null) {
      magVar = FacilityUtils.getMagVar(reference);

      const radial = GeoPoint.initialBearing(reference.lat, reference.lon, facility.lat, facility.lon);
      if (!isNaN(radial)) {
        trueRadial = radial;
      }
    }

    if (trueRadial === undefined) {
      subject.set(storedRadial ?? 0, magVar);
    } else {
      subject.set(MagVar.trueToMagnetic(trueRadial, magVar), magVar);
    }
  }

  /**
   * Sets a reference radial for a user facility. If the reference facility is `null`, the user facility's stored value
   * for the distance will be used (if the stored value does not exist, then the distance will be set to zero).
   * @param facility A user facility.
   * @param reference The reference facility.
   * @param storedDistance The user facility's stored distance, in nautical miles, from the reference.
   * @param subject The subject to which to write the distance.
   */
  private setReferenceDistance(
    facility: UserFacility,
    reference: Facility | null,
    storedDistance: number | undefined,
    subject: NumberUnitSubject<UnitFamily.Distance>
  ): void {
    let distance: number;
    if (reference === null) {
      distance = storedDistance ?? 0;
    } else {
      distance = UnitType.GA_RADIAN.convertTo(GeoPoint.distance(facility.lat, facility.lon, reference?.lat, reference.lon), UnitType.NMILE);
    }

    subject.set(distance);
  }

  /** @inheritDoc */
  public onPause(): void {
    this.facilitySub?.pause();
  }

  /** @inheritDoc */
  public onResume(): void {
    this.facilitySub?.resume(true);
  }

  /** @inheritDoc */
  public onGtcInteractionEvent(): boolean {
    return false;
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <>
        <div class='user-info-tab user-info-info'>
          <div class={this.paramsPosSectionCssClass}>
            <div class='user-info-info-params-pos-type'>LAT / LON</div>
            <div class='user-info-info-params-pos-values'>
              <GarminLatLonDisplay
                value={this.props.waypointInfo.location}
                format={LatLonDisplayFormat.HDDD_MMmm}
                class='user-info-info-params-pos-coords'
              />
              <div class='user-info-info-params-pos-pos'>
                <div class='user-info-info-params-pos-field'>
                  <div class='user-info-info-params-pos-field-title'>DIS: </div>
                  <NumberUnitDisplay
                    value={this.props.waypointInfo.distance}
                    displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
                    formatter={GtcUserWaypointInfoInfoTab.DISTANCE_FORMATTER}
                  />
                </div>
                <div class='user-info-info-params-pos-field'>
                  <div class='user-info-info-params-pos-field-title'>BRG: </div>
                  <div class='user-info-bearing'>
                    <BearingDisplay
                      value={this.props.waypointInfo.bearing}
                      displayUnit={this.props.unitsSettingManager.navAngleUnits}
                      formatter={GtcUserWaypointInfoInfoTab.BEARING_FORMATTER}
                    />
                    <GtcBearingArrow
                      relativeBearing={this.props.waypointRelativeBearing}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class={this.paramsSectionCssClass}>
            <div class='user-info-info-params-type'>{this.type}</div>
            <div class='user-info-info-params-row'>
              <div class='user-info-info-params-ref'>{' 1)'}{this.ref1.map(ref => ref === null ? '______' : ref.icaoStruct.ident)}</div>
              <BearingDisplay
                value={this.rad1}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                formatter={GtcUserWaypointInfoInfoTab.BEARING_FORMATTER}
                class='user-info-info-params-rad'
              />
              <NumberUnitDisplay
                value={this.dis1}
                displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
                formatter={GtcUserWaypointInfoInfoTab.DISTANCE_FORMATTER}
                class={this.paramsDis1CssClass}
              />
            </div>
            <div class={this.paramsRow2CssClass}>
              <div class='user-info-info-params-ref'>{' 2)'}{this.ref2.map(ref => ref === null ? '______' : ref.icaoStruct.ident)}</div>
              <BearingDisplay
                value={this.rad2}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                formatter={GtcUserWaypointInfoInfoTab.BEARING_FORMATTER}
                class='user-info-info-params-rad'
              />
            </div>
          </div>
          <div class={this.posSectionCssClass}>
            <div class='user-info-info-field'>
              <div class='user-info-info-field-title'>BRG</div>
              <div class='user-info-bearing'>
                <BearingDisplay
                  value={this.props.waypointInfo.bearing}
                  displayUnit={this.props.unitsSettingManager.navAngleUnits}
                  formatter={GtcUserWaypointInfoInfoTab.BEARING_FORMATTER}
                />
                <GtcBearingArrow
                  relativeBearing={this.props.waypointRelativeBearing}
                />
              </div>
            </div>
            <div class='user-info-info-field'>
              <div class='user-info-info-field-title'>DIS</div>
              <NumberUnitDisplay
                value={this.props.waypointInfo.distance}
                displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
                formatter={GtcUserWaypointInfoInfoTab.DISTANCE_FORMATTER}
              />
            </div>
          </div>
          <GarminLatLonDisplay
            value={this.props.waypointInfo.location}
            format={LatLonDisplayFormat.HDDD_MMmm}
            class={this.coordsSectionCssClass}
          />
        </div>
        <GtcWaypointInfoNoWaypointMessage selectedWaypoint={this.props.waypoint as Subscribable<FacilityWaypoint<Facility> | null>}>
          No User Waypoint Available
        </GtcWaypointInfoNoWaypointMessage>
      </>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    if (this.thisNode !== undefined) {
      FSComponent.visitNodes(this.thisNode, node => {
        if (node !== this.thisNode && node.instance instanceof DisplayComponent) {
          node.instance.destroy();
          return true;
        } else {
          return false;
        }
      });
    }

    this.sidebarStateSub?.destroy();
    this.facilitySub?.destroy();

    super.destroy();
  }
}

/**
 * Component props for {@link GtcUserWaypointInfoListTab}.
 */
interface GtcUserWaypointInfoListTabProps extends GtcUserWaypointInfoTabContentProps {
  /** An array of all existing user waypoints. */
  userWaypoints: SubscribableArray<FacilityWaypoint<UserFacility>>;

  /** A callback function to execute when a user waypoint facility is selected from the tab's list. */
  onFacilitySelected: (facility: UserFacility) => void;
}

/**
 * An entry for the user waypoint information display waypoint list representing the Add User Waypoint button.
 */
type ListAddWaypointEntry = {
  /** Flags this object as an add waypoint entry object. */
  addWaypoint: true;
};

/**
 * A GTC user waypoint information display waypoint list tab.
 */
class GtcUserWaypointInfoListTab extends DisplayComponent<GtcUserWaypointInfoListTabProps> implements GtcUserWaypointInfoTabContent {
  private readonly listRef = FSComponent.createRef<GtcList<(FacilityWaypoint<UserFacility> | ListAddWaypointEntry) & DynamicListData>>();

  private readonly listItemHeight = this.props.gtcService.isHorizontal ? 130 : 69;

  private readonly listData = ArraySubject.create<(FacilityWaypoint<UserFacility> | ListAddWaypointEntry) & DynamicListData>([{ addWaypoint: true }]);

  private waypointsSub?: Subscription;

  /** @inheritDoc */
  public onAfterRender(): void {
    this.waypointsSub = this.props.userWaypoints.sub((index, type, item) => {
      switch (type) {
        case SubscribableArrayEventType.Added:
          if (Array.isArray(item)) {
            this.listData.insertRange(index, item);
          } else if (item !== undefined) {
            this.listData.insert(item as FacilityWaypoint<UserFacility>, index);
          }
          break;
        case SubscribableArrayEventType.Removed: {
          const end = index + (Array.isArray(item) ? item.length : 1);
          for (let i = index; i < end; i++) {
            this.listData.removeAt(index);
          }
          break;
        }
        case SubscribableArrayEventType.Cleared:
          this.listData.clear();
          this.listData.insert({ addWaypoint: true });
          break;
      }
    }, true);
  }

  /** @inheritDoc */
  public onPause(): void {
    // noop
  }

  /** @inheritDoc */
  public onResume(): void {
    this.listRef.instance.scrollToIndex(0, 0, false);
  }

  /** @inheritDoc */
  public onGtcInteractionEvent(event: GtcInteractionEvent): boolean {
    return this.listRef.instance.onGtcInteractionEvent(event);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <>
        <div class='user-info-tab user-info-list'>
          <GtcList
            ref={this.listRef}
            bus={this.props.gtcService.bus}
            data={this.listData}
            renderItem={data => {
              if ('addWaypoint' in data) {
                return (
                  <GtcListButton
                    label='Add User Waypoint'
                    fullSizeButton
                    onPressed={async () => {
                      const result = await this.props.gtcService.openPopup<GtcUserWaypointDialog>(GtcViewKeys.UserWaypointDialog, 'slideout-right-full')
                        .ref.request({});

                      if (!result.wasCancelled) {
                        this.props.onFacilitySelected(result.payload);
                      }
                    }}
                  />
                );
              } else {
                const ref = FSComponent.createRef<GtcWaypointDisplay>();
                return (
                  <GtcListButton
                    onPressed={() => { this.props.onFacilitySelected(data.facility.get()); }}
                    onDestroy={() => { ref.getOrDefault()?.destroy(); }}
                    touchButtonClasses='user-info-list-wpt-button'
                  >
                    <GtcWaypointDisplay ref={ref} waypoint={data} />
                  </GtcListButton>
                );
              }
            }}
            sidebarState={this.props.sidebarState}
            listItemHeightPx={this.listItemHeight}
            listItemSpacingPx={1}
            itemsPerPage={4}
            class='user-info-list-list'
          />
        </div>
      </>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.listRef.getOrDefault()?.destroy();

    this.waypointsSub?.destroy();

    super.destroy();
  }
}
