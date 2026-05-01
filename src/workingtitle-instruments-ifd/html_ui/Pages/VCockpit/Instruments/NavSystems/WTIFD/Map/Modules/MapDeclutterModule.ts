import { Subject } from '@microsoft/msfs-sdk';

export enum MapDeclutterMode {
  None,
  Level1,
  Level2,
  Level3,
  All// Show all nav aids
}

/**
 * A module describing the declutter mode.
 */
export class MapDeclutterModule {
  public readonly mode = Subject.create(MapDeclutterMode.All);
}
