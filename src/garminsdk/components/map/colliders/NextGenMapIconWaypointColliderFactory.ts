import { AbstractMapWaypointIcon, FacilityWaypointUtils, FlightPathWaypoint, MapWaypointIcon, Waypoint } from '@microsoft/msfs-sdk';

import { MapBasicWaypointCollider } from './MapBasicWaypointCollider';
import { MapWaypointCollider } from './MapWaypointCollider';
import { MapWaypointIconCollider } from './MapWaypointIconCollider';
import { MapWaypointIconColliderFactory } from './MapWaypointIconColliderFactory';

/**
 * Configuration options for {@link NextGenMapWaypointIconColliderFactory}.
 */
export type NextGenMapWaypointColliderFactoryOptions = {
  /** The scaling factor to use when sizing the colliders created by the factory. Defaults to `1`. */
  scale?: number;
};

/**
 * A factory that creates and manages next-generation (NXi, G3000, etc) Garmin map colliders for rendered waypoint icons.
 */
export class NextGenMapWaypointIconColliderFactory implements MapWaypointIconColliderFactory {
  private readonly scale: number;

  /**
   * Creates a new instance of NextGenMapWaypointColliderFactory.
   * @param options Options with which to configure the factory.
   */
  public constructor(options?: Readonly<NextGenMapWaypointColliderFactoryOptions>) {
    this.scale = options?.scale ?? 1;
  }

  /** @inheritDoc */
  public createCollider(waypoint: Waypoint, renderRole: number, icon: MapWaypointIcon<Waypoint>): MapWaypointCollider | null {
    if (FacilityWaypointUtils.isFacilityWaypoint(waypoint) || waypoint instanceof FlightPathWaypoint) {
      if (icon instanceof AbstractMapWaypointIcon) {
        return new MapWaypointIconCollider(waypoint, icon, icon.priority, 14 * this.scale);
      } else {
        return new MapBasicWaypointCollider(waypoint, icon.priority, 14 * this.scale);
      }
    } else {
      return null;
    }
  }

  /** @inheritDoc */
  public updateCollider(waypoint: Waypoint, renderRole: number, icon: MapWaypointIcon<Waypoint>, collider: MapWaypointCollider | null): MapWaypointCollider | null {
    if (FacilityWaypointUtils.isFacilityWaypoint(waypoint) || waypoint instanceof FlightPathWaypoint) {
      if (icon instanceof AbstractMapWaypointIcon) {
        // The icon is a AbstractMapWaypointIcon -> update the existing collider if it is a MapWaypointIconCollider,
        // otherwise return a new MapWaypointIconCollider.
        if (collider instanceof MapWaypointIconCollider) {
          collider.setIcon(icon);
          collider.setPriority(icon.priority);
          return collider;
        } else {
          return new MapWaypointIconCollider(waypoint, icon, icon.priority, 14 * this.scale);
        }
      } else {
        // The icon is not a AbstractMapWaypointIcon -> return a new MapBasicWaypointCollider if the existing collider
        // is not a MapBasicWaypointCollider, otherwise update the existing collider.
        if (
          collider instanceof MapWaypointIconCollider
          || !collider
          || !(collider instanceof MapBasicWaypointCollider)
        ) {
          return new MapBasicWaypointCollider(waypoint, icon.priority, 14 * this.scale);
        } else {
          collider.setPriority(icon.priority);
          return collider;
        }
      }
    } else {
      return null;
    }
  }

  /** @inheritDoc */
  public cleanupCollider(collider: MapWaypointCollider): void {
    collider.destroy();
  }
}
