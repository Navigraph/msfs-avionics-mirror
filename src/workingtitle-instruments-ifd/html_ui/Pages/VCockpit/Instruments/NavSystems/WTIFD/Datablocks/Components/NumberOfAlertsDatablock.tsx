import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdCasAlertManager } from '../../Systems/Cas/IfdCasAlertManager';
import { IfdCasMessagePriority } from '../../Systems/Cas/CasMessages';

import './NumberOfAlertsDatablock.css';

/** Props for {@link NumberOfAlertsDatablock} */
interface NumberOfAlertsDatablockProps extends BaseDatablockProps {
  /** The CAS Alert Manager */
  alertManager: IfdCasAlertManager;
}

/** Datablock for displaying the Number of Alerts */
export class NumberOfAlertsDatablock extends Datablock<NumberOfAlertsDatablockProps> {
  private readonly activeRedWarnings = Subject.create(0);
  private readonly activeYellowCautions = Subject.create(0);
  private readonly activeCyanAdvisories = Subject.create(0);

  private readonly anyWarningUnacknowledged = Subject.create(false);
  private readonly anyCautionUnacknowledged = Subject.create(false);
  private readonly anyAdvisoryUnacknowledged = Subject.create(false);

  private readonly noActiveAlerts = Subject.create(true);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.alertManager.getActiveAlertSubject().sub((_index, _type, _item, array) => {
      let red = 0;
      let yellow = 0;
      let cyan = 0;

      let warningUnacknowledged = false;
      let cautionUnacknowledged = false;
      let advisoryUnacknowledged = false;

      for (const alert of array) {
        if (alert.def.priority === IfdCasMessagePriority.Warning) {
          red++;
          if (!alert.acknowledged) {
            warningUnacknowledged = true;
          }
        } else if (alert.def.priority === IfdCasMessagePriority.Caution) {
          yellow++;
          if (!alert.acknowledged) {
            cautionUnacknowledged = true;
          }
        } else if (alert.def.priority === IfdCasMessagePriority.Advisory) {
          cyan++;
          if (!alert.acknowledged) {
            advisoryUnacknowledged = true;
          }
        }
      }

      this.activeRedWarnings.set(red);
      this.activeYellowCautions.set(yellow);
      this.activeCyanAdvisories.set(cyan);

      this.anyWarningUnacknowledged.set(warningUnacknowledged);
      this.anyCautionUnacknowledged.set(cautionUnacknowledged);
      this.anyAdvisoryUnacknowledged.set(advisoryUnacknowledged);

      this.noActiveAlerts.set(red === 0 && yellow === 0 && cyan === 0);
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for NumberOfAlertsDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Number of Alerts',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-number-of-alerts" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small no-padding datablock-text-mint">
          {this.noActiveAlerts.map(v => v ? 'No ' : '').withLifecycle(this.defaultLifecycle)}Active Alerts
        </div>
        <div class="datablock-alert-row">
          <div class={{
            'datablock-alert-count': true,
            warning: true,
            unacknowledged: this.anyWarningUnacknowledged,
            hidden: this.activeRedWarnings.map(v => v === 0).withLifecycle(this.defaultLifecycle)
          }}>
            {this.activeRedWarnings}
          </div>
          <div class={{
            'datablock-alert-count': true,
            caution: true,
            unacknowledged: this.anyCautionUnacknowledged,
            hidden: this.activeYellowCautions.map(v => v === 0).withLifecycle(this.defaultLifecycle)
          }}>
            {this.activeYellowCautions}
          </div>
          <div class={{
            'datablock-alert-count': true,
            advisory: true,
            unacknowledged: this.anyAdvisoryUnacknowledged,
            hidden: this.activeCyanAdvisories.map(v => v === 0).withLifecycle(this.defaultLifecycle)
          }}>
            {this.activeCyanAdvisories}
          </div>
        </div>
      </div>
    );
  }
}
