import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { SetupRowBase, SetupRowBaseProps } from './SetupRowBase';

/** Props for the {@link ButtonRow} component. */
export interface ButtonRowProps extends SetupRowBaseProps {
  /** Callback when the row was already selected and the user clicked on it. */
  onClick?: () => void;
}

/** A simple button row component that can executes the given callback when activated */
export class ButtonRow<T extends ButtonRowProps = ButtonRowProps> extends SetupRowBase<T> {
  /** @inheritdoc*/
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (this._isSelected.get()) {
      this.props.onClick?.();
      return;
    }

    super.onFocus(event);
  }

  /** @inheritdoc */
  protected onEnter(): void {
    this.props.onClick?.();
  }

  /** @inheritdoc */
  protected onClear(): void { }
}
