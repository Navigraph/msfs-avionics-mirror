/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ControlEvents, EventBus, ExtractSubjectTypes, NavEvents, NavSourceType, Publisher, SimVarValueType, Subject, Subscription } from '@microsoft/msfs-sdk';

import { NavBaseEvents, NavBaseFields } from './NavBase';
import { WTLineNavigationUserSettings } from './WTLineNavigationUserSettings';
import { NavSourceBase, NavSources } from './nav-sources/NavSourceBase';
import {
  NavIndicator, NavIndicatorControlEvents, NavIndicatorEvents, NavIndicators
} from './nav-indicators/NavIndicators';

/** The names of the available nav sources in the WT21. */
const navSourceNames = [
  'NAV1',
  'NAV2',
  'ADF',
  'FMS1',
  'FMS2'
] as const;

/** The names of the available nav sources in the WT21 for the course needle. */
const courseNeedleNavSourceNames = [
  'FMS1',
  'NAV1',
  'NAV2',
] as const;

/** The names of the nav indicators in the WT21. */
const navIndicatorNames = [
  'bearingPointer1',
  'bearingPointer2',
  'courseNeedle',
  'ghostNeedle'
] as const;

/** The names of the available nav sources in the WT21. */
export type WTLineNavSourceNames = typeof navSourceNames;
/** */
export type WTLineNavSourceName = WTLineNavSourceNames[number];
/** The names of the available nav sources in the WT21 for the course needle. */
export type WTLineCourseNeedleNavSourceNames = typeof courseNeedleNavSourceNames;
/** */
export type WTLineCourseNeedleNavSourceName = WTLineCourseNeedleNavSourceNames[number];
/** */
export type WTLineNavSource = NavSourceBase<WTLineNavSourceNames>;
/** */
export type WTLineNavSources = NavSources<WTLineNavSourceNames>;
/** */
export type WTLineCourseNeedleNavSources = NavSources<WTLineCourseNeedleNavSourceNames>;
/** */
export type WTLineCourseNeedleNavSource = NavSourceBase<WTLineCourseNeedleNavSourceNames>;

/** The names of the nav indicators in the WT21. */
export type WTLineNavIndicatorNames = typeof navIndicatorNames;
/** */
export type WTLineNavIndicatorName = WTLineNavIndicatorNames[number];
/** */
export type WTLineNavIndicator = NavIndicator<WTLineNavSourceNames>;
/** */
export type WTLineNavIndicators = NavIndicators<WTLineNavSourceNames, WTLineNavIndicatorNames>;

/** Field changed events for WT21 Nav Source fields. */
export type WTLineNavSourceEvents<Source extends WTLineNavSourceNames[number], Index extends number> =
  NavBaseEvents<`nav_src_${Source}_${Index}`, NavBaseFields>

/** Field changed events for WT21 Nav Indicator fields. */
export type WTLineNavIndicatorEvents<Indicator extends WTLineNavIndicatorNames[number]> =
  NavIndicatorEvents<WTLineNavSourceNames, Indicator>

/** Control events allowing setting values of WT21 Nav Indicator fields. */
type WT21NavIndicatorControlEvents<Indicator extends WTLineNavIndicatorNames[number], Fields extends { [key: string]: any } = {}> =
  NavIndicatorControlEvents<WTLineNavSourceNames, WTLineNavIndicatorNames, Indicator, Fields>

/** @inheritdoc */
export class WTLineCourseNeedleNavIndicator extends NavIndicator<WTLineNavSourceNames> {
  public readonly standbyPresetSource: Subject<WTLineNavSource>;
  public readonly standbyPresetSourceLabel = Subject.create('');
  private readonly standbySources: WTLineNavSource[] = [];
  private readonly navEventsPublisher: Publisher<NavEvents>;
  private standbySourceIndex = 0;

  /** NavIndicator constructor.
   * @param navSources The possible nav sources that could be pointed to.
   * @param isPfd Whether the instrument containing this nav indicator is a PFD"
   * @param bus The bus.
   */
  public constructor(navSources: WTLineNavSources, isPfd: boolean, readonly bus: EventBus) {
    super(navSources, 'FMS1');

    this.navEventsPublisher = this.bus.getPublisher<NavEvents>();

    this.standbySources = [
      this.navSources.get('NAV1'),
      this.navSources.get('NAV2'),
    ];
    this.standbyPresetSource = Subject.create(this.getStandbySource());

    this.updateStandbySource();

    if (isPfd) {
      this.source.sub(x => this.handleSourceChange(x!), true);

      this.bus.getSubscriber<ControlEvents>().on('cdi_src_set').handle((src) => {
        if (src.type === NavSourceType.Gps) {
          this.setNewSource('FMS1');
        } else if (src.type === NavSourceType.Nav) {
          this.setNewSource(`NAV${src.index}` as 'NAV1' | 'NAV2');
        }
      });
    }
  }

  public readonly setNewSource = (newSourceName: WTLineCourseNeedleNavSourceName): void => {
    if (this.source.get()!.name === newSourceName) { return; }
    if (this.standbySources[this.standbySourceIndex].name === newSourceName) {
      this.navSwap();
    } else {
      this.presetIncrease();
      this.navSwap();
    }
  };

  private readonly handleSourceChange = (newSource: NavSourceBase<WTLineNavSourceNames>): void => {
    SimVar.SetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool, newSource.getType() === NavSourceType.Gps);
    if (newSource.getType() === NavSourceType.Nav) {
      SimVar.SetSimVarValue('AUTOPILOT NAV SELECTED', SimVarValueType.Number, newSource.index);
    }

