// Keep the native select as the form's source of truth; render an accessible,
// searchable control above it so long channel lists never open an OS menu.
const controlSync = new WeakMap();
export function enhanceFimaControls(root = document) {
  for (const select of root.querySelectorAll('select[data-fima-select]')) controlSync.get(select)?.();
  for (const select of root.querySelectorAll('select:not([data-fima-select])')) {
    select.dataset.fimaSelect = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'fima-select';
    select.before(wrapper);
    wrapper.append(select);
    select.classList.add('fima-select-source');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fima-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = select.labels?.[0] || select.closest('label');
    const labelText = label?.firstChild?.textContent?.trim() || select.getAttribute('aria-label') || select.name || 'Seçim';
    trigger.setAttribute('aria-label', labelText);
    const popup = document.createElement('div');
    popup.className = 'fima-select-popup';
    popup.hidden = true;
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Ara…';
    search.setAttribute('aria-label', `${labelText} içinde ara`);
    search.autocomplete = 'off';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-expanded', 'true');
    const list = document.createElement('div');
    list.className = 'fima-select-options';
    list.id = `fima-options-${++enhanceFimaControls.sequence}`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', labelText);
    trigger.setAttribute('aria-controls', list.id);
    search.setAttribute('aria-controls', list.id);
    popup.append(search, list);
    wrapper.append(trigger, popup);
    let active = 0;
    let visible = [];
    const close = () => { popup.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const paintActive = () => {
      visible.forEach((button, index) => button.classList.toggle('is-active', index === active));
      if (visible[active]) {
        search.setAttribute('aria-activedescendant', visible[active].id);
        visible[active].scrollIntoView({ block: 'nearest' });
      } else search.removeAttribute('aria-activedescendant');
    };
    const render = () => {
      list.replaceChildren();
      const needle = search.value.toLocaleLowerCase('tr');
      visible = [...select.options].filter(option => !option.hidden && option.textContent.toLocaleLowerCase('tr').includes(needle)).map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fima-select-option';
        button.id = `${list.id}-${option.index}`;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.selected));
        button.disabled = option.disabled;
        button.tabIndex = -1;
        button.textContent = option.textContent.replace(/ · \d{16,22}$/, '');
        button.title = option.textContent;
        button.onclick = event => {
          event.preventDefault();
          if (select.disabled || option.disabled) return;
          select.value = option.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync(); close(); trigger.focus();
        };
        list.append(button);
        return button;
      });
      if (!visible.length) { const empty = document.createElement('p'); empty.textContent = 'Eşleşme bulunamadı'; list.append(empty); }
      active = Math.max(0, visible.findIndex(button => button.getAttribute('aria-selected') === 'true'));
      paintActive();
    };
    const sync = () => {
      trigger.textContent = select.selectedOptions[0]?.textContent.replace(/ · \d{16,22}$/, '') || 'Seç';
      trigger.disabled = select.disabled;
      if (select.disabled) close();
    };
    const open = () => {
      if (select.disabled) return;
      search.value = ''; popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true'); render(); search.focus();
    };
    trigger.onclick = event => { event.preventDefault(); popup.hidden ? open() : close(); };
    trigger.onkeydown = event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); } };
    search.oninput = event => { event.stopPropagation(); render(); };
    search.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); trigger.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); visible[active]?.click(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        active = Math.max(0, Math.min(visible.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
        paintActive();
      }
    };
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
    // Labels must not forward a custom button click to the hidden native menu.
    wrapper.addEventListener('click', event => event.preventDefault());
    select.addEventListener('change', sync);
    select.addEventListener('invalid', event => { event.preventDefault(); trigger.focus(); wrapper.classList.add('is-invalid'); });
    select.addEventListener('input', () => wrapper.classList.remove('is-invalid'));
    new MutationObserver(sync).observe(select, { attributes: true, childList: true, subtree: true });
    controlSync.set(select, sync);
    sync();
  }
}
enhanceFimaControls.sequence = 0;

export function observeFimaControls(root = document) {
  if (typeof MutationObserver !== 'function') return;
  enhanceFimaControls(root);
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('select') || node.querySelector('select:not([data-fima-select])'))))) enhanceFimaControls(root);
  }).observe(root, { childList: true, subtree: true });
}
