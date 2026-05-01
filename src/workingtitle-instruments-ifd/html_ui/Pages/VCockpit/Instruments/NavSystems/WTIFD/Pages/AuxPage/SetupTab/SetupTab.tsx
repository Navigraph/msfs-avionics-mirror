import { EventBus, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../Charts/IfdChartsManager';
import { IfdMapPresetService } from '../../../Components/Map/IfdMapPresetService';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { DatablockService } from '../../../Datablocks/DatablocksService';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdOptions } from '../../../IfdOptions';
import { MapDataProvider } from '../../../Providers/Map/MapDataProvider';
import { DataSidebar } from '../../../Sidebar/DataSidebar';
import { IfdViewService } from '../../../ViewService';
import { PresetsMenu } from './Components/PresetsMenu';
import { SetupMenu } from './Components/SetupMenu';

import './SetupTab.css';

/** The properties for the {@link SetupTab} component. */
interface SetupTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The Ifd Options */
  readonly ifdOptions: IfdOptions;
  /** The IFD view service. */
  readonly ifdViewService: IfdViewService;
  /** An instance of the datablock service. */
  readonly datablockService: DatablockService;
  /** The charts manager */
  readonly chartsManager: IfdChartsManager;
  /** The map preset service. */
  readonly mapPresetService: IfdMapPresetService;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
}

/** The SetupTab component. */
export class SetupTab extends TabContent<SetupTabProps> {
  public readonly title: string = 'SETUP';

  private readonly presetsActive = Subject.create(false);

  private readonly setupPageRef = FSComponent.createRef<SetupMenu>();
  private readonly presetPageRef = FSComponent.createRef<PresetsMenu>();
  private readonly sidebarRef = FSComponent.createRef<DataSidebar>();

  private readonly isSidebarVisibleDelayed = Subject.create(false);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // TODO Context sensitive
    this._knobState.leftText.set('Scroll');
    this._knobState.rightText.set('More');

    this.setupPageRef.instance.datablockSection.isExpanded.sub(expanded => {
      this._lskState.isVisible.set(!expanded);
      this._lskState.lsk4.isVisible.set(!expanded);
    }, true).withLifecycle(this.defaultLifecycle);
    this._lskState.lsk4.onClick.set(this.togglePresets.bind(this));
    this._lskState.lsk3.label.set('Enter');
    this._lskState.lsk3.onClick.set(() => this.presetPageRef.instance.confirmSelection());

    MappedSubject.create(
      ([presetsActive, confirmDialogActive]) => {
        if (!presetsActive) {
          this._lskState.lsk3.isVisible.set(false);
          this._lskState.lsk4.label.set('Presets');
          this._lskState.lsk4.onClick.set(this.togglePresets.bind(this));
        } else if (!confirmDialogActive) {
          this._lskState.lsk3.isVisible.set(false);
          this._lskState.lsk4.label.set('Exit');
          this._lskState.lsk4.onClick.set(this.togglePresets.bind(this));
        } else {
          this._lskState.lsk3.isVisible.set(true);
          this._lskState.lsk4.label.set('Cancel');
          this._lskState.lsk4.onClick.set(() => this.presetPageRef.instance.cancelSelection());
        }
      },
      this.presetsActive,
      this.presetPageRef.instance.confirmDialogActive
    ).withLifecycle(this.defaultLifecycle);

    this.sidebarRef.instance.isSidebarVisibleDelayed.pipe(this.isSidebarVisibleDelayed);
  }

  /** @inheritDoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.presetsActive.get()) {
      return this.presetPageRef.instance.onInteractionEvent(event);
    }

    if (this.props.datablockService.onInteractionEvent(event)) {
      return true;
    }

    return this.setupPageRef.instance.onInteractionEvent(event);
  }

  /** Toggles the presets menu. */
  private togglePresets(): void {
    this.presetsActive.set(!this.presetsActive.get());
  }

  /** @inheritdoc */
  public pause(): void {
    this.presetPageRef.instance.cancelSelection();
    super.pause();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <div
          class={{
            'setup-tab': true,
            hidden: this.presetsActive,
          }}>
          <div
            class={{
              'ifd-narrow-container': true,
              'ifd-narrow-page': this.isSidebarVisibleDelayed,
            }}>
            <SetupMenu
              ref={this.setupPageRef}
              bus={this.props.bus}
              ifdOptions={this.viewService.ifdOptions}
              datablockService={this.props.datablockService}
              chartsManager={this.props.chartsManager}
              mapPresetService={this.props.mapPresetService}
              mapDataProvider={this.props.mapDataProvider}
            />
          </div>
          <DataSidebar
            ref={this.sidebarRef}
            bus={this.props.bus}
            datablockService={this.props.datablockService}
            viewService={this.viewService}
            isSidebarVisible={this.props.datablockService.setupMenuSidebarVisible}
            disableAnimation={true}
          />
        </div>
        <div class={{ 'setup-tab': true, hidden: this.presetsActive.map(v => !v).withLifecycle(this.defaultLifecycle) }}>
          <PresetsMenu
            ref={this.presetPageRef}
            bus={this.props.bus}
            datablockService={this.props.datablockService}
            ifdOptions={this.props.ifdOptions}
            mapPresetService={this.props.mapPresetService}
            ifdViewService={this.props.ifdViewService}
          />
        </div>
      </>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.presetPageRef.instance.cancelSelection();
    super.destroy();
  }
}
