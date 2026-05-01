import { CasUuid } from './CasUuid';

/** Events to control the IFD CAS. These should be published with sync **off** outside of the IfdCasAlertManager! */
export interface IfdCasControlEvents {
  /** Activates an alert with the given UUID. */
  'ifd_cas_activate_alert': CasUuid;
  /** Deactivates an alert with the given UUID. */
  'ifd_cas_deactivate_alert': CasUuid;
  /** Acknowledges an alert with the given UUID. */
  'ifd_cas_acknowledge_alert': CasUuid;
}
