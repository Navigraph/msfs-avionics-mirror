
import { LifecycleComponent } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../../../../RightKnob';
import { TextInputField } from '../TextInputField';
import { AltitudeInput } from './AltitudeField';
import { AngleInput } from './AngleField';
import { DescentRateInput } from './DescentRateField';
import { DistanceInput } from './DistanceField';
import { DurationInput } from './DurationField';
import { FrequencyField, FrequencyFieldInput } from './FrequencyField';
import { IdentInput } from './IdentField';

/**
 * A reference type for editable field components.
 */
// eslint-disable-next-line max-len
export type EditableFieldRef = AbstractField<string | FrequencyField | AltitudeInput | TextInputField | AngleInput | DescentRateInput | IdentInput | DurationInput | DistanceInput | FrequencyFieldInput, any>;

/**
 * Abstract field interface for editable input components.
 */
export abstract class AbstractField<FieldType, Props> extends LifecycleComponent<Props> implements IfdInteractionEventHandler {
  /** Handles backspace key press */
  public abstract onBackspacePressed(): void;

  /** Activates the field for editing */
  public abstract activateEditing(): void;

  /** Handles enter key press and returns the current value */
  public abstract onEnterPressed(): string;

  /** @inheritdoc*/
  public abstract onInteractionEvent(event: IfdInteractionEvent): boolean;

  /** Gets the current displayed keyboard input value */
  public abstract getValue(): string;

  /** Handles initial request to display/edit a value */
  public abstract onRequest(input: FieldType): void;

  /** Handles number/character key press */
  public abstract onKeyPressed(value: string): void;
}
