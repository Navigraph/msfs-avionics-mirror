import {
  AirportFacility,
  ArraySubject,
  ComponentProps,
  DebounceTimer,
  EventBus,
  Facility,
  FacilityType,
  FSComponent,
  ICAO,
  LifecycleComponent,
  NdbFacility,
  Subject,
  Subscribable,
  UnitType,
  VNode,
  VorFacility,
  VorType,
} from '@microsoft/msfs-sdk';

import { InfoGroup } from './InfoGroup';
import { InfoItem } from './InfoItem';
import { DynamicListData, IfdList } from '../../../../Components/List';
import { IfdNearestContext } from '../../../../Navigation/IfdNearestContext';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { InfoTabGroupId } from '../InfoTabIds';

import './NearbyNavaids.css';

/** The properties for the {@link NearbyNavaids} component. */
interface NearbyNavaidsProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The InfoTab Facility  */
  readonly infoFacility: Subscribable<Facility | undefined>;
  /** Nearest context */
  readonly nearestContext: IfdNearestContext;
  /** The group ID. */
  readonly groupId: InfoTabGroupId;
  /** The expanded group ID. */
  readonly expandedGroupId: Subscribable<InfoTabGroupId | null>;
  /** Sets the expanded group ID. */
  readonly setExpandedGroupId: (id: InfoTabGroupId | null) => void;
  /** Whether this group is currently selected by knob navigation. */
  readonly isSelected: Subscribable<boolean>;
  /** Called when the group header is clicked. */
  readonly onHeaderClicked?: () => void;
}

/** Interface for Communications list data. */
interface NearbyNavaidsListData extends DynamicListData {
  /** Navaid identifier */
  readonly name: string;
  /** Navaid icon */
  readonly icon: string;
  /** Distance from the info fix */
  readonly distance: number;
  /** Cardinal direction from the info fix */
  readonly direction: string;
  /** The navaid frequency. */
  readonly freqValue: number;
  /** Whether the freq should be shown in KHz. */
  readonly freqInKHz: boolean;
  /** Index for selection. */
  readonly index: number;
}

/** Interface for NearestNavaid list data*/
export interface NearbyNavaidInfo {
  /** The underlying facility */
  readonly facility: Facility;
  /** Distance from the info-page fix in nautical miles. */
  readonly distanceNm: number;
  /** True bearing from the info-page fix in degrees. */
  readonly bearingDeg: number;
  /** Cardinal direction from the fix */
  readonly cardinal: string;
  /** The frequency, in MHz. */
  readonly freqMHz: number;
}

/** The general info of the info tab */
export class NearbyNavaids extends LifecycleComponent<NearbyNavaidsProps> {
  private readonly nearbyNavaidData =
    ArraySubject.create<NearbyNavaidsListData>([]);
  private readonly numberOfItems = Subject.create(0);
  private readonly itemCount = Subject.create(0);
  private readonly selectedIndex = Subject.create(0);

  private readonly collapsedLabel = Subject.create('');
  private readonly unitSettingManager = UnitsUserSettings.getManager(
    this.props.bus,
  );
  private readonly distanceUnitDisplay =
    this.unitSettingManager.distanceUnitsLarge
      .map((v) => (v === UnitType.NMILE ? 'NM' : 'KM'))
      .withLifecycle(this.defaultLifecycle);

  private readonly listRef =
    FSComponent.createRef<IfdList<NearbyNavaidsListData>>();
  private readonly listClickRef = FSComponent.createRef<HTMLDivElement>();

  private static readonly LIST_ITEM_HEIGHT_PX = 35;
  private static readonly LIST_ITEM_SPACING_PX = 3;
  private static readonly LIST_VIEWPORT_HEIGHT_PX = 220;

  private readonly listHeightPx = Subject.create(
    NearbyNavaids.LIST_VIEWPORT_HEIGHT_PX,
  );
  private readonly itemsPerPage = Subject.create(1);

  private readonly ensureInViewTimer = new DebounceTimer();

