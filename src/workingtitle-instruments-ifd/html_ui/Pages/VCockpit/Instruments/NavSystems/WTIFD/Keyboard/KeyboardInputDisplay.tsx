import { Accessible, ComponentProps, ComSpacing, DisplayComponent, EventBus, FacilityLoader, FSComponent, Subject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { EditableFieldRef } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/AbstractField';
import { AltimeterField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/AltimeterField';
import { AltitudeField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/AltitudeField';
import { AngleField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/AngleField';
import { DateField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/DateField';
import { DescentRateField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/DescentRateField';
import { DistanceField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/DistanceField';
import { DurationField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/DurationField';
import { FrequencyField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/FrequencyField';
import { HoursDecimalField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/HoursDecimal';
import { HoursMinutesSecondsField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/HoursMinutesSecondsField';
import { IdentField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/IdentField';
import { LatLonField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/LatLonField';
import { LocalTimeOffsetField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/LocalTimeOffsetField';
import { TemperatureField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/TemperatureField';
import { TimeOfDayField } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/TimeOfDayField';
import { TextInputField } from '../Pages/FmsPage/FplTab/Components/TextInputField';
import { KeyboardInputType } from './KeyboardTypes';

/**
 * Props for the input field wrapper component
 */
interface KeyboardInputDisplayProps extends ComponentProps {
  /** The type of input field to render */
  inputType: KeyboardInputType;
  /** Event bus */
  bus: EventBus;
  /** FMS instance */
  fms: Fms;
  /** Facility loader */
  facilityLoader: FacilityLoader;
  /** Initial value */
  initialValue?: string;
  /** Caret position subject */
  caretPosition: Subject<number>;
  /** Callback when field is ready */
  onFieldReady: (field: EditableFieldRef) => void;
  /** Is the keyboard numpad shown */
  showNumpad: Subject<boolean>;
  /** Callback for when enter is pressed */
  onEnterPressed?: (value: string) => void;
  /** Callback when invalid input is entered */
  onInvalidEntry: (message: string) => void;
  /** Whether should we skip the facility search */
  disableFacilitySearch?: Accessible<boolean>
}

/**
 * Wrapper component that manages keyboard input field
 */
export class KeyboardInputDisplay extends DisplayComponent<KeyboardInputDisplayProps> {
  private readonly fieldRef = FSComponent.createRef<EditableFieldRef>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    const field = this.fieldRef.instance;

    if (field && this.props.initialValue) {
      const seed = this.props.initialValue;

      switch (this.props.inputType) {
        case KeyboardInputType.Altitude:
        case KeyboardInputType.ClimbAltitudeOrFlightLevel:
        case KeyboardInputType.DescentAltitudeOrFlightLevel:
        case KeyboardInputType.FlightLevel:
          field.onRequest({
            initialValue: Number(seed),
            unitsMode: 'feet',
            minimumValue: 0,
            maximumValue: 60000,
            initialUnit: UnitType.FOOT,
            inputType: this.props.inputType,
          });
          break;
        case KeyboardInputType.Angle:
        case KeyboardInputType.DescentAngle:
          field.onRequest({
            initialValue: Number(seed),
            unitsMode: 'degree',
            minimumValue: this.props.inputType === KeyboardInputType.DescentAngle ? 1.0 : 0,
            maximumValue: this.props.inputType === KeyboardInputType.DescentAngle ? 6.0 : 360,
            initialUnit: UnitType.DEGREE,
            hasDecimal: this.props.inputType === KeyboardInputType.DescentAngle,
            hasWrap: this.props.inputType !== KeyboardInputType.DescentAngle,
          });
          break;
        case KeyboardInputType.DescentRate:
          field.onRequest({
            initialValue: Number(seed),
            unitsMode: 'fpm',
            minimumValue: 50,
            maximumValue: 2000,
            initialUnit: UnitType.FPM,
            hasWrap: false,
          });
          break;
        case KeyboardInputType.Duration:
          field.onRequest({
            initialValue: Number(seed),
            minimumValue: 0,
            maximumValue: 20,
            initialUnit: UnitType.MINUTE
          });
          break;
        case KeyboardInputType.NM:
          field.onRequest({
            initialValue: Number(seed),
            minimumValue: 0,
            maximumValue: 20,
            initialUnit: UnitType.NMILE
          });
          break;
        case KeyboardInputType.Com_Frequency_Spacing25Khz:
          field.onRequest({
            initialValue: Number(seed),
            spacing: ComSpacing.Spacing25Khz,
            radioType: KeyboardInputType.Com_Frequency_Spacing25Khz
          });
          break;
        case KeyboardInputType.Com_Frequency_Spacing833Khz:
          field.onRequest({
            initialValue: Number(seed),
            spacing: ComSpacing.Spacing833Khz,
            radioType: KeyboardInputType.Com_Frequency_Spacing833Khz
          });
          break;
        case KeyboardInputType.Nav:
          field.onRequest({
            initialValue: Number(seed),
            radioType: KeyboardInputType.Nav
          });
          break;
        case KeyboardInputType.FreeText:
          field.onRequest(seed);
          this.props.caretPosition.set(0);
          break;
        case KeyboardInputType.Ident:
          field.onRequest({
            unitsMode: 'number',
            minimumValue: 0,
            maximumValue: 7777,
            initialValue: Number(seed),
            onEnterCallback: this.props.onEnterPressed?.bind(this)
          });
          break;
        case KeyboardInputType.LatLon:
          field.onRequest(seed);
          break;
        case KeyboardInputType.LocalTimeOffset:
        case KeyboardInputType.HoursMinutesSeconds:
        case KeyboardInputType.TimeOfDay:
        case KeyboardInputType.Date:
        case KeyboardInputType.HoursDecimal:
          field.onRequest(seed);
          break;
      }

      field.activateEditing();
    }

    this.props.onFieldReady(field);
  }

  /** @inheritdoc */
  public render(): VNode {
    switch (this.props.inputType) {
      case KeyboardInputType.Altitude:
      case KeyboardInputType.ClimbAltitudeOrFlightLevel:
      case KeyboardInputType.DescentAltitudeOrFlightLevel:
      case KeyboardInputType.FlightLevel:
        return (
          <AltitudeField
            bus={this.props.bus}
            ref={this.fieldRef}
            fms={this.props.fms}
          />
        );
      case KeyboardInputType.Angle:
      case KeyboardInputType.DescentAngle:
        return (
          <AngleField
            ref={this.fieldRef}
            onInvalidEntry={this.props.onInvalidEntry}
          />
        );
      case KeyboardInputType.DescentRate:
        return (
          <DescentRateField ref={this.fieldRef} onInvalidEntry={this.props.onInvalidEntry} />
        );
      case KeyboardInputType.NM:
        return (
          <DistanceField
            bus={this.props.bus}
            ref={this.fieldRef}
            fms={this.props.fms}
          />
        );
      case KeyboardInputType.Duration:
        return (
          <DurationField
            bus={this.props.bus}
            ref={this.fieldRef}
            fms={this.props.fms}
          />
        );
      case KeyboardInputType.Com_Frequency_Spacing833Khz:
      case KeyboardInputType.Com_Frequency_Spacing25Khz:
      case KeyboardInputType.Nav:
        return (
          <FrequencyField ref={this.fieldRef} showNumpad={this.props.showNumpad} bus={this.props.bus} fms={this.props.fms} facilityLoader={this.props.facilityLoader} />
        );
      case KeyboardInputType.Ident:
        return (
          <IdentField ref={this.fieldRef} bus={this.props.bus} />
        );
      case KeyboardInputType.Temperature:
        return (
          <TemperatureField
            bus={this.props.bus}
            ref={this.fieldRef}
          />
        );
      case KeyboardInputType.Pressure:
        return (
          <AltimeterField
            bus={this.props.bus}
            ref={this.fieldRef}
          />
        );
      case KeyboardInputType.LocalTimeOffset:
        return (
          <LocalTimeOffsetField
            bus={this.props.bus}
            ref={this.fieldRef}
            class={{
              'vkb-input': true
            }}
          />
        );
      case KeyboardInputType.LatLon:
        return (
          <LatLonField
            bus={this.props.bus}
            ref={this.fieldRef}
          />
        );
      case KeyboardInputType.HoursMinutesSeconds:
        return <HoursMinutesSecondsField ref={this.fieldRef} onInvalidEntry={this.props.onInvalidEntry} />;
      case KeyboardInputType.TimeOfDay:
        return <TimeOfDayField ref={this.fieldRef} bus={this.props.bus} onInvalidEntry={this.props.onInvalidEntry} showNumpad={this.props.showNumpad} />;
      case KeyboardInputType.Date:
        return <DateField ref={this.fieldRef} onInvalidEntry={this.props.onInvalidEntry} showNumpad={this.props.showNumpad} />;
      case KeyboardInputType.HoursDecimal:
        return <HoursDecimalField ref={this.fieldRef} onInvalidEntry={this.props.onInvalidEntry} />;
      default:
        return (
          <TextInputField
            bus={this.props.bus}
            ref={this.fieldRef}
            facLoader={this.props.facilityLoader}
            fms={this.props.fms}
            isKeyboardField={true}
            onNoMatchFound={this.props.onInvalidEntry}
            disableFacilitySearch={this.props.disableFacilitySearch}
            class={{
              'vkb-input': true
            }}
          />
        );
    }
  }
}
