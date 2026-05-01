import { LatLonInterface } from '../../geo';
import { BitFlags } from '../../math';
import { ReadonlySubEvent, SubEvent } from '../../sub/SubEvent';
import { MapCullableTextLabel, MapCullableTextLabelManager } from './MapCullableTextLabel';
import { MapProjection } from './MapProjection';
import { MapWaypoint } from './MapWaypoint';
import { MapWaypointIcon } from './MapWaypointIcon';

/**
 * A waypoint icon factory.
 */
export interface MapWaypointRendererIconFactory<W extends MapWaypoint> {
  /**
   * Gets an icon for a waypoint.
   * @param role The role that was selected for the waypoint for rendering.
   * @param waypoint The waypoint for which to get an icon.
   * @returns A waypoint icon.
   */
  getIcon<T extends W>(role: number, waypoint: T): MapWaypointIcon<T> | null;

  /**
   * Cleans up an icon for a waypoint. This method is called when an icon that was previously selected to be rendered
   * is no longer needed for rendering.
   * 
   * Note that even though the icon to clean up is no longer being rendered, external references to the icon may still
   * exist.
   * @param role The role under which the icon to clean up was rendered.
   * @param waypoint The waypoint for the icon to clean up.
   * @param icon The icon to clean up.
   */
  cleanupIcon?<T extends W>(role: number, waypoint: T, icon: MapWaypointIcon<T>): void;
}

/**
 * A waypoint label factory.
 */
export interface MapWaypointRendererLabelFactory<W extends MapWaypoint> {
  /**
   * Gets a label for a waypoint.
   * @param role The role that was selected for the waypoint for rendering.
   * @param waypoint The waypoint for which to get a label.
   * @returns A waypoint label.
   */
  getLabel<T extends W>(role: number, waypoint: T): MapCullableTextLabel | null;

  /**
   * Cleans up a label for a waypoint. This method is called when a label that was previously selected to be rendered
   * is no longer needed for rendering.
   * 
   * Note that even though the label to clean up is no longer being rendered, external references to the label may
   * still exist.
   * @param role The role under which the label to clean up was rendered.
   * @param waypoint The waypoint for the label to clean up.
   * @param icon The label to clean up.
   */
  cleanupLabel?<T extends W>(role: number, waypoint: T, label: MapCullableTextLabel): void;
}

/**
 * A render role definition.
 */
export type MapWaypointRenderRoleDef<W extends MapWaypoint> = {
  /** The icon factory used to create icons for the render role. */
  iconFactory: MapWaypointRendererIconFactory<W> | null,

  /** The label factory used to create labels for the render role. */
  labelFactory: MapWaypointRendererLabelFactory<W> | null,

  /** The canvas rendering context used to draw icons and labels for the render role. */
  canvasContext: CanvasRenderingContext2D | null,

  /** A function which determines whether a waypoint is visible under the render role. */
  visibilityHandler: (waypoint: W) => boolean;
}

/**
 * A function which selects roles under which to render waypoints.
 */
export type MapWaypointRenderRoleSelector<W extends MapWaypoint> = (
  entry: MapWaypointRendererEntry<W>,
  roleDefinitions: ReadonlyMap<number, Readonly<MapWaypointRenderRoleDef<W>>>
) => number;

/**
 * Gets the waypoint type supported by a waypoint renderer.
 */
export type MapWaypointRendererType<Renderer> = Renderer extends MapWaypointRenderer<infer W> ? W : never;

/**
 * A description of a rendered waypoint icon.
 */
export type MapWaypointRenderedIcon<W extends MapWaypoint> = {
  /** The waypoint for the icon. */
  waypoint: W;

  /** The render role under which the icon was rendered. */
  renderedRole: number;

  /** The icon. */
  icon: MapWaypointIcon<W>;
};

/**
 * A description of a rendered waypoint label.
 */
export type MapWaypointRenderedLabel<W extends MapWaypoint> = {
  /** The waypoint for the label. */
  waypoint: W;

  /** The render role under which the label was rendered. */
  renderedRole: number;

  /** The label. */
  label: MapCullableTextLabel;
};

/**
 * Types of waypoint render events used by {@link MapWaypointRenderer}.
 */
export enum MapWaypointRenderEventType {
  /** A waypoint icon or label was rendered after it had not been rendered in the preceding render cycle. */
  Added,

  /**
   * An waypoint icon or label was rendered under a different role or with a different icon/label compared to the
   * role or icon/label used to render the waypoint in the preceding render cycle.
   */
  Modified,

