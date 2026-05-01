import { EventBus, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { FlightPlanStore } from '../../../FlightPlan';
import { IfdOptions } from '../../../IfdOptions';
import { DatabaseStatus } from './DatabaseStatus';
import { GpsStatus } from './GpsStatus';
import { SoftwareStatus } from './SoftwareStatus';
import { FuelManagement } from './FuelManagement';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';

import './SysTab.css';

/** The properties for the {@link SysTab} component. */
interface SysTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The flight plan store to use */
  readonly flightPlanStore: FlightPlanStore,
  /** The IFD configuration options. */
  readonly ifdOptions: IfdOptions;
}

/** The SysTab component. */
export class SysTab extends TabContent<SysTabProps> {
  public readonly title: string = 'SYS';

  private static readonly STATUS = [
    'GPS',
    // 'Datalink',
    'Software',
    'Databases',
  ];

  private readonly selectedStatus = Subject.create(SysTab.STATUS[0]);
  private readonly fuelSelected = Subject.create(!!this.props.ifdOptions.fuelFlow);

  private readonly gpsHidden = MappedSubject.create(
    ([selectedStatus, fuelSelected]) => {
      return fuelSelected || selectedStatus !== 'GPS';
    },
    this.selectedStatus,
    this.fuelSelected,
  ).withLifecycle(this.defaultLifecycle);
  private readonly databaseHidden = MappedSubject.create(
    ([selectedStatus, fuelSelected]) => {
      return fuelSelected || selectedStatus !== 'Datalink';
    },
    this.selectedStatus,
    this.fuelSelected,
  ).withLifecycle(this.defaultLifecycle);
  private readonly softwareHidden = MappedSubject.create(
    ([selectedStatus, fuelSelected]) => {
      return fuelSelected || selectedStatus !== 'Software';
    },
    this.selectedStatus,
    this.fuelSelected,
  ).withLifecycle(this.defaultLifecycle);

  private readonly fuelMgmtRef = FSComponent.createRef<FuelManagement>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this._lskState.lsk3.label.set('Status');
    this.selectedStatus.pipe(this._lskState.lsk3.value);
    this._lskState.lsk3.onClick.set(this.handleStatusClick.bind(this));
    this._lskState.lsk3.isVisible.set(true);
    this._lskState.selectedButton.set(this.props.ifdOptions.fuelFlow ? 2 : 3);

    if (this.props.ifdOptions.fuelFlow) {
      this._lskState.lsk2.label.set('Fuel Mgmt');
      this._lskState.lsk2.isVisible.set(true);
      this._lskState.lsk2.onClick.set(this.toggleFuelPage.bind(this));
    }
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.fuelSelected.get()) {
      const handled = this.fuelMgmtRef.getOrDefault()?.onInteractionEvent(event);
      if (handled) {
        return true;
      }
    }

    return super.onInteractionEvent(event);
  }

  /** Handles the Status LSK click. Selects the actual Status page if not selected, increments the Status page otherwise. */
  private handleStatusClick(): void {
    if (this.props.ifdOptions.fuelFlow && this.fuelSelected.get()) {
      this.toggleFuelPage();
    } else {
      const index = SysTab.STATUS.indexOf(this.selectedStatus.get());
      this.selectedStatus.set(SysTab.STATUS[(index + 1) % SysTab.STATUS.length]);
    }
  }

  /**
   * Toggles the fuel management page.
   */
  private toggleFuelPage(): void {
    if (!this.props.ifdOptions.fuelFlow) {
      return;
    }

    if (this.fuelSelected.get()) {
      this.fuelSelected.set(false);
      this._lskState.selectedButton.set(3);
    } else {
      this.fuelSelected.set(true);
      this._lskState.selectedButton.set(2);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="sys-tab">
        <GpsStatus
          bus={this.props.bus}
          class={{ 'hidden': this.gpsHidden }}
          flightPlanStore={this.props.flightPlanStore}
        />
        <SoftwareStatus
          bus={this.props.bus}
          class={{ 'hidden': this.softwareHidden }}
          ifdOptions={this.props.ifdOptions}
        />
        <DatabaseStatus bus={this.props.bus} class={{ 'hidden': this.databaseHidden }} />
        <FuelManagement
          ref={this.fuelMgmtRef}
          bus={this.props.bus}
          ifdOptions={this.props.ifdOptions}
          class={{ 'hidden': this.fuelSelected.map(v => !v).withLifecycle(this.defaultLifecycle) }}
        />
      </div>
    );
  }
}
