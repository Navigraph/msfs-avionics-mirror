import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { G3000FilePaths } from '@microsoft/msfs-wtg3000-common';

import { GtcImgTouchButton } from '../../Components/TouchButton/GtcImgTouchButton';
import { GtcUserWaypointDialog } from '../../Dialog/GtcUserWaypointDialog';
import { GtcView } from '../../GtcService/GtcView';
import { GtcViewKeys } from '../../GtcService/GtcViewKeys';
import { GtcAirportInfoPage2 } from './GtcAirportInfoPage2';
import { GtcIntersectionInfoPage2 } from './GtcIntersectionInfoPage2';
import { GtcNdbInfoPage2 } from './GtcNdbInfoPage2';
import { GtcUserWaypointInfoPage2 } from './GtcUserWaypointInfoPage2';
import { GtcVorInfoPage2 } from './GtcVorInfoPage2';

import '../../Components/TouchButton/GtcDirectoryButton.css';
import './GtcWaypointInfoDirectoryPage.css';

/**
 * A GTC waypoint info directory page.
 */
export class GtcWaypointInfoDirectoryPage extends GtcView {
  private thisNode?: VNode;

  /** @inheritdoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;

    this._title.set('Waypoint Info');
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class='wpt-info-directory-page'>
        <div class='wpt-info-directory-page-row'>
          <GtcImgTouchButton
            label='Airport'
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_airport.png`}
            onPressed={(): void => { this.props.gtcService.changePageTo<GtcAirportInfoPage2>(GtcViewKeys.AirportInfo).ref.initSelection(); }}
            class='gtc-directory-button'
          />
          <GtcImgTouchButton
            label='INT'
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_intersection.png`}
            onPressed={(): void => { this.props.gtcService.changePageTo<GtcIntersectionInfoPage2>(GtcViewKeys.IntersectionInfo).ref.initSelection(); }}
            class='gtc-directory-button'
          />
          <GtcImgTouchButton
            label='VOR'
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_vor.png`}
            onPressed={(): void => { this.props.gtcService.changePageTo<GtcVorInfoPage2>(GtcViewKeys.VorInfo).ref.initSelection(); }}
            class='gtc-directory-button'
          />
        </div>
        <div class='wpt-info-directory-page-row'>
          <GtcImgTouchButton
            label='NDB'
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_ndb.png`}
            onPressed={(): void => { this.props.gtcService.changePageTo<GtcNdbInfoPage2>(GtcViewKeys.NdbInfo).ref.initSelection(); }}
            class='gtc-directory-button'
          />
          <GtcImgTouchButton
            label='User<br>Waypoint'
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_user.png`}
            onPressed={(): void => { this.props.gtcService.changePageTo<GtcUserWaypointInfoPage2>(GtcViewKeys.UserWaypointInfo).ref.initSelection(); }}
            class='gtc-directory-button'
          />
        </div>
        <div class='wpt-info-directory-page-row'>
          <GtcImgTouchButton
            label='Create<br>Waypoint'
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_new_user.png`}
            onPressed={(): void => { this.props.gtcService.changePageTo<GtcUserWaypointDialog>(GtcViewKeys.UserWaypointDialog).ref.request({}); }}
            class='gtc-directory-button'
          />
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.thisNode && FSComponent.shallowDestroy(this.thisNode);

    super.destroy();
  }
}