  /** An waypoint icon or label was not rendered after it had been rendered in the preceding render cycle. */
  Removed,
}

/**
 * An event describing a change in the rendering of a map waypoint icon.
 */
export type MapWaypointIconRenderEvent<W extends MapWaypoint> = {
  /** The type of this event. */
  readonly type: MapWaypointRenderEventType;

  /** The waypoint associated with the rendered icon. */
  readonly waypoint: W;

  /**
   * The role under which the icon was rendered. If the icon was removed from rendering, then this is the role under
   * which the icon was last rendered.
   */
  readonly renderedRole: number;

  /** The icon that was rendered. If the icon was removed from rendering, then this is the last icon that was rendered. */
  readonly icon: MapWaypointIcon<W>;
}

/**
 * An event describing a change in the rendering of a map waypoint label.
 */
export type MapWaypointLabelRenderEvent<W extends MapWaypoint> = {
  /** The type of this event. */
  readonly type: MapWaypointRenderEventType;

  /** The waypoint associated with the rendered icon. */
  readonly waypoint: W;

  /**
   * The role under which the label was rendered. If the label was removed from rendering, then this is the role under
   * which the label was last rendered.
   */
  readonly renderedRole: number;

  /**
   * The label that was rendered. If the label was removed from rendering, then this is the last label that was
   * rendered.
   */
  readonly label: MapCullableTextLabel;
};

/**
 * A renderer that draws waypoints to a map. For the renderer to draw a waypoint, the waypoint must first be registered
 * with the renderer. Waypoints may be registered under multiple render roles. Each render role is represented as a bit
 * flag. During each render cycle, a specific role is chosen for each waypoint by a selector function. Once the role is
 * chosen, the waypoint will be rendered in that role.
 */
export class MapWaypointRenderer<W extends MapWaypoint = MapWaypoint> {
  /** A null render role definition. Icons rendered under this role are never visible. */
  protected static readonly NULL_ROLE_DEF = {
    iconFactory: null,
    labelFactory: null,
    canvasContext: null,
    visibilityHandler: (): boolean => true
  };

