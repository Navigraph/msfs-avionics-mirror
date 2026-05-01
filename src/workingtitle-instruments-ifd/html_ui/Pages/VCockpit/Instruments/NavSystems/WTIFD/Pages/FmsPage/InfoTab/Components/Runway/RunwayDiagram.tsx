import { AirportRunway, ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

/** The properties for the {@link RunwayDiagram} component. */
interface RunwayDiagramProps extends ComponentProps {
  /** The runway to display */
  readonly runway: AirportRunway;
  /** Whether the diagram is visible */
  readonly isVisible: Subscribable<boolean>;
}

/** A component to display a simple visual representation of a runway, with threshold numbers */
export class RunwayDiagram extends LifecycleComponent<RunwayDiagramProps> {
  private readonly runwayRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.runwayRef.instance.style.transform = `rotate(${this.props.runway.direction}deg)`;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{ 'runway-diagram-container': true, hidden: this.props.isVisible.map(v => !v).withLifecycle(this.defaultLifecycle) }}>
        <div class="runway-diagram" ref={this.runwayRef}>
          <svg viewBox="0 0 32 140" width="32" height="140">
            <path
              d="M 2 20 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 20 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 34.29 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 34.29 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 48.57 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 48.57 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 62.86 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 62.86 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 77.14 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 77.14 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 91.43 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 91.43 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 105.71 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 105.71 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 2 120 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0 M 32 120 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 -0"
              stroke="none"
              fill="#FFFFFF"
            />
            <path
              d="M 16 22 l 0 13.8 m 0 7 l 0 13.8 m 0 7 l 0 13.8 m 0 7 l 0 13.8 m 0 7 l 0 13.8"
              stroke="var(--wtdyne-color-gray-2)"
              stroke-width="2"
              fill="none"
            />
            <path
              d="M 17 39 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 0 M 17 59.8 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 0 M 17 80.6 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 0 M 17 101.45 a 0.5 0.5 90 0 0 -2 0 a 0.5 0.5 90 0 0 2 0"
              stroke="none"
              fill="#FFFFFF"
            />
          </svg>
          <div class="threshold-number primary">{this.props.runway.designation.split('-')[0] ?? ''}</div>
          <div class="threshold-number secondary">{this.props.runway.designation.split('-')[1] ?? ''}</div>
        </div>
      </div>
    );
  }
}
