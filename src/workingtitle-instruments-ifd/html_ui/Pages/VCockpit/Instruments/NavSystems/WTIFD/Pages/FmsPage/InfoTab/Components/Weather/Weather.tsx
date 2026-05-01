import {
  ClockEvents,
  ComponentProps,
  ConsumerSubject,
  EventBus,
  Facility,
  FacilityLoader,
  FSComponent,
  LifecycleComponent,
  Metar,
  Subject,
  Subscribable,
  Subscription,
  Taf,
  VNode,
} from '@microsoft/msfs-sdk';
import { InfoGroup } from '../InfoGroup';
import { InfoItem } from '../InfoItem';
import { WeatherTafInfoRow } from './WeatherTafInfoRow';
import { WeatherMetarInfoRow } from './WeatherMetarInfoRow';
import { InfoTabGroupId } from '../../InfoTabIds';

import './Weather.css';

/** The properties for the {@link Weather} component. */
interface WeatherProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The InfoTab Facility. */
  readonly infoFacility: Subscribable<Facility | undefined>;
  /** The Facility loader */
  readonly facLoader: FacilityLoader;
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

/** The weather info of the info tab */
export class Weather extends LifecycleComponent<WeatherProps> {
  private metar = Subject.create<Metar | undefined>(undefined);
  private taf = Subject.create<Taf | undefined>(undefined);

  private readonly simTimeMs = ConsumerSubject.create<number>(
    null,
    0,
  ).withLifecycle(this.defaultLifecycle);

  private simTimeSub?: Subscription;
  private currentIdent?: string;

  private readonly selectedIndex = Subject.create(0);
  private readonly isExpanded = this.props.expandedGroupId
    .map((id) => id === this.props.groupId)
    .withLifecycle(this.defaultLifecycle);

  private readonly metarRowRef = FSComponent.createRef<HTMLDivElement>();
  private readonly tafRowRef = FSComponent.createRef<HTMLDivElement>();
  private readonly windsAloftRowRef = FSComponent.createRef<HTMLDivElement>();
  private readonly tempsAloftRowRef = FSComponent.createRef<HTMLDivElement>();

  private static readonly METAR_UPDATE_PERIOD_MS = 30_000;
  private static readonly TAF_UPDATE_PERIOD_MS = 60_000;

  private lastMetarUpdateMs = 0;
  private lastTafUpdateMs = 0;

  private isUpdatingMetar = false;
  private isUpdatingTaf = false;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.simTimeMs.setConsumer(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('simTime')
        .atFrequency(1 / 30),
    );
    this.simTimeSub = this.simTimeMs
      .sub(this.updateWeatherData.bind(this), true)
      .withLifecycle(this.defaultLifecycle);

    this.props.infoFacility
      .sub((fac) => {
        this.simTimeSub?.pause();

        if (!fac || fac.icaoStruct.type !== 'A') {
          this.currentIdent = undefined;
          this.metar.set(undefined);
          this.taf.set(undefined);
          return;
        }
        this.currentIdent = fac.icaoStruct.ident;

        this.simTimeSub?.resume(true);
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.isExpanded
      .sub((expanded) => {
        if (expanded) {
          this.ensureSelectionValid();
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.metarRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onMetarRowClicked);
    this.tafRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onTafRowClicked);
    this.windsAloftRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onWindsAloftRowClicked);
    this.tempsAloftRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onTempsAloftRowClicked);
  }

  /**
   * Determines whether the item at the given index is visible.
   * @param index The index to check.
   * @returns Whether the item at the given index is visible.
   */
  private isItemVisible(index: number): boolean {
    return index >= 0 && index <= 3;
  }

  /**
   * Ensures that the current selection is valid.
   */
  private ensureSelectionValid(): void {
    let index = this.selectedIndex.get();

    if (this.isItemVisible(index)) {
      return;
    }

    index = 0;
    this.selectedIndex.set(index);
  }

  /**
   * Finds the next selectable index in the given direction.
   * @param start The starting index.
   * @param delta The direction to search in.
   * @returns The next selectable index.
   */
  private findNextSelectableIndex(start: number, delta: number): number {
    const direction = delta > 0 ? 1 : -1;
    let next = start;

    for (let i = 0; i < 16; i++) {
      next = next + direction;

      if (next < 0) {
        next = 0;
      }

      if (next > 3) {
        next = 3;
      }

      if (this.isItemVisible(next)) {
        return next;
      }

      if (next === 0 || next === 3) {
        break;
      }
    }

    return start;
  }

  /**
   * Moves the selection by the given delta.
   * @param delta The delta to move the selection by.
   */
  public moveSelectionBy(delta: number): void {
    this.ensureSelectionValid();

    const current = this.selectedIndex.get();
    const next = this.findNextSelectableIndex(current, delta);

    if (next !== current) {
      this.selectedIndex.set(next);
    }
  }