  /**
   * Sorts waypoint entries such that those with icons of higher priority are sorted after those with icons of lower
   * priority.
   * @param a The first waypoint entry to sort.
   * @param b The second waypoint entry to sort.
   * @returns A negative number if the first entry is to be sorted before the second, a positive number if the second
   * entry is to be sorted before the first, and zero if the entries' relative sorting order does not matter.
   */
  protected static readonly ENTRY_SORT_FUNC = (a: MapWaypointRendererEntry<any>, b: MapWaypointRendererEntry<any>): number => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return a.icon!.priority.get() - b.icon!.priority.get();
  };

  /**
   * The default render role selector. For each waypoint entry, iterates through all possible render roles in the order
   * they were originally added to the renderer and selects the first role under which the entry is registered and is
   * visible.
   * @param entry A waypoint entry.
   * @param roleDefinitions A map from all possible render roles to their definitions.
   * @returns The role under which the waypoint entry should be rendered, or 0 if the entry should not be rendered
   * under any role.
   */
  public static readonly DEFAULT_RENDER_ROLE_SELECTOR = <T extends MapWaypoint>(
    entry: MapWaypointRendererEntry<T>,
    roleDefinitions: ReadonlyMap<number, Readonly<MapWaypointRenderRoleDef<T>>>
  ): number => {
    for (const role of roleDefinitions.keys()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (entry.isAllRoles(role) && roleDefinitions.get(role)!.visibilityHandler(entry.waypoint)) {
        return role;
      }
    }

    return 0;
  };

  protected readonly registered = new Map<string, MapWaypointRendererEntry<W>>();
  protected readonly toCleanUp = new Set<MapWaypointRendererEntry<W>>();

  protected readonly _renderedIcons = new Map<string, MapWaypointRenderedIcon<W>>();

  protected readonly scratchIconRenderEvent = {
    type: undefined as MapWaypointRenderEventType | undefined,
    waypoint: undefined as W | undefined,
    renderedRole: 0,
    icon: undefined as MapWaypointIcon<W> | undefined,
  } satisfies Partial<MapWaypointIconRenderEvent<W>>;

  protected readonly _renderedLabels = new Map<string, MapWaypointRenderedLabel<W>>();

  protected readonly scratchLabelRenderEvent = {
    type: undefined as MapWaypointRenderEventType | undefined,
    waypoint: undefined as W | undefined,
    renderedRole: 0,
    label: undefined as MapCullableTextLabel | undefined,
  } satisfies Partial<MapWaypointLabelRenderEvent<W>>;

  /**
   * This renderer's render role definitions. Waypoints assigned to be rendered under a role or combination of roles
   * with no definition will not be rendered.
   */
  protected readonly roleDefinitions = new Map<number, MapWaypointRenderRoleDef<W>>();

  /**
   * An array of this renderer's role definitions. This array is kept in sync with the `roleDefinitions` map.
   */
  protected readonly roleDefinitionsArray: MapWaypointRenderRoleDef<W>[] = [];

  /** An event that notifies when a waypoint has been registered with this renderer under at least one render role. */
  public readonly onWaypointAdded = new SubEvent<MapWaypointRenderer<W>, W>();

  /** An event that notifies when a waypoint has been deregistered with this renderer under all render roles. */
  public readonly onWaypointRemoved = new SubEvent<MapWaypointRenderer<W>, W>();

  protected readonly _onIconRenderEvent = new SubEvent<MapWaypointRenderer<W>, MapWaypointIconRenderEvent<W>>();
  /**
   * An event that notifies when the rendering of an icon for a waypoint changes. Changes include when an icon is newly
   * rendered for a waypoint, when the rendered icon changes for a waypoint, and when the icon for a waypoint is no
   * longer rendered.
   * 
   * The definition of _rendered_ used by this event is when an icon is drawn to its target canvas context. An icon
   * that has been drawn but is not visible to the user due to downstream effects (for example, if the canvas is
   * hidden or the drawn label is occluded by a clip path) is still considered to be rendered.
   * 
   * The data object passed to event handlers is only guaranteed to be valid at the moment the handler is called. If a
   * handler needs to retain the data past this moment, then it is recommended that a copy of the data be made.
   */
  public readonly onIconRenderEvent = this._onIconRenderEvent as ReadonlySubEvent<MapWaypointRenderer<W>, MapWaypointIconRenderEvent<W>>;

  protected readonly _onLabelRenderEvent = new SubEvent<MapWaypointRenderer<W>, MapWaypointLabelRenderEvent<W>>();
  /**
   * An event that notifies when the rendering of a label for a waypoint changes. Changes include when a label is newly
   * rendered for a waypoint, when the rendered label changes for a waypoint, and when the label for a waypoint is no
   * longer rendered.
   * 
   * The definition of _rendered_ used by this event is when a label is registered with the text label manager. A label
   * that is registered with the text label manager but is not visible to the user due to downstream effects (for
   * example, if the manager has culled the label or has not been updated to draw the label) is still considered to be
   * rendered.
   * 
   * The data object passed to event handlers is only guaranteed to be valid at the moment the handler is called. If a
   * handler needs to retain the data past this moment, then it is recommended that a copy of the data be made.
   */
  public readonly onLabelRenderEvent = this._onLabelRenderEvent as ReadonlySubEvent<MapWaypointRenderer<W>, MapWaypointLabelRenderEvent<W>>;

  /**
   * Creates a new instance of MapWaypointRenderer.
   * @param textManager The text label manager to use for waypoint labels.
   * @param selectRoleToRender A function which selects roles under which to render waypoints. Defaults to
   * {@link MapWaypointRenderer.DEFAULT_RENDER_ROLE_SELECTOR}.
   */
  public constructor(
    protected readonly textManager: MapCullableTextLabelManager,
    protected readonly selectRoleToRender: MapWaypointRenderRoleSelector<W> = MapWaypointRenderer.DEFAULT_RENDER_ROLE_SELECTOR
  ) {
  }

  /**
   * Checks whether a render role has been added to this renderer.
   * @param role The render role to check.
   * @returns Whether the render role has been added to this renderer.
   */
  public hasRenderRole(role: number): boolean {
    return this.roleDefinitions.has(role);
  }

  /**
   * Adds a render role to this renderer. If the role has already been added to this renderer, this method does
   * nothing.
   * @param role The render role to add.
   * @param def The render role's definition. If undefined, the new role will be assigned a default definition with
   * no defined rendering context, icon, or label factories, and a visibility handler which always returns true.
   * @returns Whether the render role was successfully added.
   */
  public addRenderRole(role: number, def?: MapWaypointRenderRoleDef<W>): boolean {
    if (this.roleDefinitions.has(role)) {
      return false;
    }

    const definition = Object.assign({}, def ?? MapWaypointRenderer.NULL_ROLE_DEF);
    this.roleDefinitions.set(role, definition);
    this.roleDefinitionsArray.push(definition);

    return true;
  }

  /**
   * Removes a render role from this renderer.
   * @param role The render role to remove.
   * @returns Whether the render role was successfully removed.
   */
  public removeRenderRole(role: number): boolean {
    const definition = this.roleDefinitions.get(role);
    if (definition) {
      this.roleDefinitions.delete(role);
      this.roleDefinitionsArray.splice(this.roleDefinitionsArray.indexOf(definition), 1);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Gets the definition for a render role.
   * @param role A render role.
   * @returns The definition for the specified render role, or undefined if no such role has been added to this
   * renderer.
   */
  public getRenderRoleDefinition(role: number): Readonly<MapWaypointRenderRoleDef<W>> | undefined {
    return this.roleDefinitions.get(role);
  }

  /**
   * Gets an iterable of render roles added to this renderer. The iterable will return the roles in the order in which
   * they were added.
   * @returns An iterable of render roles added to this renderer.
   */
  public renderRoles(): IterableIterator<number> {
    return this.roleDefinitions.keys();
  }

  /**
   * Removes all render roles from this renderer.
   */
  public clearRenderRoles(): void {
    this.roleDefinitions.clear();
    this.roleDefinitionsArray.length = 0;
  }

  /**
   * Sets the factory to use to create waypoint icons for a render role. If the render role has not been added to this
   * renderer, this method does nothing.
   * @param role A render role.
   * @param factory A waypoint icon factory.
   * @returns Whether the factory was set.
   */
  public setIconFactory(role: number, factory: MapWaypointRendererIconFactory<W>): boolean {
    const roleDef = this.roleDefinitions.get(role);

    if (!roleDef) {
      return false;
    }

    roleDef.iconFactory = factory;
    return true;
  }

  /**
   * Sets the factory to use to create waypoint labels for a render role. If the render role has not been added to this
   * renderer, this method does nothing.
   * @param role A render role.
   * @param factory A waypoint label factory.
   * @returns Whether the factory was set.
   */
  public setLabelFactory(role: number, factory: MapWaypointRendererLabelFactory<W>): boolean {
    const roleDef = this.roleDefinitions.get(role);

    if (!roleDef) {
      return false;
    }

    roleDef.labelFactory = factory;
    return true;
  }

  /**
   * Sets the canvas rendering context for a render role. If the render role has not been added to this renderer, this
   * method does nothing.
   * @param role A render role.
   * @param context A canvas 2D rendering context.
   * @returns Whether the context was set.
   */
  public setCanvasContext(role: number, context: CanvasRenderingContext2D): boolean {
    const roleDef = this.roleDefinitions.get(role);

    if (!roleDef) {
      return false;
    }

    roleDef.canvasContext = context;
    return true;
  }

  /**
   * Sets the handler that determines if a waypoint should visible for a render role. If the render role has not been
   * added to this renderer, this method does nothing.
   * @param role A render role.
   * @param handler A function that determines if a waypoint should be visible.
   * @returns Whether the handler was set.
   */
  public setVisibilityHandler(role: number, handler: (waypoint: W) => boolean): boolean {
    const roleDef = this.roleDefinitions.get(role);

    if (!roleDef) {
      return false;
    }

    roleDef.visibilityHandler = handler;
    return true;
  }

  /**
   * Checks if a waypoint is registered with this renderer. A role or roles can be optionally specified such that the
   * method will only return true if the waypoint is registered under those specific roles.
   * @param waypoint A waypoint.
   * @param role The specific role(s) to check.
   * @returns whether the waypoint is registered with this renderer.
   */
  public isRegistered(waypoint: W, role?: number): boolean {
    if (!waypoint) {
      return false;
    }

    const entry = this.registered.get(waypoint.uid);
    if (!entry) {
      return false;
    }

    if (role === undefined) {
      return true;
    }
    return entry.isAllRoles(role);
  }

  /**
   * Registers a waypoint with this renderer under a specific role or roles. Registered waypoints will be drawn as
   * appropriate the next time this renderer's update() method is called. Registering a waypoint under a role under
   * which it is already registered has no effect unless the source of the registration is different.
   * @param waypoint The waypoint to register.
   * @param role The role(s) under which the waypoint should be registered.
   * @param sourceId A unique string ID for the source of the registration.
   */
  public register(waypoint: W, role: number, sourceId: string): void {
    if (role === 0 || sourceId === '') {
      return;
    }

    let entry = this.registered.get(waypoint.uid);
    if (!entry) {
      entry = new MapWaypointRendererEntry<W>(waypoint, this.textManager, this.roleDefinitions, this.selectRoleToRender);
      this.registered.set(waypoint.uid, entry);
      this.onWaypointAdded.notify(this, waypoint);
    }

    entry.addRole(role, sourceId);
  }

  /**
   * Removes a registration for a waypoint for a specific role or roles. Once all of a waypoint's registrations for a
   * role are removed, it will no longer be rendered in that role the next this renderer's update() method is called.
   * @param waypoint The waypoint to deregister.
   * @param role The role(s) from which the waypoint should be deregistered.
   * @param sourceId The unique string ID for the source of the registration to remove.
   */
  public deregister(waypoint: W, role: number, sourceId: string): void {
    if (role === 0 || sourceId === '') {
      return;
    }

    const entry = this.registered.get(waypoint.uid);
    if (!entry) {
      return;
    }

    entry.removeRole(role, sourceId);
    if (entry.roles === 0) {
      this.deleteEntry(entry);
      this.onWaypointRemoved.notify(this, waypoint);
    }
  }

  /**
   * Deletes and cleans up a registered waypoint entry.
   * @param entry The entry to delete.
   */
  private deleteEntry(entry: MapWaypointRendererEntry<W>): void {
    this.registered.delete(entry.waypoint.uid);
    this.toCleanUp.add(entry);
  }

  /**
   * Gets an iterable of all currently rendered waypoint icons, in no particular order.
   * 
   * The definition of _rendered_ used by this method is when an icon is drawn to its target canvas context. An icon
   * that has been drawn but is not visible to the user due to downstream effects (for example, if the canvas is
   * hidden or the drawn label is occluded by a clip path) is still considered to be rendered.
   * @returns An iterable of all currently rendered waypoint icons, in no particular order.
   */
  public renderedIcons(): IterableIterator<Readonly<MapWaypointRenderedIcon<W>>> {
    return this._renderedIcons.values();
  }

  /**
   * Gets an iterable of all currently rendered waypoint labels, in no particular order.
   * 
   * The definition of _rendered_ used by this method is when a label is registered with the text label manager. A
   * label that is registered with the text label manager but is not visible to the user due to downstream effects (for
   * example, if the manager has culled the label or has not been updated to draw the label) is still considered to be
   * rendered.
   * @returns An iterable of all currently rendered waypoint labels, in no particular order.
   */
  public renderedLabels(): IterableIterator<Readonly<MapWaypointRenderedLabel<W>>> {
    return this._renderedLabels.values();
  }

  private readonly entriesToDrawIcon: MapWaypointRendererEntry<W>[] = [];

  /**
   * Redraws waypoints registered with this renderer.
   * @param mapProjection The map projection to use.
   */
  public update(mapProjection: MapProjection): void {
    const projectedSize = mapProjection.getProjectedSize();
    const roleDefCount = this.roleDefinitionsArray.length;
    for (let i = 0; i < roleDefCount; i++) {
      const context = this.roleDefinitionsArray[i].canvasContext;
      if (context) {
        context.clearRect(0, 0, projectedSize[0], projectedSize[1]);
      }
    }

    this.toCleanUp.forEach(this.cleanUpEntryFunc);
    this.toCleanUp.clear();

    this.registered.forEach(this.prepareEntryToDrawFunc);

    this.entriesToDrawIcon.sort(MapWaypointRenderer.ENTRY_SORT_FUNC);
    const entriesToDrawCount = this.entriesToDrawIcon.length;
    for (let i = 0; i < entriesToDrawCount; i++) {
      const entry = this.entriesToDrawIcon[i];

      // NOTE: All entries in the entriesToDrawIcon array must have defined icons and by extension must also have
      // defined last rendered role definitions.
      const icon = entry.icon!;
      const context = entry.lastRenderedRoleDefinition!.canvasContext;
      if (context) {
        icon.draw(context, mapProjection);
      }

      const prevRenderedIcon = this._renderedIcons.get(entry.waypoint.uid);
      if (prevRenderedIcon) {
        if (
          prevRenderedIcon.renderedRole !== entry.lastRenderedRole
          || prevRenderedIcon.icon !== icon
        ) {
          prevRenderedIcon.renderedRole = entry.lastRenderedRole;
          prevRenderedIcon.icon = icon;

          this.sendIconRenderEvent(MapWaypointRenderEventType.Modified, entry.waypoint, entry.lastRenderedRole, icon);
        }
      } else {
        this._renderedIcons.set(entry.waypoint.uid, { waypoint: entry.waypoint, renderedRole: entry.lastRenderedRole, icon });

        this.sendIconRenderEvent(MapWaypointRenderEventType.Added, entry.waypoint, entry.lastRenderedRole, icon);
      }
    }

    this.entriesToDrawIcon.length = 0;

    // Clean up the scratch events so that we don't leak references.
    this.scratchIconRenderEvent.waypoint = undefined;
    this.scratchIconRenderEvent.icon = undefined;
    this.scratchLabelRenderEvent.waypoint = undefined;
    this.scratchLabelRenderEvent.label = undefined;
  }

  private readonly prepareEntryToDrawFunc = this.prepareEntryToDraw.bind(this);

  /**
   * Prepares a waypoint entry to be drawn. The entry is updated and if its icon is to be drawn, then the entry is
   * added to the `entriesToDrawIcon` array.
   * @param entry The entry to prepare.
   */
  private prepareEntryToDraw(entry: MapWaypointRendererEntry<W>): void {
    entry.update();

    if (entry.icon) {
      this.entriesToDrawIcon.push(entry);
    } else {
      this.removeRenderedIcon(entry.waypoint.uid);
    }

    if (entry.label) {
      const prevRenderedLabel = this._renderedLabels.get(entry.waypoint.uid);
      if (prevRenderedLabel) {
        if (
          prevRenderedLabel.renderedRole !== entry.lastRenderedRole
          || prevRenderedLabel.label !== entry.label
        ) {
          prevRenderedLabel.renderedRole = entry.lastRenderedRole;
          prevRenderedLabel.label = entry.label;

          this.sendLabelRenderEvent(MapWaypointRenderEventType.Modified, entry.waypoint, entry.lastRenderedRole, entry.label);
        }
      } else {
        this._renderedLabels.set(entry.waypoint.uid, { waypoint: entry.waypoint, renderedRole: entry.lastRenderedRole, label: entry.label });

        this.sendLabelRenderEvent(MapWaypointRenderEventType.Added, entry.waypoint, entry.lastRenderedRole, entry.label);
      }
    } else {
      this.removeRenderedLabel(entry.waypoint.uid);
    }
  }

  private readonly cleanUpEntryFunc = this.cleanUpEntry.bind(this);

  /**
   * Cleans up a waypoint entry. This will destroy the entry and render it unusable.
   * @param entry The entry to clean up.
   */
  private cleanUpEntry(entry: MapWaypointRendererEntry<W>): void {
    entry.destroy();

    this.removeRenderedIcon(entry.waypoint.uid);
    this.removeRenderedLabel(entry.waypoint.uid);
  }

  /**
   * Removes a rendered icon from this renderer's tracked list of rendered icons and notifies subscribers of the
   * removal.
   * @param uid The UID of the waypoint for the icon to remove.
   */
  protected removeRenderedIcon(uid: string): void {
    const renderedIcon = this._renderedIcons.get(uid);
    if (renderedIcon) {
      this._renderedIcons.delete(uid);
      this.sendIconRenderEvent(MapWaypointRenderEventType.Removed, renderedIcon.waypoint, renderedIcon.renderedRole, renderedIcon.icon);
    }
  }

  /**
   * Removes a rendered label from this renderer's tracked list of rendered labels and notifies subscribers of the
   * removal.
   * @param uid The UID of the waypoint for the label to remove.
   */
  protected removeRenderedLabel(uid: string): void {
    const renderedLabel = this._renderedLabels.get(uid);
    if (renderedLabel) {
      this._renderedLabels.delete(uid);
      this.sendLabelRenderEvent(MapWaypointRenderEventType.Removed, renderedLabel.waypoint, renderedLabel.renderedRole, renderedLabel.label);
    }
  }

  /**
   * Sends an icon render event.
   * @param type The type of the event.
   * @param waypoint The event's waypoint.
   * @param renderedRole The event's render role.
   * @param icon The event's icon.
   */
  protected sendIconRenderEvent(type: MapWaypointRenderEventType, waypoint: W, renderedRole: number, icon: MapWaypointIcon<W>): void {
    const event = this.scratchIconRenderEvent;
    event.type = type;
    event.waypoint = waypoint;
    event.renderedRole = renderedRole;
    event.icon = icon;

    this._onIconRenderEvent.notify(this, event as MapWaypointIconRenderEvent<W>);
  }

  /**
   * Sends a label render event.
   * @param type The type of the event.
   * @param waypoint The event's waypoint.
   * @param renderedRole The event's render role.
   * @param label The event's label.
   */
  protected sendLabelRenderEvent(type: MapWaypointRenderEventType, waypoint: W, renderedRole: number, label: MapCullableTextLabel): void {
    const event = this.scratchLabelRenderEvent;
    event.type = type;
    event.waypoint = waypoint;
    event.renderedRole = renderedRole;
    event.label = label;

    this._onLabelRenderEvent.notify(this, event as MapWaypointLabelRenderEvent<W>);
  }

  /**
   * Gets the nearest waypoint currently registered in the renderer.
   * @param pos The position to get the closest waypoint to.
   * @param first A predicate that will search the list of closest waypoints for a match, and return the first one found.
   * @returns The nearest waypoint, or undefined if none found.
   */
  public getNearestWaypoint<T extends W = W>(pos: LatLonInterface, first?: (waypoint: W) => boolean): T | undefined {
    const ordered = [...this.registered.values()].sort((a, b) => this.orderByDistance(a.waypoint, b.waypoint, pos))
      .filter(w => {
        const roleDef = this.getRenderRoleDefinition(w.lastRenderedRole);
        if (roleDef !== undefined) {
          return roleDef.visibilityHandler(w.waypoint);
        }

        return false;
      });

    if (first !== undefined) {
      return ordered.find(entry => first(entry.waypoint))?.waypoint as unknown as T;
    }

    return ordered[0]?.waypoint as unknown as T;
  }

  /**
   * Orders waypoints by their distance to the plane PPOS.
   * @param a The first waypoint.
   * @param b The second waypoint.
   * @param pos The position to compare against.
   * @returns The comparison order number.
   */
  private orderByDistance(a: MapWaypoint, b: MapWaypoint, pos: LatLonInterface): number {
    const aDist = a.location.get().distance(pos);
    const bDist = b.location.get().distance(pos);

    return aDist - bDist;
  }
}

/**
 * An entry for a waypoint registered with {@link MapWaypointRenderer}.
 */
export class MapWaypointRendererEntry<W extends MapWaypoint> {
  private readonly registrations: Record<number, Set<string> | undefined> = {};

  /** The render role(s) assigned to this entry. */
  public readonly roles = 0;

  /**
   * The role under which this entry was last rendered, or `0` if this entry was not rendered in the last render
   * update.
   */
  public readonly lastRenderedRole = 0;

  /**
   * The definition for the role under which this entry was last rendered, or `null` if this entry was not rendered
   * in the last render update.
   */
  public readonly lastRenderedRoleDefinition: Readonly<MapWaypointRenderRoleDef<W>> | null = null;

  /** This entry's waypoint icon. */
  public readonly icon: MapWaypointIcon<W> | null = null;

  /** This entry's waypoint label. */
  public readonly label: MapCullableTextLabel | null = null;

  /**
   * Constructor.
   * @param waypoint The waypoint associated with this entry.
   * @param textManager The text manager to which to register this entry's labels.
   * @param roleDefinitions A map of all valid render roles to their definitions.
   * @param selectRoleToRender A function to use to select roles under which to render this entry.
   */
  constructor(
    public readonly waypoint: W,
    private readonly textManager: MapCullableTextLabelManager,
    private readonly roleDefinitions: ReadonlyMap<number, Readonly<MapWaypointRenderRoleDef<W>>>,
    private readonly selectRoleToRender: MapWaypointRenderRoleSelector<W>
  ) {
  }

  /**
   * Checks whether this entry is assigned any of the specified render roles. Optionally, this method can also check
   * if this entry was last rendered in any of the specified roles instead.
   * @param roles The render roles against which to check.
   * @param useLastRendered Whether to check the role(s) in which this entry was last rendered instead of the current
   * roles assigned to this entry. False by default.
   * @returns whether the check passed.
   */
  public isAnyRole(roles: number, useLastRendered = false): boolean {
    let toCompare;
    if (useLastRendered) {
      toCompare = this.lastRenderedRole;
    } else {
      toCompare = this.roles;
    }
    return BitFlags.isAny(toCompare, roles);
  }

  /**
   * Checks whether this entry is assigned only the specified render role(s). Optionally, this method can also check
   * if this entry was last rendered in only the specified role(s) instead.
   * @param roles The render roles against which to check.
   * @param useLastRendered Whether to check the role(s) in which this entry was last rendered instead of the current
   * roles assigned to this entry. False by default.
   * @returns whether the check passed.
   */
  public isOnlyRole(roles: number, useLastRendered = false): boolean {
    let toCompare;
    if (useLastRendered) {
      toCompare = this.lastRenderedRole;
    } else {
      toCompare = this.roles;
    }
    return toCompare === roles;
  }

  /**
   * Checks whether this entry is assigned all the specified render role(s). Optionally, this method can also check
   * if this entry was last rendered in all the specified role(s) instead.
   * @param roles - the render role(s) against which to check.
   * @param useLastRendered Whether to check the role(s) in which this entry was last rendered instead of the current
   * roles assigned to this entry. False by default.
   * @returns whether the check passed.
   */
  public isAllRoles(roles: number, useLastRendered = false): boolean {
    let toCompare;
    if (useLastRendered) {
      toCompare = this.lastRenderedRole;
    } else {
      toCompare = this.roles;
    }
    return BitFlags.isAll(toCompare, roles);
  }

  /**
   * Assigns one or more render roles to this entry.
   * @param roles The render role(s) to assign.
   * @param sourceId The unique string ID of the source of the assignment.
   */
  public addRole(roles: number, sourceId: string): void {
    BitFlags.forEach(roles, (value, index) => {
      (this.registrations[1 << index] ??= new Set<string>()).add(sourceId);
    }, true);

    (this.roles as number) = this.roles | roles;
  }

  /**
   * Removes one or more render roles from this entry.
   * @param roles The render role(s) to remove.
   * @param sourceId The unique string ID of the soruce of the de-assignment.
   */
  public removeRole(roles: number, sourceId: string): void {
    BitFlags.forEach(roles, (value, index) => {
      const role = 1 << index;
      const registrations = this.registrations[role];
      if (registrations) {
        registrations.delete(sourceId);
        if (registrations.size === 0) {
          (this.roles as number) = this.roles & ~role;
        }
      }
    }, true);
  }

  /**
   * Prepares this entry for rendering.
   * @param showRole The role in which this entry should be rendered.
   */
  private prepareRender(showRole: number): void {
    if (showRole === this.lastRenderedRole) {
      return;
    }

    const roleDef = this.roleDefinitions.get(showRole) ?? null;

    let iconFactory: MapWaypointRendererIconFactory<W> | null = null;
    let labelFactory: MapWaypointRendererLabelFactory<W> | null = null;

    if (roleDef) {
      iconFactory = roleDef.iconFactory ?? null;
      labelFactory = roleDef.labelFactory ?? null;
    }

    const newIcon = iconFactory?.getIcon(showRole, this.waypoint) ?? null;
    if (this.icon && this.icon !== newIcon) {
      const oldIconFactory = this.lastRenderedRoleDefinition?.iconFactory;
      oldIconFactory?.cleanupIcon?.(this.lastRenderedRole, this.waypoint, this.icon);
    }
    (this.icon as MapWaypointIcon<W> | null) = newIcon;

    const newLabel = labelFactory?.getLabel(showRole, this.waypoint) ?? null;
    if (this.label && this.label !== newLabel) {
      this.textManager.deregister(this.label);

      const oldLabelFactory = this.lastRenderedRoleDefinition?.labelFactory;
      oldLabelFactory?.cleanupLabel?.(this.lastRenderedRole, this.waypoint, this.label);
    }
    if (newLabel && newLabel !== this.label) {
      this.textManager.register(newLabel);
    }
    (this.label as MapCullableTextLabel | null) = newLabel;

    (this.lastRenderedRole as number) = showRole;
    (this.lastRenderedRoleDefinition as Readonly<MapWaypointRenderRoleDef<W>> | null) = roleDef;
  }

  /**
   * Updates this entry. An appropriate render role is selected, then the icon and label are updated as appropriate
   * for the chosen role. If the waypoint's label should be visible, it is added to the appropriate text manager.
   * Of note, this method will not draw the waypoint icon to a canvas element; it will simply ensure the .showIcon
   * property contains the correct value depending on whether the icon should be visible.
   */
  public update(): void {
    const showRole = this.selectRoleToRender(this, this.roleDefinitions);
    this.prepareRender(showRole);
  }

  /**
   * Destroys this entry. Any label from this entry currently registered with the text manager will be deregistered.
   */
  public destroy(): void {
    if (this.icon) {
      const oldIconFactory = this.lastRenderedRoleDefinition?.iconFactory;
      oldIconFactory?.cleanupIcon?.(this.lastRenderedRole, this.waypoint, this.icon);
    }

    if (this.label) {
      this.textManager.deregister(this.label);

      const oldLabelFactory = this.lastRenderedRoleDefinition?.labelFactory;
      oldLabelFactory?.cleanupLabel?.(this.lastRenderedRole, this.waypoint, this.label);
    }
  }
}
