/* ==========================================================================
   LUMEN - CANONICAL ACTIVITY AUTOCOMPLETE
   ========================================================================== */

window.LUMEN_ACTIVITY_PALETTE = [
    { solid: '#4318FF', soft: '#7B61FF' },
    { solid: '#05B98C', soft: '#3DD6AE' },
    { solid: '#FF5C7A', soft: '#FF8FA6' },
    { solid: '#F59E0B', soft: '#FBCB62' },
    { solid: '#2F80ED', soft: '#69A7F5' },
    { solid: '#B44BC0', soft: '#DA86E0' },
    { solid: '#00A6A6', soft: '#52C7C7' },
    { solid: '#F97316', soft: '#FDB074' },
    { solid: '#6366F1', soft: '#9B9CF8' },
    { solid: '#E64980', soft: '#F08BB0' },
    { solid: '#4C6FFF', soft: '#86A0FF' },
    { solid: '#65A30D', soft: '#A4CF6B' }
];

const activityAutocompleteControllers = [];
let cachedActivitySuggestions = [];
let activitySuggestionRequest = null;

function activityColorIndex(name) {
    let hash = 0;
    for (const character of String(name || '')) {
        hash = ((hash << 5) - hash) + character.charCodeAt(0);
        hash |= 0;
    }
    return Math.abs(hash) % window.LUMEN_ACTIVITY_PALETTE.length;
}

window.getLumenActivityColor = function getLumenActivityColor(name) {
    return window.LUMEN_ACTIVITY_PALETTE[activityColorIndex(name)];
};

class ActivityAutocomplete {
    constructor(root) {
        this.root = root;
        this.input = root.querySelector('input[role="combobox"]');
        this.list = root.querySelector('[role="listbox"]');
        this.filtered = [];
        this.activeIndex = -1;

        this.input.addEventListener('focus', () => this.render());
        this.input.addEventListener('input', () => this.render());
        this.input.addEventListener('keydown', event => this.handleKeydown(event));
        this.input.addEventListener('blur', () => setTimeout(() => this.close(), 120));
    }

    matchingSuggestions() {
        const query = this.input.value.trim().toLocaleLowerCase();
        if (!query) return cachedActivitySuggestions.slice(0, 8);

        return cachedActivitySuggestions
            .map(activity => {
                const name = activity.name.toLocaleLowerCase();
                const score = name === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : 3;
                return { ...activity, score };
            })
            .filter(activity => activity.score < 3)
            .sort((a, b) => a.score - b.score || b.usage_count - a.usage_count)
            .slice(0, 8);
    }

    render() {
        this.filtered = this.matchingSuggestions();
        this.activeIndex = this.filtered.length ? 0 : -1;
        this.list.replaceChildren();

        if (!this.filtered.length) {
            this.close();
            return;
        }

        this.filtered.forEach((activity, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.id = `${this.input.id}-activity-option-${index}`;
            option.className = `activity-suggestion${index === this.activeIndex ? ' is-active' : ''}`;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(index === this.activeIndex));

            const icon = document.createElement('span');
            icon.className = 'activity-suggestion-icon';
            icon.style.background = window.getLumenActivityColor(activity.name).solid;
            icon.textContent = activity.name.charAt(0).toUpperCase();

            const copy = document.createElement('span');
            copy.className = 'min-w-0 flex-1';

            const name = document.createElement('span');
            name.className = 'activity-suggestion-name block text-xs font-bold text-textMain truncate transition-colors';
            name.textContent = activity.name;

            const metadata = document.createElement('span');
            metadata.className = 'block text-[9px] font-semibold text-textMuted mt-0.5';
            metadata.textContent = `${activity.usage_count} log${activity.usage_count === 1 ? '' : 's'} · ${activity.total_hours} hrs`;

            copy.append(name, metadata);
            option.append(icon, copy);
            option.addEventListener('mousedown', event => {
                event.preventDefault();
                this.select(index);
            });
            this.list.appendChild(option);
        });

        this.list.classList.remove('hidden');
        this.input.setAttribute('aria-expanded', 'true');
        this.syncActiveOption();
    }

    syncActiveOption() {
        const options = [...this.list.querySelectorAll('[role="option"]')];
        options.forEach((option, index) => {
            const isActive = index === this.activeIndex;
            option.classList.toggle('is-active', isActive);
            option.setAttribute('aria-selected', String(isActive));
            if (isActive) option.scrollIntoView({ block: 'nearest' });
        });
        const activeOption = options[this.activeIndex];
        if (activeOption) {
            this.input.setAttribute('aria-activedescendant', activeOption.id);
        } else {
            this.input.removeAttribute('aria-activedescendant');
        }
    }

    select(index) {
        const activity = this.filtered[index];
        if (!activity) return;
        this.input.value = activity.name;
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
        this.close();
        this.input.focus();
    }

    handleKeydown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.close();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (this.list.classList.contains('hidden')) this.render();
            if (!this.filtered.length) return;
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            this.activeIndex = (this.activeIndex + direction + this.filtered.length) % this.filtered.length;
            this.syncActiveOption();
            return;
        }

        if (event.key === 'Enter' && !this.list.classList.contains('hidden') && this.activeIndex >= 0) {
            event.preventDefault();
            this.select(this.activeIndex);
        }
    }

    close() {
        this.list.classList.add('hidden');
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
    }
}

async function refreshActivitySuggestions() {
    if (activitySuggestionRequest) activitySuggestionRequest.abort();
    const controller = new AbortController();
    activitySuggestionRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const response = await fetch('/api/activities?limit=50', { signal: controller.signal });
        if (!response.ok) throw new Error(`Activity suggestions failed: ${response.status}`);
        cachedActivitySuggestions = await response.json();
        activityAutocompleteControllers.forEach(combobox => {
            if (document.activeElement === combobox.input) combobox.render();
        });
    } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
    } finally {
        clearTimeout(timeout);
        if (activitySuggestionRequest === controller) {
            activitySuggestionRequest = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-activity-combobox]').forEach(root => {
        activityAutocompleteControllers.push(new ActivityAutocomplete(root));
    });
    refreshActivitySuggestions();
});
