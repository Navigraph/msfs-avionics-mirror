import { PfdIndex } from '../CommonTypes';
import { Config } from '../Config/Config';

/**
 * A configuration object which defines options related to GDUs.
 */
export class GduDefsConfig implements Config {
  /**
   * Configuration objects for PFD GDUs. The index of each config's position in the array corresponds to the index of
   * its PFD.
   */
  public readonly pfds: readonly PfdGduConfig[];

  /** The number of configured PFD GDUs. */
  public readonly pfdCount: 1 | 2;

  /**
   * Creates a new GduDefsConfig from a configuration document element.
   * @param element A configuration document element.
   */
  public constructor(element: Element | undefined) {
    if (element === undefined) {
      this.pfds = [undefined as any, new PfdGduConfig(1), new PfdGduConfig(2)];
    } else {
      if (element.tagName !== 'GduDefs') {
        throw new Error(`Invalid GduDefsConfig definition: expected tag name 'GduDefs' but was '${element.tagName}'`);
      }

      this.pfds = this.parsePfdConfigs(element);
    }

    this.pfdCount = this.pfds[2] ? 2 : 1;
  }

  /**
   * Parses PFD GDU configuration objects from a configuration document element.
   * @param element A configuration document element.
   * @returns An array of PFD GDU configuration objects defined by the configuration document element.
   */
  private parsePfdConfigs(element: Element): readonly PfdGduConfig[] {
    const elements = element.querySelectorAll(':scope>Pfd');

    const configs: PfdGduConfig[] = [];

    for (const pfdElement of elements) {
      try {
        const def = new PfdGduConfig(pfdElement);
        configs[def.index] ??= def;
      } catch {
        // noop
      }
    }

    configs[1] ??= new PfdGduConfig(1);

    return configs;
  }
}

/**
 * A configuration object which defines options related to a GDU.
 */
export class PfdGduConfig implements Config {
  /** The index of the PFD. */
  public readonly index: PfdIndex;

  /**
   * Creates a new PfdGduConfig for an indexed PFD using default options.
   * @param index A PFD index.
   */
  public constructor(index: PfdIndex);
  /**
   * Creates a new PfdGduConfig from a configuration document element.
   * @param element A configuration document element.
   */
  public constructor(element: Element);
  // eslint-disable-next-line jsdoc/require-jsdoc
  public constructor(arg1: PfdIndex | Element) {
    if (typeof arg1 === 'number') {
      this.index = arg1;
    } else {
      if (arg1.tagName !== 'Pfd') {
        throw new Error(`Invalid PfdGduConfig definition: expected tag name 'Pfd' but was '${arg1.tagName}'`);
      }

      const index = Number(arg1.getAttribute('index'));
      if (!Number.isInteger(index) || (index !== 1 && index !== 2)) {
        throw new Error('Invalid PfdGduConfig definition: unrecognized "index" option (must be 1 or 2).');
      } else {
        this.index = index;
      }
    }
  }
}
