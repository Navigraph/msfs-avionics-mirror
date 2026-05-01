import { ArrayUtils, ComponentProps, EventBus, FSComponent, LifecycleComponent, NodeReference, RadioType, Subject, VNode } from '@microsoft/msfs-sdk';

import { ComRadioUserSettings } from '../../../../Settings/ComRadioUserSettings';
import { TouchButton } from '../../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../../../RightKnob';
import { IfdTuningControlsManager } from '../../../../Events/IfdTuningControlsManager';
import { ComPresetRow } from './ComPresetRow';

import './ComPresetPage.css';

/** Props for the {@link ComPresetPage} component. */
interface ComPresetPageProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The IFD instrument index */
  readonly ifdInstrumentIndex: number;
  /** An instance of the tuning controls manager. */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

/** The menu page for COM presets */
export class ComPresetPage extends LifecycleComponent<ComPresetPageProps> implements IfdInteractionEventHandler {
  private readonly comRadioUserSettings = ComRadioUserSettings.getManager(this.props.bus);

  private readonly lastSelectedPresetIndex = this.comRadioUserSettings.getSetting('lastSelectedPresetIndex');
  private readonly comSpacing = this.comRadioUserSettings.getSetting('comSpacing');

  /**
   * Index of the selected row.
   *
   * Index 0 is the Edit button,
   * indices 1-8 are the first column of frequencies,
   * indices 9-16 are the second column of frequencies.
   */
  private readonly selectedIndex = Subject.create(0);

  private readonly isEditing = Subject.create(false);

  private readonly presetRowRefs: NodeReference<ComPresetRow>[] = [];

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isEditing.sub(editing => {
      if (!editing) {
        // Reset last selected preset index after editing is finished
        this.lastSelectedPresetIndex.set(0);
      }
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const selectedIndex = this.selectedIndex.get();
    let handled = false;
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        if (selectedIndex === 0) {
          this.isEditing.set(!this.isEditing.get());
          return true;
        }
        handled = ArrayUtils.peekAt(this.presetRowRefs, selectedIndex - 1)?.getOrDefault()?.onInteractionEvent(event) ?? false;
        break;
      case IfdInteractionEvent.RightKnobOuterDec:
      case IfdInteractionEvent.RightKnobInnerDec:
        if (selectedIndex === 0) {
          return true;
        }
        handled = ArrayUtils.peekAt(this.presetRowRefs, selectedIndex - 1)?.getOrDefault()?.onInteractionEvent(event) ?? false;
        if (!handled) {
          this.selectedIndex.set(selectedIndex - 1);
          handled = true;
        }
        break;
      case IfdInteractionEvent.RightKnobOuterInc:
      case IfdInteractionEvent.RightKnobInnerInc:
        if (selectedIndex === 0) {
          this.selectedIndex.set(selectedIndex + 1);
          return true;
        }
        handled = ArrayUtils.peekAt(this.presetRowRefs, selectedIndex - 1)?.getOrDefault()?.onInteractionEvent(event) ?? false;
        if (!handled) {
          this.selectedIndex.set(selectedIndex + (selectedIndex < 16 ? 1 : 0));
          handled = true;
        }
        break;
      case IfdInteractionEvent.CLR:
        if (selectedIndex === 0) {
          this.isEditing.set(false);
          return true;
        }
        handled = ArrayUtils.peekAt(this.presetRowRefs, selectedIndex - 1)?.getOrDefault()?.onInteractionEvent(event) ?? false;
        break;
      case IfdInteractionEvent.ENTR:
        if (selectedIndex === 0) {
          return true;
        }
        handled = ArrayUtils.peekAt(this.presetRowRefs, selectedIndex - 1)?.getOrDefault()?.onInteractionEvent(event) ?? false;
    }
    return handled;
  }

  /**
   * Tunes the preset frequency at the given index and saves the last selected preset index.
   * @param index The index of the preset to tune.
   */
  private tunePresetByIndex(index: number): void {
    if (index > 0 && index <= 16) {
      const frequency = this.comRadioUserSettings.getSetting(`presetFrequency_${index}`).get();
      if (frequency !== 0) {
        this.props.tuningControlsManager.selectStandbyIndex(1, RadioType.Com);
        this.props.tuningControlsManager.setComStandbyFrequency(frequency);
        this.lastSelectedPresetIndex.set(index);
      }
    }
  }

  /**
   * Renders the requested rows of the menu, between the given indices (both inclusive)
   * @param startIndex The index of the first row to render.
   * @param endIndex The index of the last row to render.
   * @returns An array of rendered rows.
   */
  private renderRows(startIndex: number, endIndex: number): VNode[] {
    const rows: VNode[] = [];

    for (let i = startIndex; i <= endIndex; i++) {
      const ref = FSComponent.createRef<ComPresetRow>();
      rows.push(
        <ComPresetRow
          ref={ref}
          index={i}
          bus={this.props.bus}
          ifdInstrumentIndex={this.props.ifdInstrumentIndex}
          presetFrequencySetting={this.comRadioUserSettings.getSetting(`presetFrequency_${i}`)}
          selectedIndex={this.selectedIndex}
          editingActive={this.isEditing}
          tunePresetByIndex={this.tunePresetByIndex.bind(this)}
          comSpacing={this.comSpacing}
          lastSelectedPresetIndex={this.lastSelectedPresetIndex}
        />
      );
      this.presetRowRefs.push(ref);
    }
    return rows;
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={{ 'com-preset-page': true, editing: this.isEditing }}>
        <div class="com-preset-controls">
          <div class="select-to-load-label">
            Select to Load Presets
          </div>
          <TouchButton
            class="com-preset-button edit-button"
            isHighlighted={this.selectedIndex.map(v => v === 0).withLifecycle(this.defaultLifecycle)}
            onPressed={() => {
              this.selectedIndex.set(0);
              this.isEditing.set(!this.isEditing.get());
            }}
            label="Edit"
          />
        </div>
        <div class="com-preset-list">
          <div class="com-preset-column">
            {this.renderRows(1, 8)}
          </div>
          <div class="com-preset-column">
            {this.renderRows(9, 16)}
          </div>
        </div>

      </div>
    );
  }
}
