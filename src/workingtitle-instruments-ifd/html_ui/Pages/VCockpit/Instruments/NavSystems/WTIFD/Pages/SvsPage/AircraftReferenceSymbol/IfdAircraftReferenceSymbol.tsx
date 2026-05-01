import { ComponentProps, FSComponent, ImageCache, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdIcons } from '../../../IfdIcons';

import './IfdAircraftReferenceSymbol.css';

ImageCache.addToCache(IfdIcons.AircraftReferenceSymbol, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/svs-aircraft-ref-symbol.png');


/** Properties of the {@link IfdAircraftReferenceSymbol} component. */
export interface AircraftReferenceSymbolProps extends ComponentProps {
  /** Whether SynVis mode is On */
  svsEnabled: Subscribable<boolean>;
  /** Whether the SVS is fullscreen */
  svsFullscreen: Subscribable<boolean>;
}

/** The IFD Aircraft Reference Symbol */
export class IfdAircraftReferenceSymbol extends LifecycleComponent<AircraftReferenceSymbolProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();
  private readonly pngRef = FSComponent.createRef<HTMLImageElement>();
  private readonly shapeSvgRef = FSComponent.createRef<SVGElement>();
  private readonly shadowSvgRef = FSComponent.createRef<SVGElement>();

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  /**
   * Gets the base symbol SVG
   * @param type The type of the SVG. Only 'base' type or 'shadow' type allowed.
   * @returns The SVG element.
   */
  private getSymbolSvg(type: 'base' | 'shadow'): VNode {
    const trianglePath = type === 'base'
      ? 'M 0 0 L -76 27 L -21.2 27 L -21.2 19.4 L 21.2 19.4 L 21.2 27 L 76 27 z'
      : 'M 0 0 L -76 27 L -21.8 27 L -21.8 19 L 21.8 19 L 21.8 27 L 76 27 z';

    return (
      <>
        <path
          class="left-bullet-path"
          d="M -85.4 -2 L -94.4 -5 L -117 -5 L -117 1.2 L -94.4 1.2 z"
        />
        <path
          class="right-bullet-path"
          d="M 85.4 -2 L 94.4 1 L 117 1 L 117 -5.2 L 94.4 -5.2 z"
        />
        <path
          class="irregular-triangle-path"
          d={trianglePath}
        />
      </>
    );
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div
        ref={this.ref}
        class="wt-ifd-aircraft-reference-symbol-container"
        style={{ top: this.props.svsFullscreen.map((v) => v ? 'calc(50% - 17px)' : 'calc(50% - 5px)') }}
      >
        <svg
          ref={this.shadowSvgRef}
          class={{
            'wt-ifd-aircraft-reference-symbol': true,
            'shadow': true,
            'hidden': this.props.svsEnabled
          }}
          viewBox="-128 -7 256 36"
        >
          {this.getSymbolSvg('shadow')}
        </svg>
        <svg
          ref={this.shapeSvgRef}
          class={{
            'wt-ifd-aircraft-reference-symbol': true,
            'hidden': this.props.svsEnabled
          }}
          viewBox="-128 -7 256 36"
        >
          {this.getSymbolSvg('base')}
        </svg>
        <img
          ref={this.pngRef}
          class={{
            'wt-ifd-svs-aircraft-reference-symbol': true,
            'hidden': this.props.svsEnabled.map((v) => !v)
          }}
          src={IfdIcons.AircraftReferenceSymbol}
          alt="svs-enabled-aircraft-reference-symbol"
        />
      </div>
    );
  }
}
