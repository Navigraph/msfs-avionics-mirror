import { ComponentProps, FSComponent, LifecycleComponent, MappedSubject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdSvsController } from './IfdSvsController';

import './SvsFovDisplay.css';

/** The properties for the {@link SvsFovDisplay} component. */
interface SvsFovDisplayProps extends ComponentProps {
  /** The synopsis visibility mode. */
  synVisEnabled: Subscribable<boolean>;
  /** The synopsis visibility field of view. */
  synVisFov: Subscribable<number>;
}

/** Component to display the SVS Field of view */
export class SvsFovDisplay extends LifecycleComponent<SvsFovDisplayProps> {
  private readonly svsFovContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly svsFovLeftRef = FSComponent.createRef<SVGElement>();
  private readonly svsFovRightRef = FSComponent.createRef<SVGElement>();

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    MappedSubject
      .create(([enabled, fov]) => {
        this.svsFovContainerRef.instance.classList.toggle('hidden', !enabled || fov === IfdSvsController.SYN_VIS_MAX_FOV);
        const angle = fov / 2;
        this.svsFovLeftRef.instance.style.transform = `rotate(${-angle}deg)`;
        this.svsFovRightRef.instance.style.transform = `rotate(${angle}deg)`;
      }, this.props.synVisEnabled, this.props.synVisFov)
      .withLifecycle(this.defaultLifecycle);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="svs-fov-display" ref={this.svsFovContainerRef}>
        <svg class="svs-fov-line" viewBox="0 0 6 173" ref={this.svsFovLeftRef}>
          <path d="M 3 1 l 0 173" />
        </svg>
        <svg class="svs-fov-line" ref={this.svsFovRightRef}>
          <path d="M 3 1 l 0 173" />
        </svg>
      </div>
    );
  }
}
