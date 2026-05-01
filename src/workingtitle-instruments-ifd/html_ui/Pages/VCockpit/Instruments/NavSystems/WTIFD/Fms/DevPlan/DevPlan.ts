/* eslint-disable no-console */
import { SimVarValueType, Wait } from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { DevPlanUtils } from './DevPlanUtils';

/**
 * A testing class for creating dev flight plans.
 */
export class DevPlan {
  private readonly devPlanUtils = new DevPlanUtils(this.fms);

  /**
   * ctor
   * @param fms The FMS instance to use.
   */
  public constructor(public readonly fms: Fms) {
    // No-op
  }

  /**
   * Temp code to setup a dev flight plan for testing.
   * @returns a promise
   */
  public async setupDevPlan(): Promise<void> {
    console.log('[WT-IFD] Setting up dev plan...');

    const latitude = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);

    if (latitude < 0) {
      await this.setupNzchNznv();
    } else {
      await this.setupKdenKcos();
    }

    console.log('[WT-IFD] DevPlan setup complete.');
  }

  /**
   * Setup a Denver to Colorado dev plan.
   */
  protected async setupKdenKcos(): Promise<void> {
    await Wait.awaitDelay(1000);

    const origin = await this.devPlanUtils.setOrigin('KDEN');

    await Wait.awaitDelay(1000);

    const destination = await this.devPlanUtils.setDestination('KCOS');

    // await Wait.awaitDelay(1000);

    // fms.activate(1);

    // await Wait.awaitDelay(1000);

    // fms.execute();

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.setOriginRunway(origin, '34L');

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.loadDeparture(origin, 'BAYLR6', '34L', 'HBU');

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.insertWaypoint('ALADN', 2);

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.insertWaypoint('GENIE', 2);

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.insertWaypoint('JAFAR', 2);

    // await Wait.awaitDelay(1000);

    // await this.devPlanUtils.insertWaypoint('ALADN', 1, 1);

    // await Wait.awaitDelay(1000);

    // await this.devPlanUtils.insertAirway('V159', 'ALADN', 'MAMBO', 1, 1);

    await Wait.awaitDelay(1000);

    this.fms.activateLeg(2, 1);

    // await Wait.awaitDelay(1000);

    // this.fms.activateLeg(0, 2);

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.loadArrival(destination, 'DBRY5', 'ALS');

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.loadApproach(destination, 'ILS 17L', 'ADANE');

    // await Wait.awaitDelay(1000);

    // fms.execute();

    // await Wait.awaitDelay(1000);

    // await this.devPlanUtils.removeOrigin(fms);

    // await Wait.awaitDelay(1000);

    // Direct to AWONE
    // fms.createDirectToExisting(3, 2);

    // await Wait.awaitDelay(1000);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // console.log(fms.getPrimaryFlightPlan().planSegments);
  }

  /**
   * Setup a Christchurch RW20 to Invercargill RW22 dev plan.
   * ATSAT1Q IDARA CHNV3 DUKOP DUKOP6B
   */
  protected async setupNzchNznv(): Promise<void> {
    await Wait.awaitDelay(1000);

    const origin = await this.devPlanUtils.setOrigin('NZCH');

    await Wait.awaitDelay(1000);

    const destination = await this.devPlanUtils.setDestination('NZNV');

    await Wait.awaitDelay(1000);

    this.devPlanUtils.setOriginRunway(origin, '20');

    await Wait.awaitDelay(1000);

    this.devPlanUtils.loadDeparture(origin, 'ATSA1Q', '20', 'IDARA');

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.insertAirway('Y676', 'IDARA', 'DUKOP', 1, 1);

    await Wait.awaitDelay(1000);

    this.devPlanUtils.loadArrival(destination, 'DUKO6B');

    await Wait.awaitDelay(1000);

    await this.devPlanUtils.loadApproach(destination, 'RNAV 22');
  }
}
