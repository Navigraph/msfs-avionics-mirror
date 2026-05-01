import { ComponentProps, FSComponent, LifecycleComponent, MathUtils, Subject, Subscribable, UnitType, VNode } from '@microsoft/msfs-sdk';

import './CdiScaleLabel.css';

/** Props for the CdiScaleLabel. */
export interface CdiScaleLabelProps extends ComponentProps {
  /** Whether the component should be hidden. */
  readonly isHidden: Subscribable<boolean>;
  /** The CDI scale in nautical miles. */
  readonly cdiScale: Subscribable<number>;
}

/** The CDI scale label. */
export class CdiScaleLabel extends LifecycleComponent<CdiScaleLabelProps> {
  private readonly cdiScaleText = Subject.create('-.-');
  private readonly cdiScaleUnit = Subject.create('NM');

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    const scaleSub = this.props.cdiScale.sub((v) => {
      if (v < 0.1) {
        this.cdiScaleText.set(MathUtils.round(UnitType.FOOT.convertFrom(v, UnitType.NMILE), 10).toFixed(0));
        this.cdiScaleUnit.set('FT');
      } else {
        this.cdiScaleText.set(v.toFixed(1));
        this.cdiScaleUnit.set('NM');
      }
    }, true, true).withLifecycle(this.defaultLifecycle);

    this.props.isHidden.sub((isHidden) => {
      if (isHidden) {
        scaleSub.pause();
      } else {
        scaleSub.resume(true);
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public override render(): VNode | null {
    return (
      <div class={{'cdi-scale-label': true, 'hidden': this.props.isHidden}}>
        <div class='cdi-scale-value wtdyne-text'>
          {this.cdiScaleText}
        </div>
        <div class='cdi-scale-unit wtdyne-text'>
          {this.cdiScaleUnit}
        </div>
      </div>
    );
  }
}
