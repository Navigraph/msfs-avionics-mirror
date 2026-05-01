import { EventBus, FSComponent, LifecycleComponent, NodeReference, VNode } from '@microsoft/msfs-sdk';

import { SelectionMenu } from '../Components/SelectionMenu';
import { FplSelectionMenuController } from './FplSelectionMenuController';

import './FplSelectionMenu.css';

/** The properties for the {@link FplSelectionMenu} component. */
export interface FplPlanSelectionMenuProps {
  /** The menu controller */
  readonly menuController: FplSelectionMenuController;
  /** A reference for the selection menu that will be provided by this component. */
  readonly selectionMenuRef: NodeReference<SelectionMenu>;
  /** An instance of the event bus. */
  readonly bus: EventBus;
}

/** The FplSelectionMenu component. */
export class FplSelectionMenu extends LifecycleComponent<FplPlanSelectionMenuProps> {
  private readonly backgroundRef = FSComponent.createRef<HTMLDivElement>();

  private readonly isHidden = this.props.menuController.isVisible.map(v => !v).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.backgroundRef.instance.addEventListener('mousedown', () => this.props.menuController.hide());
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'selection-menu-controller': true,
          'hidden': this.isHidden,
        }}
      >
        <div class="selection-menu-background" ref={this.backgroundRef} />
        <div
          class="selection-menu-container"
          style={{
            'top': this.props.menuController.position.map(p => `${p.yCoord.toString()}px`),
            'left': this.props.menuController.position.map(p => `${p.xCoord.toString()}px`),
          }}
        >
          <SelectionMenu
            ref={this.props.selectionMenuRef}
            class={this.props.menuController.menuClass}
            isHidden={this.isHidden}
            groups={this.props.menuController.groups}
            bus={this.props.bus}
            autoSelectFirstItem
          />
        </div>
      </div>
    );
  }
}
