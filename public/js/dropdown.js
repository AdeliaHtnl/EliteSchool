/**
 * Accessible custom dropdown replacing native <select> (dark purple theme).
 */
function closeAll(except) {
  document.querySelectorAll('.c-select.open').forEach((el) => {
    if (el !== except) {
      el.classList.remove('open');
      const b = el.querySelector('[aria-expanded]');
      const list = el.querySelector('.c-select-list');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (list) list.hidden = true;
    }
  });
}

function buildDropdown(select) {
  if (!select || select.dataset.custom === '1' || select.multiple) return;
  select.dataset.custom = '1';
  select.classList.add('c-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const wrap = document.createElement('div');
  wrap.className = 'c-select';
  wrap.dataset.name = select.name || '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'c-select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');

  const list = document.createElement('ul');
  list.className = 'c-select-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  const syncLabel = () => {
    const opt = select.options[select.selectedIndex];
    btn.textContent = opt ? opt.textContent : '—';
  };

  const rebuild = () => {
    list.innerHTML = '';
    [...select.options].forEach((opt, idx) => {
      const li = document.createElement('li');
      li.className = 'c-select-option' + (opt.selected ? ' selected' : '');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.dataset.value = opt.value;
      li.dataset.index = String(idx);
      li.textContent = opt.textContent;
      li.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
      if (opt.disabled) li.setAttribute('aria-disabled', 'true');
      list.appendChild(li);
    });
    syncLabel();
  };

  const open = () => {
    closeAll(wrap);
    wrap.classList.add('open');
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const sel = list.querySelector('.selected') || list.querySelector('[role="option"]');
    sel?.focus?.();
    sel?.scrollIntoView({ block: 'nearest' });
  };

  const close = () => {
    wrap.classList.remove('open');
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  const pick = (idx) => {
    const opt = select.options[idx];
    if (!opt || opt.disabled) return;
    select.selectedIndex = idx;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    rebuild();
    close();
    btn.focus();
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (wrap.classList.contains('open')) close();
    else open();
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    pick(Number(li.dataset.index));
  });

  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('[role="option"]:not([aria-disabled="true"])')];
    const cur = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      btn.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[cur + 1] || items[0])?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (items[cur - 1] || items[items.length - 1])?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const li = document.activeElement?.closest?.('[role="option"]');
      if (li) pick(Number(li.dataset.index));
    }
  });

  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(btn);
  wrap.appendChild(list);
  wrap.appendChild(select);
  rebuild();
  select.addEventListener('change', syncLabel);
}

export function enhanceSelects(root = document) {
  root.querySelectorAll('select').forEach(buildDropdown);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.c-select')) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}
