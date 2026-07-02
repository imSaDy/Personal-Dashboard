(() => {
    const backdropSelector = '[id$="backdrop"].fixed';
    const returnFocus = new WeakMap();
    const modalState = new WeakMap();
    const inertedElements = new Map();

    function isVisible(backdrop) {
        return !backdrop.classList.contains('hidden');
    }

    function modalCard(backdrop) {
        return backdrop.firstElementChild;
    }

    function openBackdrops() {
        return [...document.querySelectorAll(backdropSelector)]
            .filter(isVisible)
            .sort((first, second) => (
                Number.parseInt(getComputedStyle(first).zIndex, 10) || 0
            ) - (
                Number.parseInt(getComputedStyle(second).zIndex, 10) || 0
            ));
    }

    function restorePageInteractivity() {
        inertedElements.forEach((wasInert, element) => {
            element.inert = wasInert;
        });
        inertedElements.clear();
    }

    function isolateBackdrop(backdrop) {
        let activeBranch = backdrop;
        while (activeBranch?.parentElement) {
            const parent = activeBranch.parentElement;
            [...parent.children].forEach(sibling => {
                if (sibling === activeBranch) return;
                inertedElements.set(sibling, sibling.inert);
                sibling.inert = true;
            });
            if (parent === document.body) break;
            activeBranch = parent;
        }
    }

    function syncPageState() {
        const backdrops = openBackdrops();
        document.body.classList.toggle('lumen-modal-open', backdrops.length > 0);
        restorePageInteractivity();
        const topmostBackdrop = backdrops.at(-1);
        if (topmostBackdrop) isolateBackdrop(topmostBackdrop);
    }

    function focusableElements(card) {
        return [...card.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), '
            + 'select:not([disabled]), textarea:not([disabled]), '
            + '[tabindex]:not([tabindex="-1"])'
        )].filter(element => (
            element.getClientRects().length > 0
            && getComputedStyle(element).visibility !== 'hidden'
        ));
    }

    function initializeBackdrop(backdrop) {
        const card = modalCard(backdrop);
        if (!card) return;

        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');

        const heading = card.querySelector('h1, h2, h3');
        if (heading) {
            if (!heading.id) heading.id = `${backdrop.id}-title`;
            card.setAttribute('aria-labelledby', heading.id);
        }

        const initialVisible = isVisible(backdrop);
        modalState.set(backdrop, initialVisible);
        backdrop.setAttribute('aria-hidden', String(!initialVisible));

        const observer = new MutationObserver(() => {
            const visible = isVisible(backdrop);
            const wasVisible = modalState.get(backdrop);
            if (visible === wasVisible) return;
            modalState.set(backdrop, visible);
            backdrop.setAttribute('aria-hidden', String(!visible));

            if (visible) {
                const active = document.activeElement;
                if (active && active !== document.body && !card.contains(active)) {
                    returnFocus.set(backdrop, active);
                }
                setTimeout(() => {
                    if (!isVisible(backdrop) || card.contains(document.activeElement)) return;
                    (focusableElements(card)[0] || card).focus({ preventScroll: true });
                }, 0);
            } else {
                setTimeout(() => {
                    if (openBackdrops().length > 0) return;
                    const trigger = returnFocus.get(backdrop);
                    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
                    returnFocus.delete(backdrop);
                }, 0);
            }
            syncPageState();
        });
        observer.observe(backdrop, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    document.querySelectorAll(backdropSelector).forEach(initializeBackdrop);
    syncPageState();

    document.addEventListener('keydown', event => {
        const backdrop = openBackdrops().at(-1);
        if (!backdrop) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            const closeButton = backdrop.querySelector(
                'button[aria-label^="Close"], button[onclick*="close"]'
            );
            closeButton?.click();
            return;
        }

        if (event.key !== 'Tab') return;
        const card = modalCard(backdrop);
        const focusable = focusableElements(card);
        if (!focusable.length) {
            event.preventDefault();
            card.focus({ preventScroll: true });
            return;
        }

        const first = focusable[0];
        const last = focusable.at(-1);
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !card.contains(active))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (active === last || !card.contains(active))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
        }
    }, true);
})();
