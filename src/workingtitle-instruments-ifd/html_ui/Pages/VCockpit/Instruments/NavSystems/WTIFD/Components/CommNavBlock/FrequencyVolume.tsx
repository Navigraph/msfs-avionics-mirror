import { ComponentProps, DebounceTimer, FSComponent, LifecycleComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './FrequencyVolume.css';

/** Props for {@link FrequencyVolume} */
interface FrequencyVolumeProps extends ComponentProps {
  /** The volume value of the radio frequency, ranging from 0 to 1 */
  volume: Subscribable<number>;
  /** Whether the radio pane is focused */
  isFocused: Subscribable<boolean>;
}

/**
 * Dumb component.
 * Displays the volume level of the radio frequency, 0 as 0% and 1 as 100%.
 */
export class FrequencyVolume extends LifecycleComponent<FrequencyVolumeProps> {
  private readonly width = this.props.volume.map((v) => `${v}%`);
  private readonly isVolumeChanging = Subject.create<boolean>(false);
  private readonly isHidden = MappedSubject.create(
    ([isVolumeChanging, isFocused]) => !isVolumeChanging || !isFocused,
    this.isVolumeChanging,
    this.props.isFocused
  );

  private timer = new DebounceTimer();
  private time = 3000; // 1 sec

  private isFirstValue: boolean = true;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(this.width);
    this.register(this.isHidden);
    this.register(this.props.volume.sub(() => {
      // We don't want the volume bar to show on the first valid volume value
      // received from the sim.
      if (this.isFirstValue) {
        this.isFirstValue = false;
        return;
      }
      this.isVolumeChanging.set(true);
      this.timer.schedule(() => this.isVolumeChanging.set(false), this.time);
    }));
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'wt-ifd-freq-volume-container': true,
        'hidden': this.isHidden,
      }}>
        <svg width="100%" height="18">
          <rect
            x="0"
            y="0"
            rx="3.5%"
            ry={18}
            width={this.width}
            height="18"
            fill="var(--wtdyne-color-lime)"
            opacity={0.75}
          />
        </svg>
      </div>
    );
  }
}
