import { FSComponent, MutableSubscribable, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { CheckmarkComponent } from '../../../../../Components/SettingsMenu/CheckmarkComponent';
import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { SetupRowBase, SetupRowBaseProps } from './SetupRowBase';

/**
 * Props for the {@link CheckboxRow} component.
 */
export interface CheckboxRowProps extends SetupRowBaseProps {
  /** Whether the checkbox is checked. If it is a mutable subscribable, the value will be set when the row is pressed. */
  readonly checked: Subscribable<boolean> | MutableSubscribable<boolean>;
  /**
   * Function that is called when this row is pressed.
   * isChecked will be true if the checkbox should be checked (ENTR/knob push), or false if not (CLR).
   */
  readonly onPressed?: (isChecked: boolean) => void;
}

/** A checkbox row component that can be toggled on/off. */
export class CheckboxRow<T extends CheckboxRowProps = CheckboxRowProps> extends SetupRowBase<T> {
  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (this._isEnabled.get()) {
      if (this._isSelected.get()) {
        this.set(true);
      }

      super.onFocus(event);
    }
  }

  /** @inheritdoc */
  protected onEnter(): void {
    if (this._isEnabled.get()) {
      this.set(true);
    }
  }

  /** @inheritdoc */
  protected onClear(): void {
    if (this._isEnabled.get()) {
      this.set(false);
    }
  }

  /**
   * Sets the checked state.
   * @param checked The new state.
   */
  private set(checked: boolean): void {
    if (SubscribableUtils.isMutableSubscribable(this.props.checked)) {
      this.props.checked.set(checked);
    }

    this.props.onPressed?.(checked);
  }

  /** @inheritdoc */
  protected renderContent(): VNode {
    return (
      <div class="settings-row-content">
        <div class={{
          'settings-radio-button-container': true,
        }}>
          <CheckmarkComponent isVisible={this.props.checked} />
        </div>
      </div>
    );
  }
}
