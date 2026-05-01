import { Config, ConfigUtils } from '@microsoft/msfs-wtg3000-common';

import { PfdLayoutConfig } from '../Config/PfdLayoutConfig';

/**
 * A configuration object which defines options for the PFD softkey menu.
 */
export class PfdSoftKeyConfig implements Config {
  /** Whether to include CAS controls. */
  public readonly includeCasControls: boolean;

  /**
   * Creates a new PfdSoftKeyConfig from a configuration document element.
   * @param element A configuration document element.
   * @param pfdLayoutConfig The PFD layout configuration object.
   */
  public constructor(element: Element | undefined, pfdLayoutConfig: PfdLayoutConfig) {
    let inheritData: PfdSoftKeyConfigData | undefined;

    if (element !== undefined) {
      if (element.tagName !== 'PfdSoftKey') {
        throw new Error(`Invalid PfdSoftKeyConfig definition: expected tag name 'PfdSoftKey' but was '${element.tagName}'`);
      }

      if (!pfdLayoutConfig.includeSoftKeys) {
        console.warn('PfdSoftKeyConfig: PFD softkey configuration found (tag name "PfdSoftKey") when softkeys are disabled');
      }

      const inheritFromId = element.getAttribute('inherit');
      const inheritFromElement = inheritFromId === null
        ? null
        : element.ownerDocument.querySelector(`PfdSoftKey[id='${inheritFromId}']`);

      inheritData = inheritFromElement ? new PfdSoftKeyConfigData(inheritFromElement) : undefined;
    }

    const data = new PfdSoftKeyConfigData(element);

    this.includeCasControls = data.includeCasControls ?? inheritData?.includeCasControls ?? false;
  }
}

/**
 * An object containing PFD softkey configuration data parsed from an XML document element.
 */
class PfdSoftKeyConfigData {
  /** Whether to include CAS controls. */
  public readonly includeCasControls?: boolean;

  /**
   * Creates a new PfdSoftKeyConfigData from a configuration document element.
   * @param element A configuration document element.
   */
  public constructor(element: Element | undefined) {
    if (element === undefined) {
      return;
    }

    const includeCasControls = ConfigUtils.parseBoolean(element.getAttribute('include-cas-controls'), false);
    if (includeCasControls === undefined) {
      console.warn('Invalid PfdSoftKeyConfig definition: unrecognized "cas-controls" option (must be "true" or "false")');
    } else {
      this.includeCasControls = includeCasControls;
    }
  }
}
