import {
  ComponentProps, DebounceTimer, EventBus, FSComponent, LifecycleComponent, Subject, Subscribable, SubscribableUtils, Subscription, VNode,
} from '@microsoft/msfs-sdk';
import { ComRadioUserSettings } from '../../Settings/ComRadioUserSettings';

import './ComPresetInfoBox.css';

/** Props for {@link ComPresetInfoBox} */
interface ComPresetInfoBoxProps extends ComponentProps {
  /** The event bus instance */
  readonly bus: EventBus;
  /** Whether showing this instance info box should be inhibited */
  readonly inhibited?: boolean | Subscribable<boolean>;
}

/** Information box for the COM preset frequency selection to be displayed on the map or SVS screens */
export class ComPresetInfoBox extends LifecycleComponent<ComPresetInfoBoxProps> {
  private static readonly DEFAULT_DISPLAY_TIME = 5000; // milliseconds; no reference, just a guess

  private readonly presetIndex = ComRadioUserSettings.getManager(this.props.bus).getSetting('lastSelectedPresetIndex');
  private readonly inhibited = this.props.inhibited !== undefined ? SubscribableUtils.toSubscribable(this.props.inhibited, true) : Subject.create(false);

  private readonly displayDebounce = new DebounceTimer();

  private readonly indexDisplay = Subject.create('');
  private readonly infoBoxHidden = Subject.create(true);

  /* Separately handling the state subscription because otherwise the box is triggered on resume */
  private stateSub?: Subscription;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.stateSub = this.presetIndex.sub((index) => {
      if (this.inhibited.get() || index === 0) {
        this.indexDisplay.set('');
        this.infoBoxHidden.set(true);
        return;
      }

      this.indexDisplay.set(index.toString());
      this.infoBoxHidden.set(false);
      this.displayDebounce.schedule(() => {
        this.indexDisplay.set('');
        this.infoBoxHidden.set(true);
      }, ComPresetInfoBox.DEFAULT_DISPLAY_TIME);
    }, false);
  }

  /** @inheritDoc */
  public pause(): void {
    super.pause();

    this.stateSub?.pause();
  }

  /** @inheritDoc */
  public resume(): void {
    super.resume();

    this.stateSub?.resume(false);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'com-preset-info-box': true,
        hidden: this.infoBoxHidden
      }}>
        <div class="com-preset-info-box-label">
          COM Freq{'\n'}Preset
        </div>
        <div class="com-preset-info-box-number">
          <span>{this.indexDisplay}</span>
          <div class="com-preset-info-box-arrow">
            <svg viewBox="-1 -1 20 12" height="15" style="transform: rotate(180deg);">
              <path d="M 1 5 L 13 5" style="stroke: var(--wtdyne-color-mint);" stroke-width="2" fill="none" />
              <path d="M 17 5 L 10 9 C 9 7 9 6 9 5 C 9 4 9 3 10 1 L 17 5" fill="var(--wtdyne-color-mint)" stroke="none" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.stateSub?.destroy();

    super.destroy();
  }
}
