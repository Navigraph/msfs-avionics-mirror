import { Subscribable } from '@microsoft/msfs-sdk';
import { IfdView, IfdViewProps } from './IfdView';

/** Properties for an IFD dialog. */
export type IfdDialogProps = IfdViewProps;

/** An IFD dialog that pops up over IfdViews. */
export abstract class IfdDialog<T extends IfdDialogProps = IfdDialogProps> extends IfdView<T> {
  /** Whether the dialog is currently visible. */
  public abstract isVisible: Subscribable<boolean>;

  /** Closes the dialog if it is currently open. */
  public abstract close(): void;
}