    // Publishing this so AP stuff can use it on the FMC.
    this.navEventsPublisher.pub('cdi_select', {
      index: newSource.index,
      type: newSource.getType(),
    }, true);
  };

  public readonly navSwap = (): void => {
    const activeSource = this.source.get()!;
    const newActiveSource = this.getStandbySource();
    this.setSource(newActiveSource.name);
    this.standbySources[this.standbySourceIndex] = activeSource;
    this.updateStandbySource();
  };

  public readonly presetIncrease = (): void => {
    this.standbySourceIndex++;
    if (this.standbySourceIndex === this.standbySources.length) {
      this.standbySourceIndex = 0;
    }
    this.updateStandbySource();
  };

  public readonly presetDecrease = (): void => {
    this.standbySourceIndex--;
    if (this.standbySourceIndex < 0) {
      this.standbySourceIndex = this.standbySources.length - 1;
    }
    this.updateStandbySource();
  };

  // eslint-disable-next-line jsdoc/require-jsdoc
  private getStandbySource(): WTLineNavSource {
    return this.standbySources[this.standbySourceIndex];
  }

  private updateStandbySourceLabelSub?: Subscription;

  // eslint-disable-next-line jsdoc/require-jsdoc
  private updateStandbySource(): void {
    this.updateStandbySourceLabelSub?.destroy();
    this.standbyPresetSource.set(this.getStandbySource());
    this.updateStandbySourceLabelSub = this.standbyPresetSource.get().isLocalizer.sub(this.updateStandbySourceLabel);
    this.updateStandbySourceLabel();
  }

  private readonly updateStandbySourceLabel = (): void => {
    this.standbyPresetSourceLabel.set(this.createStandbySourceLabel());
  };

  // eslint-disable-next-line jsdoc/require-jsdoc
  private createStandbySourceLabel(): string {
    const source = this.getStandbySource();
    if (source.getType() === NavSourceType.Nav) {
      if (source.isLocalizer.get()) {
        return 'LOC' + source.index;
      } else {
        return 'VOR' + source.index;
      }
    } else {
      return 'FMS' + source.index;
    }
  }
}

/** Events for controlling the ghost needle. */
export type WTLineGhostNeedleControlEvents =
  WT21NavIndicatorControlEvents<'ghostNeedle', ExtractSubjectTypes<Pick<WTLineGhostNeedleNavIndicator, 'isArmed' | 'isVisible'>>>

/** @inheritdoc */
export class WTLineGhostNeedleNavIndicator extends NavIndicator<WTLineNavSourceNames> {
  /** Nav-to-nav is armed and we are receiving a localizer signal. */
  public readonly isArmed = Subject.create(false);
  /** If nav-to-nav is armed and waiting for a localizer signal. */
  public readonly isVisible = Subject.create(false);

  /** NavIndicator constructor.
   * @param navSources The possible nav sources that could be pointed to.
   * @param bus The bus.
   */
  public constructor(navSources: WTLineNavSources, private readonly bus: EventBus) {
    super(navSources, 'NAV1');

    const ghostControl = this.bus.getSubscriber<WTLineGhostNeedleControlEvents>();
    ghostControl.on('nav_ind_ghostNeedle_set_isArmed').handle(this.isArmed.set.bind(this.isArmed));
    ghostControl.on('nav_ind_ghostNeedle_set_isVisible').handle(this.isVisible.set.bind(this.isVisible));

    this.isArmed.sub(this.updateVisibility, true);
    this.hasLocalizer.sub(this.updateVisibility, true);
  }

  private readonly updateVisibility = (): void => {
    const shouldBeVisible = this.isArmed.get() && this.hasLocalizer.get();
    this.isVisible.set(!!shouldBeVisible);
  };
}

// eslint-disable-next-line jsdoc/require-jsdoc
type WT21BearingPointer1ControlEvents = WT21NavIndicatorControlEvents<'bearingPointer1'>;
// eslint-disable-next-line jsdoc/require-jsdoc
type WT21BearingPointer2ControlEvents = WT21NavIndicatorControlEvents<'bearingPointer2'>;

/** Events for controlling the WT21 bearing pointers. Sync should always be true for these events. */
export type WTLineBearingPointerControlEvents = WT21BearingPointer1ControlEvents & WT21BearingPointer2ControlEvents;

/** @inheritdoc */
export class WTLineBearingPointerNavIndicator extends NavIndicator<WTLineNavSourceNames> {

  /** @inheritdoc */
  public constructor(
    navSources: NavSources<WTLineNavSourceNames>,
    bus: EventBus,
    public readonly index: 1 | 2,
    sourceName: WTLineNavSourceNames[number] | null = null,
  ) {
    super(navSources, sourceName);

    // If the source is tuned to a localizer, then turn the bearing pointer off
    this.isLocalizer.sub(isLocalizer => {
      if (this.source.get() !== null && isLocalizer) {
        this.setSource(null);
      }
    });

    const bearingControl = bus.getSubscriber<WTLineBearingPointerControlEvents>();
    // TODO Find a fancy way to have the NavIndicator base class handle this event
    bearingControl.on(`nav_ind_bearingPointer${index}_set_source`).handle(newSource => {
      this.setSource(newSource);
    });

    const navIndicatorSettings = WTLineNavigationUserSettings.getManager(bus);
    const bearingPointerSourceSetting = navIndicatorSettings.getSetting(`bearingPointer${index}Source`);

    const loadedSource = bearingPointerSourceSetting.value === false ? null : bearingPointerSourceSetting.value;
    this.setSource(loadedSource);

    this.source.sub(x => {
      bearingPointerSourceSetting.value = x === null ? false : x.name;
    });
  }
}
