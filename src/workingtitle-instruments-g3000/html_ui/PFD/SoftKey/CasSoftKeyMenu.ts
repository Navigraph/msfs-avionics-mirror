import { ConsumerSubject, SubscribableMapFunctions, Subscription } from '@microsoft/msfs-sdk';

import { SoftKeyMenu, SoftKeyMenuSystem } from '@microsoft/msfs-garminsdk';

import { CASControlEvents, PfdIndex } from '@microsoft/msfs-wtg3000-common';

/**
 * The CAS softkey menu.
 */
export class CasSoftKeyMenu extends SoftKeyMenu {
  private readonly isCasScrollUpEnabled = ConsumerSubject.create(null, false);
  private readonly isCasScrollDownEnabled = ConsumerSubject.create(null, false);

  private readonly subs: Subscription[] = [
    this.isCasScrollDownEnabled,
    this.isCasScrollDownEnabled,
  ];

  /**
   * Creates a new instance of CasSoftKeyMenu.
   * @param menuSystem The softkey menu system.
   * @param pfdIndex The index of the PFD instrument to which this menu belongs.
   * @param isSplit Whether the menu is a split-mode menu.
   */
  public constructor(
    menuSystem: SoftKeyMenuSystem,
    private readonly pfdIndex: PfdIndex,
    isSplit: boolean
  ) {
    super(menuSystem);

    const casSub = menuSystem.bus.getSubscriber<CASControlEvents>();
    const casPub = menuSystem.bus.getPublisher<CASControlEvents>();

    this.isCasScrollUpEnabled.setConsumer(casSub.on(`cas_scroll_up_enable_${this.pfdIndex}`));
    this.isCasScrollDownEnabled.setConsumer(casSub.on(`cas_scroll_down_enable_${this.pfdIndex}`));

    const scrollUpTopic = `cas_scroll_up_${this.pfdIndex}` as const;
    const scrollDownTopic = `cas_scroll_down_${this.pfdIndex}` as const;

    const scrollUpItem = this.addItem(0, 'CAS ↑', () => { casPub.pub(scrollUpTopic, true, true, false); }, undefined, true);
    const scrollDownItem = this.addItem(1, 'CAS ↓', () => { casPub.pub(scrollDownTopic, true, true, false); }, undefined, true);

    this.isCasScrollUpEnabled.pipe(scrollUpItem.disabled, SubscribableMapFunctions.not());
    this.isCasScrollDownEnabled.pipe(scrollDownItem.disabled, SubscribableMapFunctions.not());

    this.addItem(isSplit ? 5 : 10, 'Back', () => { menuSystem.back(); });
  }

  /** @inheritdoc */
  public destroy(): void {
    for (const sub of this.subs) {
      sub.destroy();
    }

    super.destroy();
  }
}