  /**
   * Activates the current selection.
   */
  public activateSelection(): void {
    this.ensureSelectionValid();

    const index = this.selectedIndex.get();

    if (index === 0 || index === 1) {
      // METAR / TAF: toggle expand icon (WeatherInfoRow handles it)
      const el =
        index === 0
          ? this.metarRowRef.getOrDefault()
          : this.tafRowRef.getOrDefault();

      const icon = el?.querySelector(
        '.weather-expand-icon',
      ) as HTMLElement | null;

      if (icon && icon.classList.contains('hidden') === false) {
        icon.click();
        return;
      }
    }

    // Otherwise collapse section (same idea as GeneralInfo)
    this.props.setExpandedGroupId(null);
  }

  /**
   * Selects the given index if it is visible.
   * @param index The index to select.
   */
  private selectIndexIfVisible(index: number): void {
    if (this.isItemVisible(index)) {
      this.selectedIndex.set(index);
    }
  }

  private readonly onMetarRowClicked = (): void => {
    this.selectIndexIfVisible(0);
  };

  private readonly onTafRowClicked = (): void => {
    this.selectIndexIfVisible(1);
  };

  private readonly onWindsAloftRowClicked = (): void => {
    this.selectIndexIfVisible(2);
  };

  private readonly onTempsAloftRowClicked = (): void => {
    this.selectIndexIfVisible(3);
  };

  /** Updates the weather data. */
  private async updateWeatherData(): Promise<void> {
    if (!this.currentIdent) {
      return;
    }
    const nowMs = this.simTimeMs.get() ?? 0;
    const ident = this.currentIdent;

    const shouldUpdateMetar =
      this.isUpdatingMetar === false &&
      nowMs - this.lastMetarUpdateMs >= Weather.METAR_UPDATE_PERIOD_MS;

    const shouldUpdateTaf =
      this.isUpdatingTaf === false &&
      nowMs - this.lastTafUpdateMs >= Weather.TAF_UPDATE_PERIOD_MS;

    // Run sequentially to avoid races on shared state  to limit loader pressure
    if (shouldUpdateMetar) {
      this.isUpdatingMetar = true;
      try {
        await this.updateMetarData(ident);
      } finally {
        this.isUpdatingMetar = false;
        this.lastMetarUpdateMs = nowMs;
      }
    }

    if (shouldUpdateTaf) {
      this.isUpdatingTaf = true;
      try {
        await this.updateTafData(ident);
      } finally {
        this.isUpdatingTaf = false;
        this.lastTafUpdateMs = nowMs;
      }
    }
  }

  /**
   * Update the METAR data for the given ident.
   * @param ident The ident of the facility to update the METAR data for.
   */
  private async updateMetarData(ident: string): Promise<void> {
    try {
      this.metar.set(await this.props.facLoader.getMetar(ident));
    } catch (e) {
      console.error('[Weather] Error getting METAR data: ', e);
      this.metar.set(undefined);
    }
  }

  /**
   * Update the TAF data for the given ident.
   * @param ident The ident of the facility to update the TAF data for.
   */
  private async updateTafData(ident: string): Promise<void> {
    try {
      this.taf.set(await this.props.facLoader.getTaf(ident));
    } catch (e) {
      console.error('[Weather] Error getting TAF data: ', e);
      this.taf.set(undefined);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <InfoGroup
        label="Weather"
        groupId={this.props.groupId}
        expandedGroupId={this.props.expandedGroupId}
        setExpandedGroupId={this.props.setExpandedGroupId}
        isSelected={this.props.isSelected}
        onHeaderClicked={this.props.onHeaderClicked}
      >
        <div ref={this.metarRowRef}>
          <WeatherMetarInfoRow
            bus={this.props.bus}
            metar={this.metar}
            isSelected={this.selectedIndex
              .map((i) => i === 0)
              .withLifecycle(this.defaultLifecycle)}
          />
        </div>

        <div ref={this.tafRowRef}>
          <WeatherTafInfoRow
            bus={this.props.bus}
            taf={this.taf}
            isSelected={this.selectedIndex
              .map((i) => i === 1)
              .withLifecycle(this.defaultLifecycle)}
          />
        </div>

        <div ref={this.windsAloftRowRef}>
          <InfoItem
            class="weather-item"
            isSelected={this.selectedIndex
              .map((i) => i === 2)
              .withLifecycle(this.defaultLifecycle)}
          >
            <div>Winds Aloft - Not Available</div>
          </InfoItem>
        </div>

        <div ref={this.tempsAloftRowRef}>
          <InfoItem
            class="weather-item"
            isSelected={this.selectedIndex
              .map((i) => i === 3)
              .withLifecycle(this.defaultLifecycle)}
          >
            <div>Temps Aloft - Not Available</div>
          </InfoItem>
        </div>
      </InfoGroup>
    );
  }

  /**
   * @inheritdoc
   */
  public destroy(): void {
    this.metarRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onMetarRowClicked);
    this.tafRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onTafRowClicked);
    this.windsAloftRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onWindsAloftRowClicked);
    this.tempsAloftRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onTempsAloftRowClicked);

    super.destroy();
  }
}
