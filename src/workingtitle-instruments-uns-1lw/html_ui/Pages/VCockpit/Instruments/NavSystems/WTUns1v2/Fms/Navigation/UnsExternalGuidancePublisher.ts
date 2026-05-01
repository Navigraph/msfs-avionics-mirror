import { Accessible, APGpsSteerDirectorSteerCommand, RegisteredSimVar, RegisteredSimVarUtils, SimVarValueType } from '@microsoft/msfs-sdk';

/**
 * SimVar names for UNS external GPS steering command data.
 */
export enum APExternalGpsSteerCommandSimVars {
  IsValid = 'L:1:WT_UNS_External_GPS_Steer_Command_Is_Valid',
  IsHeading = 'L:1:WT_UNS_External_GPS_Steer_Command_Is_Heading',
  CourseToSteer = 'L:1:WT_UNS_External_GPS_Steer_Command_Course_To_Steer',
  TrackRadius = 'L:1:WT_UNS_External_GPS_Steer_Command_Track_Radius',
  Dtk = 'L:1:WT_UNS_External_GPS_Steer_Command_Dtk',
  Xtk = 'L:1:WT_UNS_External_GPS_Steer_Command_Xtk',
  Tae = 'L:1:WT_UNS_External_GPS_Steer_Command_Tae'
}

/** Class responsible for publishing to external guidance simvars */
export class UnsExternalGuidancePublisher {
  private readonly simVar: Record<APExternalGpsSteerCommandSimVars, RegisteredSimVar<number>>;

  /** @inheritdoc */
  public constructor(private readonly index: number) {
    this.simVar = {} as any;
    this.simVar[APExternalGpsSteerCommandSimVars.IsValid] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.IsValid}_${index}`, SimVarValueType.Bool);
    this.simVar[APExternalGpsSteerCommandSimVars.IsHeading] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.IsHeading}_${index}`, SimVarValueType.Bool);
    this.simVar[APExternalGpsSteerCommandSimVars.CourseToSteer] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.CourseToSteer}_${index}`, SimVarValueType.Degree);
    this.simVar[APExternalGpsSteerCommandSimVars.TrackRadius] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.TrackRadius}_${index}`, SimVarValueType.Number);
    this.simVar[APExternalGpsSteerCommandSimVars.Dtk] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.Dtk}_${index}`, SimVarValueType.Degree);
    this.simVar[APExternalGpsSteerCommandSimVars.Xtk] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.Xtk}_${index}`, SimVarValueType.NM);
    this.simVar[APExternalGpsSteerCommandSimVars.Tae] = RegisteredSimVarUtils.create(`${APExternalGpsSteerCommandSimVars.Tae}_${index}`, SimVarValueType.Degree);

    this.initVars();
  }

  /**
   * Initializes all external guidance SimVars.
   */
  private initVars(): void {
    this.simVar[APExternalGpsSteerCommandSimVars.IsValid].set(0);
    this.simVar[APExternalGpsSteerCommandSimVars.IsHeading].set(0);
    this.simVar[APExternalGpsSteerCommandSimVars.CourseToSteer].set(0);
    this.simVar[APExternalGpsSteerCommandSimVars.TrackRadius].set(0);
    this.simVar[APExternalGpsSteerCommandSimVars.Dtk].set(0);
    this.simVar[APExternalGpsSteerCommandSimVars.Xtk].set(0);
    this.simVar[APExternalGpsSteerCommandSimVars.Tae].set(0);
  }

  /**
   * Updates the external guidance SimVars.
   * @param gpsSteerCommand The current LNAV steering command.
   */
  public update(
    gpsSteerCommand: Accessible<Readonly<APGpsSteerDirectorSteerCommand>>,
  ): void {
    this.updateLnavVars(gpsSteerCommand);
  }

  /**
   * Updates the LNAV external guidance SimVars.
   * @param steerCommand The current LNAV steering command.
   */
  private updateLnavVars(steerCommand: Accessible<Readonly<APGpsSteerDirectorSteerCommand>>): void {
    const lnav = steerCommand.get();
    this.simVar[APExternalGpsSteerCommandSimVars.IsValid].set(lnav.isValid ? 1 : 0);
    this.simVar[APExternalGpsSteerCommandSimVars.IsHeading].set(lnav.isHeading ? 1 : 0);
    this.simVar[APExternalGpsSteerCommandSimVars.CourseToSteer].set(lnav.courseToSteer);
    this.simVar[APExternalGpsSteerCommandSimVars.TrackRadius].set(lnav.trackRadius);
    this.simVar[APExternalGpsSteerCommandSimVars.Dtk].set(lnav.dtk);
    this.simVar[APExternalGpsSteerCommandSimVars.Xtk].set(lnav.xtk);
    this.simVar[APExternalGpsSteerCommandSimVars.Tae].set(lnav.tae);
  }
}
