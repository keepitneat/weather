/* ─── Location chip + menu markup builders ────────────────────────
 * PURE module: data in → HTML string out. No DOM, no `document`, no
 * module-level app state — every input that varies is an argument, so
 * these run straight in Node and are unit-tested (location-menu.test.js).
 *
 * The DOM *wiring* — open/close/focus, the delegated #current/document
 * listeners, updateChipIcon's live outerHTML swap, and the switch/save/
 * remove orchestration — stays in app.js. Only the string-builders live
 * here. Every class / data-* / role / aria-label / icon below is load-
 * bearing: app.js's delegated click handlers and styles.css both depend
 * on the exact markup, so keep them identical when editing.
 * ──────────────────────────────────────────────────────────────── */

import { UI_ICONS } from './icons.js';

// Local, DOM-free HTML escaper. app.js has its own escapeHtml that leans
// on document.createElement — that can't run in Node, so this module
// carries a regex-based one instead. Covers the five characters that
// matter inside attribute values and text content.
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

// The .loc-chip button: pin when showing the geolocation home, star when
// showing a saved favorite. Name is escaped; caret is the dropdown affordance.
export function chipMarkup({ isCurrent, name }) {
  return `<button class="loc-chip" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="location-menu">
        ${isCurrent ? UI_ICONS.pin : UI_ICONS.star}
        <span class="loc-chip-name">${escapeHtml(name)}</span>
        <span class="caret" aria-hidden="true">▾</span>
      </button>`;
}

// The open menu's item list: the Current-location (home) item, one row per
// saved favorite (select button + remove button), a separator, the Search
// item, and — only when canSave — a Save item. `activeFavoriteId == null`
// means the home item is the active one.
export function menuMarkup({ favorites, activeFavoriteId, canSave }) {
  const homeActive = activeFavoriteId == null;
  const home = `<button class="loc-item${homeActive ? ' loc-item--active' : ''}" type="button" data-home="true">
      ${UI_ICONS.pin}<span>Current location</span>${homeActive ? '<span class="check" aria-hidden="true">✓</span>' : ''}
    </button>`;
  const favs = favorites.map((f) => {
    const active = f.id === activeFavoriteId;
    return `<div class="loc-item-row" role="none">
        <button class="loc-item${active ? ' loc-item--active' : ''}" type="button" data-favorite-id="${escapeHtml(f.id)}">
          ${UI_ICONS.star}<span>${escapeHtml(f.label)}</span>
        </button>
        <button class="loc-item-remove" type="button" data-remove-id="${escapeHtml(f.id)}" aria-label="Remove ${escapeHtml(f.label)}">×</button>
      </div>`;
  }).join('');
  const save = canSave
    ? `<button class="loc-item" type="button" data-save="true">${UI_ICONS.add} Save this location</button>`
    : '';
  const search = `<button class="loc-item" type="button" data-search="true">${UI_ICONS.search} Search a place…</button>`;
  return `${home}${favs}<div class="loc-menu-sep"></div>${search}${save}`;
}

// The menu's inline search sub-state: text input, Go button, hint, error slot.
export function searchMarkup() {
  return `<div class="loc-menu-search">
      <input id="loc-menu-input" type="text" placeholder="City, ST or ZIP" autocomplete="off" aria-label="Search location">
      <button id="loc-menu-go" type="button">Go</button>
    </div>
    <div class="loc-menu-hint">City, ST (e.g. "Madison, WI") or a ZIP works best · Esc to cancel</div>
    <div class="loc-menu-error" id="loc-menu-error" hidden></div>`;
}
