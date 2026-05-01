import { FSComponent, MathUtils, Subject, UserSetting, VNode } from '@microsoft/msfs-sdk';

import { StateRow, StateRowProps } from './StateRow';
import { BrightnessSlider } from '../../../../../Components/BrightnessSlider/BrightnessSlider';
import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';

/** The properties for the {@link BrightnessRow} component. */
interface BrightnessRowProps extends StateRowProps {
  /** The manual brightness setting */
  manualBrightnessSetting: UserSetting<number>;
}

/** A menu row to control brightness settings */
export class BrightnessRow extends StateRow<BrightnessRowProps> {
  private readonly isSliderSelected = Subject.create(false);
  private readonly isSliderEditing = Subject.create(false);

  private readonly isSliderVisible = this.props.currentStateIndex.map(v => v === 2).withLifecycle(this.defaultLifecycle);

  private readonly pendingSliderValue = Subject.create<number>(this.props.manualBrightnessSetting.get());
  private readonly sliderValuePipe = this.props.manualBrightnessSetting.pipe(this.pendingSliderValue, true).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isSliderEditing.sub((isEditing) => {
      if (isEditing) {
        this.sliderValuePipe.pause();
      } else {
        this.sliderValuePipe.resume(true);
      }
    }, true);
  }

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.isSelected.get()) {
      switch (event) {
        case IfdInteractionEvent.RightKnobInnerInc:
        case IfdInteractionEvent.RightKnobOuterInc:
          if (this.isSliderEditing.get()) {
            this.incrementBrightness();
            return true;
          } else if (this.isRowStateSelected.get() && !this.isRowStateEditing.get() && this.isSliderVisible.get()) {
            this.isRowStateSelected.set(false);
            this.isSliderSelected.set(true);
            return true;
          }
          break;
        case IfdInteractionEvent.RightKnobInnerDec:
        case IfdInteractionEvent.RightKnobOuterDec:
          if (this.isSliderEditing.get()) {
            this.decrementBrightness();
            return true;
          } else if (this.isSliderSelected.get()) {
            this.isRowStateSelected.set(true);
            this.isSliderSelected.set(false);
            return true;
          }
          break;
        case IfdInteractionEvent.RightKnobPush:
          if (this.isRowStateSelected.get()) {
            this.isRowStateEditing.set(!this.isRowStateEditing.get());
          }
          if (this.isSliderSelected.get()) {
            this.isSliderEditing.set(!this.isSliderEditing.get());
          }
          return true;
      }
    }

    return super.onInteractionEvent(event);
  }

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    switch (event) {
      case 'click':
        this.onRowClick();
        break;
      case IfdInteractionEvent.RightKnobInnerInc:
      case IfdInteractionEvent.RightKnobOuterInc:
        this.isRowStateSelected.set(true);
        this.isSliderSelected.set(false);
        break;
      case IfdInteractionEvent.RightKnobInnerDec:
      case IfdInteractionEvent.RightKnobOuterDec:
        if (this.isSliderVisible.get()) {
          this.isRowStateSelected.set(false);
          this.isSliderSelected.set(true);
        } else {
          this.isRowStateSelected.set(true);
          this.isSliderSelected.set(false);
        }
        break;
    }

    super.onFocus(event, true);
  }

  /** @inheritDoc */
  public onBlur(): void {
    this.isRowStateSelected.set(false);
    this.isSliderSelected.set(false);
    this.isRowStateEditing.set(false);
    this.isSliderEditing.set(false);

    super.onBlur();
  }

  /**
   * Handles the row click event
   * If the state is selected, it will start editing the state.
   * If the state is being edited, it rotates the state forward.
   * If the slider is selected or being edited, it will end editing and unselect the slider and select the state.
   */
  private onRowClick(): void {
    if (this.isSelected.get() && this.isRowStateSelected.get()) {
      if (this.isRowStateEditing.get()) {
        this.rotateState(1);
      } else {
        this.isRowStateEditing.set(true);
      }
    } else {
      this.isRowStateSelected.set(true);
      this.isRowStateEditing.set(false);
      this.isSliderSelected.set(false);
      this.isSliderEditing.set(false);
    }
  }

  /** Increment the brightness setting */
  private incrementBrightness(): void {
    const currentBrightness = this.pendingSliderValue.get();
    this.setBrightness(currentBrightness + 10);
  }

  /** Decrement the brightness setting */
  private decrementBrightness(): void {
    const currentBrightness = this.pendingSliderValue.get();
    this.setBrightness(currentBrightness - 10);
  }

  /**
   * Set the brightness setting to the given value
   * @param brightness The brightness value to set
   */
  private setBrightness(brightness: number): void {
    if (this.props.currentStateIndex.get() === 2 && this.isSliderEditing.get()) {
      this.pendingSliderValue.set(MathUtils.clamp(brightness, 1, 100));
    }
  }

  /** @inheritdoc */
  protected override onEnter(): void {
    if (this.props.currentStateIndex.get() === 2 && this.isSliderEditing.get()) {
      this.props.manualBrightnessSetting.set(this.pendingSliderValue.get());
      this.isSliderEditing.set(false);
    } else if (this.isSliderSelected.get()) {
      this.isSliderEditing.set(true);
    } else {
      super.onEnter();
    }
  }

  /** @inheritdoc */
  protected override onClear(): void {
    if (this.props.currentStateIndex.get() === 2 && this.isSliderEditing.get()) {
      this.isSliderEditing.set(false);
    } else {
      super.onEnter();
    }
  }

  /** Select the slider if not selected, unselects row state if selected. Starts editing if slider was already selected. */
  private selectSlider(): void {
    if (this.isSliderSelected.get()) {
      this.isSliderEditing.set(true);
    } else {
      this.isRowStateEditing.set(false);
      this.isRowStateSelected.set(false);
      this.isSliderSelected.set(true);
    }
  }

  /** @inheritdoc */
  protected renderContent(): VNode {
    return (
      <div style="display: flex; flex-direction: column;">
        {super.renderContent()}
        <BrightnessSlider
          isRowStateEditing={this.isRowStateEditing}
          isRowSelected={this.isSelected}
          isSliderSelected={this.isSliderSelected}
          isSliderEditing={this.isSliderEditing}
          isVisible={this.isSliderVisible}
          brightnessValue={this.pendingSliderValue}
          setBrightness={this.setBrightness.bind(this)}
          selectSlider={this.selectSlider.bind(this)}
        />
      </div>
    );
  }
}
