import {
  AiracCycleFormatter, ClockEvents, ComponentProps, ConsumerSubject, DateTimeFormatter, DisplayComponent, EventBus, FacilityLoader, FSComponent, MappedSubject, VNode,
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IfdInteractions } from '../Events/IfdInteractionEvent';
import { LineSelectKeyButton } from '../LineSelectKeyButtons';
import { LskUtils } from '../LineSelectKeyButtons/LskUtils';
import { IfdPageName } from '../Pages/IfdPage';
import { IfdViewService } from '../ViewService';
import { IfdStartupManager, StartupState } from './IfdStartupManager';
import { IfdOptions } from '../IfdOptions';

import './IfdStartupScreen.css';

/** Props for {@link IfdStartupScreen} */
interface IfdStartupScreenProps extends ComponentProps {
  /** An instance of the EventBus */
  bus: EventBus;
  /** The IFD view service. */
  viewService: IfdViewService;
  /** Startup Manager */
  startupManager: IfdStartupManager;
  /** The default page to open after confirmation screen **/
  ifdPageName: IfdPageName;
  /** The IFD configuration options. */
  ifdOptions: IfdOptions;
}

/**
 * IfdStartupScreen - Displays the Avidyne logo splash and startup confirmation screen
 */
export class IfdStartupScreen extends DisplayComponent<IfdStartupScreenProps> {
  private readonly version = '__IFD_PACKAGE_VERSION__';
  private simTimeMs = ConsumerSubject.create(this.props.bus.getSubscriber<ClockEvents>().on('simTime').atFrequency(1), 0);
  private readonly systemTime = MappedSubject.create(
    ([simTimeMs]) => DateTimeFormatter.create('{month} {d}, {YYYY} {HH}:{mm}:{ss}z')(simTimeMs),
    this.simTimeMs
  );

  private readonly lskState = LskUtils.createState(true);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const onLsk3 = (): void => {
      // Only do something if we haven't completed yet.
      if (this.props.startupManager.startupState.get() !== StartupState.Completed) {
        this.props.startupManager.onAcknowledgeSoftware();
        // Navigate to Fuel Management page if fuel flow system is configured
        if (this.props.ifdOptions.fuelFlow && this.props.ifdOptions.instrumentIndex === 1) {
          this.props.viewService.openTabOnPage(IfdPageName.AUX, 'SYS');
        } else {
          this.props.viewService.openPage(this.props.ifdPageName);
        }
      }
    };

    this.lskState.lsk3.label.set(() => <>Proceed</>);
    this.lskState.lsk3.onClick.set(onLsk3);
    this.lskState.lsk3.isVisible.set(true);

    // Allow hardware event path as well.
    this.props.bus.getSubscriber<IfdInteractions>()
      .on('ifd_interaction_event')
      .handle((event) => {
        const state = this.props.startupManager.startupState.get();
        if (state !== StartupState.Completed && event === IfdInteractionEvent.LineSelectKey3) {
          onLsk3();
        }
      });
  }

  /** @inheritdoc */
  public render(): VNode {
    const navCycleFormatter = AiracCycleFormatter.create('{exp({month} {d}, {YYYY})}');
    const navExpDate = navCycleFormatter(FacilityLoader.getDatabaseCycles().current);

    return (
      <div class={this.props.startupManager.startupState.map((v) => v === StartupState.Completed ? 'hidden' : '')}>
        <div class={{ 'startup-container': true, 'hidden': this.props.startupManager.startupState.map((v) => v !== StartupState.Splash) }}>
          <svg viewBox="0 0 652 98" xmlns="http://www.w3.org/2000/svg" class="startup-logo">
            <rect x="222.7" y="7.2" width="17.6" height="84.3" fill="#fff" />
            <path d="m308.9 7.2h-54.3v84.3h54.3c30.2 0 40.5-14.4 40.5-42.1s-10.3-42.2-40.5-42.2m0 67h-36.7v-49.9h36.7c20.1 0 22.5 8.9 22.5 25s-2.5 24.9-22.5 24.9" fill="#fff" />
            <path d="m402.6 38.3c-2.3 3.2-5.2 6.4-7.3 10.7-2.1-4.3-5-7.5-7.2-10.7l-21.7-31.1h-22.1l35.3 45.5c2.2 2.8 8.2 9.5 8.2 14.7v24.1h15.2v-24.1c0-5.1 5.8-11.7 8.2-14.7l34.6-45.5h-21.5l-21.7 31.1" fill="#fff" />
            <path d="M532.6,73.6h0c-5.6-1-7.5-1.9-26.1-29.7-19.8-29.4-23.1-36.7-44.2-36.7h-11.5v84.3h16.3V25.1h.1c7.9,0,6.1,1.4,26.2,29.6,21.4,30.2,24.9,36.9,44.2,36.9h11.5V7.3h-16.3v66.3" fill="#fff" />
            <rect x="559.7" y="41.4" width="79.1" height="15.8" fill="#fff" />
            <rect x="559.7" y="74.6" width="79.1" height="16.9" fill="#fff" />
            <rect x="559.7" y="7.2" width="79.1" height="16.7" fill="#fff" />
            <path d="M181.5,54.7c19.7-27.1,21.5-29.6,30.1-29.7V7.4c-16.4,1.3-23.6,9.4-44.3,36.6-21.5,28.2-22.2,29.5-30.6,29.5h-.1V7.1h-17.7v84.3h12.5c22.6,0,28.8-7.3,50.1-36.7" fill="#fff" />
            <path d="m95.4 7.2c-22.7 0-28.8 7.3-50.1 36.7-19.6 27.2-21.5 29.6-30.1 29.7v17.6c16.4-1.4 23.6-9.4 44.3-36.6 21.5-28.2 22.2-29.5 30.7-29.5v32.1h-11.5v15.8h11.4v18.5h17.6v-84.3h-12.4" fill="#fff" />
          </svg>
        </div>
        <div class={{ 'startup-container': true, 'hidden': this.props.startupManager.startupState.map((v) => v !== StartupState.Software) }}>
          <div class="startup-column-row">
            <div class="startup-column-label">Software Version:</div>
            <div class="startup-column-data">{this.version}</div>
            <div class="startup-column-label">Flight Software p/n:</div>
            <div class="startup-column-data">{this.version}</div>
            <div class="startup-column-label">Current Date & Time:</div>
            <div class="startup-column-data">{this.systemTime}</div>
            <div class="startup-column-label">Navdata</div>
            <div class="startup-column-data startup-column-label-status">Worldwide, <br />Valid Thru {navExpDate}</div>
            <div class="startup-column-label">Obstacles</div>
            <div class="startup-column-data startup-column-label-status">Worldwide Obstacles, <br />Valid Thru {navExpDate}</div>
            <div class="startup-column-label">Charts</div>
            <div class="startup-column-data startup-column-label-status">Worldwide Charts, <br />Valid Thru {navExpDate}</div>
          </div>
          <div class="software-confirm">
            <div class="software-confirm-left">
              <LineSelectKeyButton
                lskState={this.lskState.lsk3}
                isSelected={this.lskState.selectedButton.map(v => v === 1)}
                data-button-index="1"
              />
            </div>
            <div class="software-confirm-right">
              <div>Terminal procedure charts provided for situational awarenesss only.<br />
                Not for use as primary navigation. Airport diagrams may imply a level of<br /> accuracy greater than available data.</div>
              <div>Refer to the applicable terrain traffic. & lightning sensor approved<br />
                Flight manual supplements for system operating limitations.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
