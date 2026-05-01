import {
  ComponentProps, ConsumerSubject, DebounceTimer, EventBus, FSComponent, LifecycleComponent, MappedSubject, NavEvents, Subject, SubscribableMapFunctions,
  VNavEvents, VNavPathMode, VNavUtils, VNode
} from '@microsoft/msfs-sdk';

import { IconLineArrow } from '../../Assets/SVGs/IconLineArrow';
import { FlightPlanStore } from '../../FlightPlan';
import { ActiveNavSourceEvents } from '../../Navigation/ActiveNavSourceManager';
import { IfdApproachEvents } from '../../Navigation/IfdApproachManager';
import { IfdNavMode } from '../../Navigation/Sources/IfdNavSources';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../Utilities/FormatUtils';

import './NavSourceBlock.css';

/** Props for {@link NavSourceBlock} */
interface NavSourceBlockProps extends ComponentProps {
  /** An instance of the EventBus */
  bus: EventBus;
  /** The VNAV index to use. */
  vnavIndex: number;
  /** The flight plan store to use. */
  store: FlightPlanStore;
}

/**
 * Displays the CDI Nav Source in the top right of the IFD
 */
export class NavSourceBlock extends LifecycleComponent<NavSourceBlockProps> {
  private static readonly OBS_COURSE_BOXED_TIME = 4000;
  private static readonly SOURCE_CHANGE_FLASH_TIME = 4000;

  private readonly sub = this.props.bus.getSubscriber<ActiveNavSourceEvents & IfdApproachEvents & VNavEvents & NavEvents>();

  private readonly pendingOrActiveMode = ConsumerSubject.create(this.sub.on('pending_or_active_mode'), IfdNavMode.GPS).withLifecycle(this.defaultLifecycle);
  private readonly pendingOrArmedMode = ConsumerSubject.create<IfdNavMode | null>(this.sub.on('pending_or_armed_mode'), null).withLifecycle(this.defaultLifecycle);

  private readonly activeApproachMode = ConsumerSubject.create(this.sub.on('active_approach_mode'), null).withLifecycle(this.defaultLifecycle);
  private readonly armedApproachMode = ConsumerSubject.create(this.sub.on('armed_approach_mode'), null).withLifecycle(this.defaultLifecycle);

  private readonly enrouteVnavPathMode = ConsumerSubject.create(this.sub.on(`vnav_path_mode${VNavUtils.getEventBusTopicSuffix(this.props.vnavIndex)}`), VNavPathMode.None);

  private readonly isActiveCdiValid = ConsumerSubject.create(this.sub.on('active_cdi_valid'), false).withLifecycle(this.defaultLifecycle);

  private readonly obsCourse = ConsumerSubject.create(this.sub.on('gps_obs_value'), 0).withLifecycle(this.defaultLifecycle);

  private readonly activeNavSource = MappedSubject.create(
    ([activeMode, activeApproach, enrouteVnavMode]) => activeApproach !== null && activeMode === IfdNavMode.GPS ? activeApproach : (enrouteVnavMode === VNavPathMode.PathActive && activeMode === IfdNavMode.GPS ? 'GPS+V' : activeMode),
    this.pendingOrActiveMode,
    this.activeApproachMode,
    this.enrouteVnavPathMode,
  ).withLifecycle(this.defaultLifecycle);
  private readonly armedNavSource = MappedSubject.create(
    ([armedMode, armedApproach]) => armedApproach !== null ? armedApproach : armedMode,
    this.pendingOrArmedMode,
    this.armedApproachMode,
  ).withLifecycle(this.defaultLifecycle);

  private readonly noArmedMode = this.armedNavSource.map((v) => v === null).withLifecycle(this.defaultLifecycle);

  private readonly isArrowHidden = MappedSubject.create(
    ([armedSource, activeSource]) => armedSource === null && activeSource !== IfdNavMode.OBS,
    this.armedNavSource,
    this.activeNavSource,
  ).withLifecycle(this.defaultLifecycle);

  private readonly isObsCourseBoxed = Subject.create(false);
  private readonly obsCourseUnboxTimer = new DebounceTimer();
  private readonly obsCourseText = BearingFormatter.createFromNumber(
    this.obsCourse,
    UnitsNavAngleSettingMode.Magnetic,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
    this.props.store,
  ).withLifecycle(this.defaultLifecycle);

  private readonly isNavSourceFlashing = Subject.create(false);
  private readonly navSourceFlashOffTimer = new DebounceTimer();

  /** @inheritdoc */
  onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.obsCourse.sub(() => {
      if (this.activeNavSource.get() === IfdNavMode.OBS) {
        this.boxObsCourse();
      }
    }, true).withLifecycle(this.defaultLifecycle);

    const turnFlashOff = (): void => this.isNavSourceFlashing.set(false);
    this.activeNavSource.sub((v) => {
      if (v === IfdNavMode.OBS) {
        this.obsCourseText.resume();
      } else {
        this.unboxObsCourse();
        this.obsCourseText.pause();
      }

      this.isNavSourceFlashing.set(true);
      this.navSourceFlashOffTimer.schedule(turnFlashOff, NavSourceBlock.SOURCE_CHANGE_FLASH_TIME);
    }).withLifecycle(this.defaultLifecycle);
  }

  /** Shows the OBS course to be boxed for a short time. */
  private boxObsCourse(): void {
    this.isObsCourseBoxed.set(true);
    this.obsCourseUnboxTimer.schedule(this.unboxObsCourse, NavSourceBlock.OBS_COURSE_BOXED_TIME);
  }

  private unboxObsCourse = (): void => {
    this.isObsCourseBoxed.set(false);
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{ 'wt-ifd-nav-source-block': true, 'flash': this.isNavSourceFlashing }}>
        <div class={{ 'wt-ifd-nav-source-primary-container': true, 'invalid': this.isActiveCdiValid.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle) }}>
          {this.activeNavSource}
        </div>
        <IconLineArrow
          class={{
            'wt-ifd-nav-source-arrow-container': true,
            'hidden': this.isArrowHidden,
          }}
          fillColor={'var(--wtdyne-color-mint)'}
        />
        <div class={{ 'wt-ifd-nav-source-armed-container': true, 'wtdyne-text-cyan': true, 'hidden': this.noArmedMode }}>
          {this.armedNavSource}
        </div>
        <div
          class={{
            'wt-ifd-nav-source-obs-course': true,
            'wtdyne-text-cyan': true,
            'hidden': this.pendingOrActiveMode.map((v) => v !== IfdNavMode.OBS).withLifecycle(this.defaultLifecycle),
            'boxed': this.isObsCourseBoxed,
          }}
        >
          {this.obsCourseText.fullLabel}
        </div>
      </div>
    );
  }
}
