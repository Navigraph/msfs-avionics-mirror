import { ComponentProps, FSComponent, LifecycleComponent, MathUtils, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './BrightnessSlider.css';

/** Props for {@link BrightnessSlider} */
interface BrightnessSliderProps extends ComponentProps {
  /** Whether the slider is visible */
  isVisible: Subscribable<boolean>;
  /** Whether the menu row is selected */
  isRowSelected: Subscribable<boolean>;
  /** Whether the menu row is being edited */
  isRowStateEditing: Subscribable<boolean>;
  /** Whether the slider is selected */
  isSliderSelected: Subscribable<boolean>;
  /** Whether the slider is being edited */
  isSliderEditing: Subscribable<boolean>;
  /** The current brightness value */
  brightnessValue: Subscribable<number>;
  /** Callback to set the brightness value */
  setBrightness: (brightness: number) => void;
  /** Callback to select the slider and enable for editing */
  selectSlider: () => void;
}

/** A slider component for adjusting the screen or bezel brightness in the menu. */
export class BrightnessSlider extends LifecycleComponent<BrightnessSliderProps> {
  private readonly sliderEmptyRef = FSComponent.createRef<HTMLDivElement>();
  private readonly sliderFilledRef = FSComponent.createRef<HTMLDivElement>();

  private readonly sliderHidden = Subject.create(false);

  private sliderLeft = 0;
  private sliderWidth = 1;

  private dragging = false;

  /** @inheritdoc */
  public onAfterRender(): void {
    this.props.isVisible.sub(visible => {
      this.sliderHidden.set(!visible);
      if (visible) {
        requestAnimationFrame(() => this.measureSlider());
      }
    }, true).withLifecycle(this.defaultLifecycle);
    this.props.isRowSelected.sub(selected => {
      if (selected) {
        requestAnimationFrame(() => this.measureSlider());
      }
    }, true).withLifecycle(this.defaultLifecycle);

    this.props.brightnessValue.sub(value => {
      this.setSliderWidthByPct(value);
    }, true).withLifecycle(this.defaultLifecycle);

    // Mouse
    this.sliderEmptyRef.instance.addEventListener('mousedown', this.handleMouseDown);
    this.sliderEmptyRef.instance.addEventListener('mousemove', this.handleMouseMove);
    this.sliderEmptyRef.instance.addEventListener('mouseup', this.handleMouseUp);
    this.sliderEmptyRef.instance.addEventListener('mouseleave', this.handleMouseUp);
    this.sliderEmptyRef.instance.addEventListener('click', this.handleClick);
  }

  /**
   * Measures and caches slider left and width (called once per visibility/layout).
   */
  private measureSlider(): void {
    const rect = this.sliderEmptyRef.instance.getBoundingClientRect();
    this.sliderLeft = rect.left;
    this.sliderWidth = rect.width || 1;
  }

  /**
   * Converts the selected clientX position to percentage (0..100) using cached geometry and applies it to the filled bar.
   * @param clientX The clientX coordinate to convert.
   */
  private setBrightnessFromClientX(clientX: number): void {
    const x = MathUtils.clamp(clientX - this.sliderLeft, 0, this.sliderWidth);
    const pct = MathUtils.round((x / this.sliderWidth) * 100);
    this.props.setBrightness(pct);
  }

  /**
   * Sets the width of the filled bar to the specified percentage.
   * @param pct The percentage to set
   */
  private setSliderWidthByPct(pct: number): void {
    this.sliderFilledRef.instance.style.width = `${MathUtils.round(pct)}%`;
  }

  // --- Mouse handlers ---
  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.props.isRowSelected.get() || !this.props.isSliderEditing.get()) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.dragging = true;
    this.setBrightnessFromClientX(e.clientX);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.dragging) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.setBrightnessFromClientX(e.clientX);
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.dragging) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.dragging = false;
  };

  private handleClick = (e: MouseEvent): void => {
    if (this.props.isRowSelected.get()) {
      e.preventDefault();
      e.stopPropagation();
      if (!this.props.isSliderSelected.get() || !this.props.isSliderEditing.get()) {
        this.props.selectSlider();
      }
    }
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'brightness-slider-container': true,
        hidden: this.sliderHidden
      }}>
        <div class={{
          'brightness-slider-value': true,
          invisible: this.props.isSliderEditing.map(v => !v).withLifecycle(this.defaultLifecycle)
        }}>
          {this.props.brightnessValue.map(v => v.toFixed())}%
        </div>
        <div ref={this.sliderEmptyRef} class={{
          'brightness-slider-empty': true,
          'brightness-slider-selected': this.props.isSliderSelected,
        }}>
          <div ref={this.sliderFilledRef} class="brightness-slider-filled" />
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.sliderEmptyRef.instance.removeEventListener('mousedown', this.handleMouseDown);
    this.sliderEmptyRef.instance.removeEventListener('mousemove', this.handleMouseMove);
    this.sliderEmptyRef.instance.removeEventListener('mouseup', this.handleMouseUp);
    this.sliderEmptyRef.instance.removeEventListener('mouseleave', this.handleMouseUp);
    this.sliderEmptyRef.instance.removeEventListener('click', this.handleClick);

    super.destroy();
  }
}
