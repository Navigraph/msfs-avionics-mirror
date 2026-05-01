import { AiracCycleFormatter, ClassProp, DisplayComponent, EventBus, FacilityLoader, FSComponent, VNode } from '@microsoft/msfs-sdk';

import './SysTab.css';

/** The properties for the {@link DatabaseStatus} component. */
interface DatabaseStatusProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** CSS classes to apply. */
  readonly class?: ClassProp,
}

/** The DatabaseStatus component. */
export class DatabaseStatus extends DisplayComponent<DatabaseStatusProps> {
  private dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  private date = new Date();
  private currentFormattedDate = this.date.toLocaleDateString('en-US', this.dateOptions);
  private airacCycle = FacilityLoader.getDatabaseCycles().current;
  private cycleFormattedEffectiveDate = AiracCycleFormatter.create('{eff({month} {d}, {YYYY})}')(this.airacCycle);
  private cycleFormattedExperiationDate = AiracCycleFormatter.create('{exp({month} {d}, {YYYY})}')(this.airacCycle);

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={FSComponent.mergeCssClasses('sys-tab-database', this.props.class)}>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Nav:</div>
          <div class="sys-tab-column-data">
            <div>AIRAC {this.airacCycle.ident}</div>
            <div class="sys-tab-column-data-subtext">
              Valid Thru {this.cycleFormattedExperiationDate}
            </div>
          </div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Obstacles:</div>
          <div class="sys-tab-column-data">
            <div>N/A</div>
            <div class="sys-tab-column-data-subtext">Valid Thru N/A</div>
          </div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Terrain:</div>
          <div class="sys-tab-column-data">
            <div>MSFS Terrain Data</div>
            <div class="sys-tab-column-data-subtext">{this.currentFormattedDate}</div>
          </div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Charts:</div>
          <div class="sys-tab-column-data">
            <div>FAA/LIDO</div>
            <div class="sys-tab-column-data-subtext">Valid {this.cycleFormattedEffectiveDate}</div>
            <div class="sys-tab-column-data-subtext">Thru {this.cycleFormattedExperiationDate}</div>
          </div>
        </div>
        <div class="sys-tab-sw-disclaimer">Terminal procedure charts provided for simulator use only. Not for use<br />in flight.</div>
      </div>
    );
  }
}