  /**
   * Moves the selected inner item by the given delta.
   * @param delta The delta to move by (+1 / -1).
   */
  public moveSelectionBy(delta: number): void {
    const count = this.itemCount.get();

    if (count > 0) {
      const current = this.selectedIndex.get();
      const next = Math.max(0, Math.min(count - 1, current + delta));

      if (next !== current) {
        this.selectedIndex.set(next);
        this.syncCollapsedLabelToSelection();
        this.scheduleEnsureSelectedInView();
      }
    }
  }

  /**
   * Ensures the currently selected item is visible in the list viewport.
   * Debounced to avoid excessive scroll work during fast knob spinning.
   */
  private scheduleEnsureSelectedInView(): void {
    this.ensureInViewTimer.schedule(() => {
      const index = this.selectedIndex.get();
      this.listRef.getOrDefault()?.scrollToIndex(index, 'closest', false, true);
    }, 0);
  }

  /**
   * Syncs the collapsed label to the currently selected item.
   */
  private syncCollapsedLabelToSelection(): void {
    const data = this.nearbyNavaidData.getArray();
    const index = this.selectedIndex.get();

    const item = data[index];
    if (item) {
      const freqText = item.freqInKHz
        ? `${item.freqValue.toFixed(0)}KHz`
        : item.freqValue.toFixed(2);

      const distText = `${item.distance.toFixed(1)}${this.distanceUnitDisplay.get()}`;
      this.collapsedLabel.set(
        `${item.name} ${freqText} ${distText} ${item.direction}`,
      );
    } else {
      this.collapsedLabel.set('');
    }
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const itemHeight = NearbyNavaids.LIST_ITEM_HEIGHT_PX;
    const spacing = NearbyNavaids.LIST_ITEM_SPACING_PX;

    this.listHeightPx
      .sub((heightPx) => {
        const rows = Math.floor((heightPx + spacing) / (itemHeight + spacing));
        this.itemsPerPage.set(Math.max(1, rows));
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.props.infoFacility
      .sub((fac) => {
        const isAirport =
          !!fac &&
          ICAO.getFacilityTypeFromValue(fac.icaoStruct) ===
            FacilityType.Airport;

        if (isAirport) {
          const distanceUnit = this.unitSettingManager.distanceUnitsLarge.get();

          void this.props.nearestContext
            .getNearbyNavaidsForAirport(fac as AirportFacility)
            .then((nearby) => {
              const data: NearbyNavaidsListData[] = nearby.map(
                (navaid, index) => {
                  const distance =
                    distanceUnit === UnitType.NMILE
                      ? navaid.distanceNm
                      : UnitType.NMILE.convertTo(
                          navaid.distanceNm,
                          UnitType.KILOMETER,
                        );

                  return {
                    direction: navaid.cardinal,
                    distance,
                    heightPx: NearbyNavaids.LIST_ITEM_HEIGHT_PX,
                    name: navaid.facility.icaoStruct.ident,
                    icon: this.getNavaidIcon(navaid.facility),
                    freqValue: navaid.freqMHz,
                    freqInKHz: this.isNdbFacility(navaid.facility),
                    index,
                    isVisible: Subject.create(true),
                  };
                },
              );

              this.nearbyNavaidData.set(data);
              this.numberOfItems.set(data.length);
              this.itemCount.set(data.length);

              // Reset selection on new facility / new data
              this.selectedIndex.set(0);

              this.syncCollapsedLabelToSelection();
              this.scheduleEnsureSelectedInView();
            });
        } else {
          this.nearbyNavaidData.clear();
          this.numberOfItems.set(0);
          this.itemCount.set(0);
          this.selectedIndex.set(0);
          this.collapsedLabel.set('');
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.listClickRef.instance.addEventListener('click', this.onListClicked);
  }

  /**
   * Type guard: checks if a Facility is a VorFacility.
   * Uses ICAO.isIcaoTypeFacility under the hood.
   * @param fac The Facility to check.
   * @returns True if the Facility is a VorFacility, false otherwise.
   */
  private isVorFacility(fac: Facility): fac is VorFacility {
    return ICAO.isIcaoTypeFacility(fac.icaoStruct.type, FacilityType.VOR);
  }

  /**
   * Type guard: checks if a Facility is a VorFacility.
   * Uses ICAO.isIcaoTypeFacility under the hood.
   * @param fac The Facility to check.
   * @returns True if the Facility is a VorFacility, false otherwise.
   */
  private isNdbFacility(fac: Facility): fac is NdbFacility {
    return ICAO.isIcaoTypeFacility(fac.icaoStruct.type, FacilityType.NDB);
  }

  /**
   * Returns an icon path basing on the facility type
   * @param fac VOR or NDB Facility
   * @returns A path to the icon
   */
  private getNavaidIcon(fac: Facility): string {
    if (this.isVorFacility(fac)) {
      switch (fac.type) {
        case VorType.VOR:
          return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/vor.png';
        case VorType.VORTAC:
          return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/vortac.png';
        case VorType.TACAN:
          return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/tacan.png';
        case VorType.VORDME:
          return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/vordme.png';
        case VorType.DME:
          return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/dme.png';
        default:
          return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/vor.png';
      }
    }

    if (ICAO.getFacilityTypeFromValue(fac.icaoStruct) === FacilityType.NDB) {
      return 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/ndb.png';
    }

    return '';
  }

  /**
   * Handles click selection inside the nearby navaids list via event delegation.
   * @param e The mouse event.
   */
  private readonly onListClicked = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;

    if (target) {
      const itemEl = target.closest(
        '.nearby-navaids-item',
      ) as HTMLElement | null;

      if (itemEl) {
        const indexStr = itemEl.dataset.index;

        if (indexStr !== undefined) {
          const index = Number(indexStr);

          if (Number.isFinite(index)) {
            const clamped = Math.max(
              0,
              Math.min(this.itemCount.get() - 1, index),
            );

            this.selectedIndex.set(clamped);
            this.syncCollapsedLabelToSelection();
            this.scheduleEnsureSelectedInView();
          }
        }
      }
    }
  };

  /** @inheritDoc */
  public render(): VNode {
    return (
      <InfoGroup
        label="Nearby Navaids"
        summaryNode={() => <span>{this.collapsedLabel}</span>}
        hidden={this.numberOfItems
          .map((v) => v === 0)
          .withLifecycle(this.defaultLifecycle)}
        groupId={this.props.groupId}
        expandedGroupId={this.props.expandedGroupId}
        setExpandedGroupId={this.props.setExpandedGroupId}
        isSelected={this.props.isSelected}
        onHeaderClicked={this.props.onHeaderClicked}
      >
        <div ref={this.listClickRef}>
          <IfdList<NearbyNavaidsListData>
            ref={this.listRef}
            bus={this.props.bus}
            data={this.nearbyNavaidData}
            heightPx={this.listHeightPx}
            listItemHeightPx={NearbyNavaids.LIST_ITEM_HEIGHT_PX}
            listItemSpacingPx={NearbyNavaids.LIST_ITEM_SPACING_PX}
            itemsPerPage={this.itemsPerPage}
            renderScrollBar={false}
            maxOverscrollPx={0}
            renderItem={(item) => (
              <InfoItem
                class="nearby-navaids-item"
                dataIndex={item.index}
                isSelected={this.selectedIndex
                  .map((i) => i === item.index)
                  .withLifecycle(this.defaultLifecycle)}
              >
                <div class="navaid-icon">
                  <img src={item.icon} />
                </div>
                <div class="navaid-name">{item.name}</div>
                <div class="navaid-dist">
                  {item.distance.toFixed(1)}
                  <span class="navaid-dist-unit">
                    {this.distanceUnitDisplay}
                  </span>
                </div>
                <div class="navaid-direction">{item.direction}</div>
                <div class="navaid-freq">
                  {item.freqValue.toFixed(item.freqInKHz ? 0 : 2)}
                  <span class={{ hidden: !item.freqInKHz }}>KHz</span>
                </div>
              </InfoItem>
            )}
          />
        </div>
      </InfoGroup>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.listClickRef
      .getOrDefault()
      ?.removeEventListener('click', this.onListClicked);
    this.ensureInViewTimer.clear();

    super.destroy();
  }
}
