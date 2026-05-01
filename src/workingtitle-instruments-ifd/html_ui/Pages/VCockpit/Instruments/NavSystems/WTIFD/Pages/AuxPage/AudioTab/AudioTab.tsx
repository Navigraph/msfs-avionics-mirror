import { EventBus, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { VolumeControlRow, VolumeControlRowData, VolumeOption } from './Components/VolumeControlRow';
import { ComPresetPage } from './Components/ComPresetPage';
import { IfdTuningControlsManager } from '../../../Events/IfdTuningControlsManager';

import './AudioTab.css';

/** The properties for the {@link AudioTab} component. */
interface AudioTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The IFD instrument index */
  readonly ifdInstrumentIndex: number;
  /** An instance of the tuning controls manager. */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

export enum VolumeRow {
  ActiveCom = 'Active Com',
  StandbyCom = 'Standby Com',
  Sidetone = 'Sidetone',
  ActiveVLOC = 'Active VLOC',
  AuralAlert = 'Aural Alert',
  SatelliteRadio = 'Satellite Radio',
}

enum AudioTabPage {
  VolumeControl = 0,
  ComPresetList = 1,
}

/** The AudioTab component. */
export class AudioTab extends TabContent<AudioTabProps> {
  public readonly title: string = 'AUDIO';

  private currentPage = Subject.create<AudioTabPage>(AudioTabPage.VolumeControl);
  private selectedRow = Subject.create<VolumeRow>(VolumeRow.ActiveCom);

  private readonly comPresetPageRef = FSComponent.createRef<ComPresetPage>();

  private volumeRowDataArray: VolumeControlRowData[] = [
    {
      label: VolumeRow.ActiveCom,
      isSelected: this.selectedRow.map(r => r === VolumeRow.ActiveCom),
      volume: Subject.create(0.2),
      option: VolumeOption.SqOn,
      optionState: Subject.create(true),
    },
    {
      label: VolumeRow.StandbyCom,
      isSelected: this.selectedRow.map(r => r === VolumeRow.StandbyCom),
      volume: Subject.create(0.5),
      option: VolumeOption.SqOn,
      optionState: Subject.create(true),
    },
    {
      label: VolumeRow.Sidetone,
      isSelected: this.selectedRow.map(r => r === VolumeRow.Sidetone),
      volume: Subject.create(0.5),
      option: VolumeOption.SqOn,
      optionState: Subject.create(false),
    },
    {
      label: VolumeRow.ActiveVLOC,
      isSelected: this.selectedRow.map(r => r === VolumeRow.ActiveVLOC),
      volume: Subject.create(0.5),
      option: VolumeOption.IdOn,
      optionState: Subject.create(true),
    },
    {
      label: VolumeRow.AuralAlert,
      isSelected: this.selectedRow.map(r => r === VolumeRow.AuralAlert),
      volume: Subject.create(0.5),
      option: VolumeOption.SqOn,
      optionState: Subject.create(false),
    },
    {
      label: VolumeRow.SatelliteRadio,
      isSelected: this.selectedRow.map(r => r === VolumeRow.SatelliteRadio),
      volume: Subject.create(0.5),
      option: VolumeOption.Mute,
      optionState: Subject.create(true),
    },
  ];

  private getSelectedRowData = (): VolumeControlRowData => {
    return this.volumeRowDataArray.find((row) => row.label === this.selectedRow.get()) ?? this.volumeRowDataArray[0];
  };

  private changeVolume = (currentVolume: number, direction: 'inc' | 'dec', increment: number = 0.1): number => {
    const newVolume = direction === 'inc' ? currentVolume + increment : currentVolume - increment;
    const clampedVolume = Math.min(Math.max(newVolume, 0), 1);
    return clampedVolume;
  };

  private changeSelectedRow = (direction: 'next' | 'previous'): void => {
    const selectedRow = this.getSelectedRowData();
    const currentSelectedRowIndex = this.volumeRowDataArray.indexOf(selectedRow);
    let newSelectedRowIndex = direction === 'next' ? currentSelectedRowIndex + 1 : currentSelectedRowIndex - 1;
    if (newSelectedRowIndex > this.volumeRowDataArray.length - 1) {
      newSelectedRowIndex = 0;
    }
    if (newSelectedRowIndex < 0) {
      newSelectedRowIndex = this.volumeRowDataArray.length - 1;
    }
    this.selectedRow.set(this.volumeRowDataArray[newSelectedRowIndex].label);
  };

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this._knobState.leftText.set('Adjust');
    this._knobState.rightText.set('Sq');

    this._lskState.lsk2.label.set('Volume\nControl');
    this._lskState.lsk2.isVisible.set(true);
    this._lskState.lsk2.onClick.set(() => this.selectAudioTabPage(AudioTabPage.VolumeControl));
    this._lskState.lsk2.onKnobEvent.set(this.onInteractionEvent.bind(this));
    this._lskState.lsk4.label.set('Com\nPreset List');
    this._lskState.lsk4.isVisible.set(true);
    this._lskState.lsk4.onClick.set(() => this.selectAudioTabPage(AudioTabPage.ComPresetList));
    this._lskState.lsk4.onKnobEvent.set(this.onInteractionEvent.bind(this));
    this._lskState.selectedButton.set(2);

    this.currentPage.sub(page => {
      page === AudioTabPage.ComPresetList ? this.props.viewService.inhibitComPresetBox() : this.props.viewService.enableComPresetBox();
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public pause(): void {
    super.pause();

    this.props.viewService.enableComPresetBox();
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.currentPage.get() === AudioTabPage.ComPresetList) {
      return this.comPresetPageRef.instance.onInteractionEvent(event);
    }

    const selectedRowData = this.getSelectedRowData();
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        selectedRowData?.optionState?.set(!selectedRowData?.optionState.get());
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        selectedRowData?.volume?.set(this.changeVolume(selectedRowData.volume.get(), 'dec'));
        return true;
      case IfdInteractionEvent.RightKnobInnerInc:
        selectedRowData?.volume?.set(this.changeVolume(selectedRowData.volume.get(), 'inc'));
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        this.changeSelectedRow('previous');
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        this.changeSelectedRow('next');
        return true;
      default:
        return false; // Event not handled
    }
  }

  /**
   * Selects the audio tab page.
   * @param page The audio tab page to select.
   */
  private selectAudioTabPage(page: AudioTabPage): void {
    this.currentPage.set(page);
    this._lskState.selectedButton.set(page === AudioTabPage.VolumeControl ? 2 : 4);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <div class={{
          'ifd-aux-audio-tab': true,
          hidden: this.currentPage.map(v => v !== AudioTabPage.VolumeControl).withLifecycle(this.defaultLifecycle)
        }}>
          {this.volumeRowDataArray.map((rowData) => {
            return (
              <>
                <VolumeControlRow
                  data={rowData}
                  onSelect={() => this.selectedRow.set(rowData.label)}
                  onVolumeChange={(vol) => rowData.volume.set(vol)}
                  onOptionChange={(state) => rowData.optionState.set(state)}
                />
                {rowData.label === VolumeRow.AuralAlert && <div style={{ 'height': '65px' }} />}
              </>
            );
          })}
        </div>
        <div class={{
          'ifd-aux-audio-tab': true,
          'no-padding': true,
          hidden: this.currentPage.map(v => v !== AudioTabPage.ComPresetList).withLifecycle(this.defaultLifecycle)
        }}>
          <ComPresetPage
            bus={this.props.bus}
            ifdInstrumentIndex={this.props.ifdInstrumentIndex}
            tuningControlsManager={this.props.tuningControlsManager}
            ref={this.comPresetPageRef}
          />
        </div>
      </>
    );
  }
}
