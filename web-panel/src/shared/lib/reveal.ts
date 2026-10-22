const SCROLL_ROOT_SELECTOR = '[data-scroll-root]';
const TOP_CLEARANCE_PX = 72;
const BOTTOM_CLEARANCE_PX = 112;

/**
 * Scrolls only the panel's content scroller to show `element`. `scrollIntoView` would also
 * scroll the shell's overflow-hidden ancestors and shift the whole layout under the header.
 */
export function revealInScroller(element: HTMLElement | null): void {
    const scroller = element?.closest<HTMLElement>(SCROLL_ROOT_SELECTOR);
    if (!element || !scroller) return;

    const target = element.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const reduce = document.documentElement.dataset.motion === 'reduced';
    let delta = 0;
    if (target.top < view.top + TOP_CLEARANCE_PX) {
        delta = target.top - view.top - TOP_CLEARANCE_PX;
    } else if (target.bottom > view.bottom - BOTTOM_CLEARANCE_PX) {
        delta = Math.min(
            target.bottom - view.bottom + BOTTOM_CLEARANCE_PX,
            target.top - view.top - TOP_CLEARANCE_PX,
        );
    }
    if (delta !== 0) {
        scroller.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
    }
}
