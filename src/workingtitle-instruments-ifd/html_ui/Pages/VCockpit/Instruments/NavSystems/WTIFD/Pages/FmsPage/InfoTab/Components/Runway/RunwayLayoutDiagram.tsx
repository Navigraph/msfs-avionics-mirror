import { AirportFacility, Facility, FacilityType, FSComponent, ICAO, LifecycleComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { RunwayLayoutDiagramUtils } from './RunwayLayoutDiagramUtils';

/** The properties for the {@link RunwayLayoutDiagram} component. */
interface RunwayLayoutDiagramProps {
  /** The airport for which to render the diagram. */
  readonly airport: Subscribable<Facility | undefined>;
  /** The index of the selected runway. */
  readonly selectedIndex: Subscribable<number | null>;
  /** The index of the expanded runway. */
  readonly expandedIndex: Subscribable<number | null>;
}

/** Renders a runway layout diagram for the given airport. */
export class RunwayLayoutDiagram extends LifecycleComponent<RunwayLayoutDiagramProps> {
  private readonly hasMultipleRunways = Subject.create(false);
  private readonly viewBox = Subject.create('');
  private readonly basePath = Subject.create('');
  private readonly runwayPaths: string[] = [];
  private readonly highlightedPath = Subject.create('');

  private readonly layoutDiagramHidden = MappedSubject.create(
    ([hasMultipleRunways, expandedIndex]) => !hasMultipleRunways || expandedIndex !== null,
    this.hasMultipleRunways,
    this.props.expandedIndex,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.airport.sub((airport) => {
      this.runwayPaths.length = 0;

      if (!airport || ICAO.getFacilityTypeFromValue(airport.icaoStruct) !== FacilityType.Airport || (airport as AirportFacility).runways.length <= 1) {
        this.hasMultipleRunways.set(false);
        this.basePath.set('');
        this.viewBox.set('');
        this.highlightedPath.set('');
        return;
      }

      const diagram = RunwayLayoutDiagramUtils.buildAirportRunwayLayoutDiagram(airport as AirportFacility, {
        margin: 10,
        precision: 0.01,
      });

      if (!diagram.hasRunways) {
        this.hasMultipleRunways.set(false);
        this.basePath.set('');
        this.viewBox.set(diagram.viewBox);
        this.highlightedPath.set('');
        return;
      }

      this.viewBox.set(diagram.viewBox);
      this.basePath.set(diagram.path);
      this.runwayPaths.push(...diagram.runwayPaths);
      this.hasMultipleRunways.set(true);
    }, true).withLifecycle(this.defaultLifecycle);

    this.props.selectedIndex.sub((index) => {
      if (index === null || index < 0 || index >= this.runwayPaths.length) {
        this.highlightedPath.set('');
      } else {
        this.highlightedPath.set(this.runwayPaths[index] ?? '');
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'runway-layout-diagram-container': true,
        hidden: this.layoutDiagramHidden,
      }}>
        <svg class="runway-layout-diagram" viewBox={this.viewBox}>
          <path
            class="runway-diagram-base-path"
            d={this.basePath}
            stroke-width="5"
            fill="none"
            vector-effect="non-scaling-stroke"
          />
          <path
            class="runway-diagram-highlighted-path"
            d={this.highlightedPath}
            stroke-width="5"
            fill="none"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  }
}
