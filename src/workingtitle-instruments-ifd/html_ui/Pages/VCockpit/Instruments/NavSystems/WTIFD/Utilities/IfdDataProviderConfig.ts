import { AdcEvents, ClockEvents } from '@microsoft/msfs-sdk';

import { SelectedEvents } from './IfdDataProvider';

export const IFD_INITIAL_EVENT_VALUES: {
  /** ADC events. */
  adc: SelectedEvents<AdcEvents, 'ambient_wind_velocity' | 'ambient_wind_direction' | 'aoa'>;
  /** Clock events. */
  clock: SelectedEvents<ClockEvents, 'simTime'>;
} = {
  adc: {
    ambient_wind_velocity: {
      initialValue: 0,
    },
    ambient_wind_direction: {
      initialValue: 0,
    },
    aoa: {
      initialValue: 0,
    },
  },
  clock: {
    simTime: {
      initialValue: 0,
    },
  },
};
