import { ComponentProps, FSComponent, LifecycleComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './FrequencyFacility.css';

/** Default text for facility display */
export type FacilityDefaultText = 'COM' | 'NAV';

/** Props for {@link FrequencyFacility} */
interface FrequencyFacilityProps extends ComponentProps {
  /** The display index of this block (1 or 2). */
  displayIndex: 1 | 2;
  /** Whether the frequency is the active frequency */
  isActiveFreq: boolean;
  /** Default text to display when there is no facility name/ident/type found */
  facilityDefaultText: FacilityDefaultText;
  /** The facility name */
  facilityName: Subscribable<string>;
  /** The facility ident */
  facilityIdent: Subscribable<string>;
  /** The facility type */
  facilityType: Subscribable<string>;
  /** Whether this component should be hidden */
  isHidden: Subscribable<boolean>;
  /** Whether remote tuning is enabled */
  isRemoteTuningEnabled: boolean;
}

/**
 * Dumb component.
 * Displays the frequency facility name/ident and type
 */
export class FrequencyFacility extends LifecycleComponent<FrequencyFacilityProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();
  private readonly facilityDisplay = Subject.create<string>(this.props.facilityDefaultText);
  private readonly remoteTuningFacilityText = Subject.create<string>('');

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(
      MappedSubject.create(
        ([facilityName, facilityIdent, facilityType]) => {
          if (facilityIdent) {
            this.ref.instance.style.color = 'var(--wtdyne-color-light-cyan)';
            this.facilityDisplay.set(facilityIdent);
            return;
          }

          if (facilityName) {
            this.ref.instance.style.color = 'var(--wtdyne-color-light-cyan)';
            this.facilityDisplay.set(`${facilityName} ${facilityType}`);
            return;
          }

          if (!facilityName && !facilityIdent && !facilityType) {
            this.ref.instance.style.color = 'var(--wtdyne-color-mint)';
          }
        },
        this.props.facilityName,
        this.props.facilityIdent,
        this.props.facilityType,
      ),
    );

    switch (this.props.facilityDefaultText) {
      case 'COM':
        this.remoteTuningFacilityText.set(`COM${this.props.displayIndex}`);
        break;
      case 'NAV':
        this.remoteTuningFacilityText.set(`NAV${this.props.displayIndex}`);
        break;
      default:
        break;
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'wt-ifd-frequency-facility-container': true,
          'hidden': this.props.isHidden
        }}
        ref={this.ref}
      >
        <div class={{
          'wt-ifd-remote-tuning-facility-container': true,
          'hidden': !this.props.isRemoteTuningEnabled,
        }}>
          {this.remoteTuningFacilityText}{'-'}
        </div>
        <div class={{ hidden: this.props.facilityDefaultText === 'NAV' && !this.props.isActiveFreq }}>
          {this.facilityDisplay}
        </div>
      </div>
    );
  }
}
