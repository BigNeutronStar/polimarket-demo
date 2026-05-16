/* Полюшко маркет MVP — app.js (static/localStorage) */
'use strict';

// ── STATE
const state = {
  events: [], filteredEvents: [], user: null,
  visibleCount: 12, pageSize: 12,
  currentCategory: 'all', currentSort: 'volume',
  currentStatus: 'all', currentTab: 'all', searchQuery: '',
  drawerEventId: null, drawerChoice: null, loading: false,
};

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── LOCALSTORAGE HELPERS
const LS = {
  get: (key, fallback = null) => { try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

// ── UTILS
function formatVolume(v) {
  if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v/1_000).toFixed(0)}K`;
  return `$${v}`;
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysLeft(iso) {
  const d = Math.ceil((new Date(iso) - new Date()) / 86_400_000);
  if (d < 0) return 'завершено';
  if (d === 0) return 'сегодня';
  if (d === 1) return '1 день';
  return `${d} д.`;
}
function truncate(s, n) { return s.length > n ? s.slice(0, n-1) + '…' : s; }
function categoryLabel(cat) {
  return { crypto:'Крипто', sport:'Спорт', economy:'Экономика', culture:'Культура', belarus:'Беларусь', technology:'Технологии', politics:'Политика', all:'Все' }[cat] || cat;
}
function badgeClass(cat) {
  return { crypto:'badge-crypto', sport:'badge-sport', economy:'badge-economy', culture:'badge-culture', belarus:'badge-belarus', technology:'badge-technology', politics:'badge-politics' }[cat] || 'badge-default';
}
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg; el.className = 'toast' + (type ? ` ${type}` : '');
  el.classList.add('show'); clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── DATA (localStorage-based API)
async function fetchEvents() {
  const res = await fetch('data/events.json');
  if (!res.ok) throw new Error('Ошибка загрузки событий');
  const base = await res.json();
  const overrides = LS.get('pm_overrides', {});
  const updated = base.map(ev => ({ ...ev, ...(overrides[ev.id] || {}) }));
  const local = LS.get('pm_events', []);
  return [...local, ...updated];
}

async function fetchUser() {
  const stored = LS.get('pm_user');
  if (stored) return stored;
  const user = { userId: 'anon_' + Math.floor(Math.random()*90000+10000), xp: 0, grade: 1, betsTotal: 0, betsCorrect: 0, eventsCreated: 0, balance: 1000 };
  LS.set('pm_user', user);
  return user;
}

async function postBet({ eventId, choice, amount }) {
  const user = LS.get('pm_user');
  if (!user) throw new Error('Пользователь не найден');
  if (amount > user.balance) throw new Error('Недостаточно средств на балансе');

  user.balance = Math.round(user.balance - amount);
  user.betsTotal++; user.xp += 10;
  user.grade = Math.min(10, Math.floor(user.xp / 100) + 1);
  LS.set('pm_user', user);

  const bets = LS.get('pm_bets', []);
  bets.push({ id: 'bet_' + Date.now(), eventId, choice, amount, timestamp: new Date().toISOString(), resolved: false });
  LS.set('pm_bets', bets);

  const ev = state.events.find(e => e.id === eventId);
  if (ev) {
    ev.totalVolume = (ev.totalVolume || 0) + amount;
    if (choice === 'yes') ev.yesProbability = Math.min(99, ev.yesProbability + 1);
    else ev.yesProbability = Math.max(1, ev.yesProbability - 1);
    ev.noProbability = 100 - ev.yesProbability;
    const overrides = LS.get('pm_overrides', {});
    overrides[eventId] = { totalVolume: ev.totalVolume, yesProbability: ev.yesProbability, noProbability: ev.noProbability };
    LS.set('pm_overrides', overrides);
  }
  return { user, event: ev };
}

async function postEvent(payload) {
  const user = LS.get('pm_user');
  if (!user) throw new Error('Пользователь не найден');
  const ev = {
    id: 'event_' + Date.now(),
    question: payload.question, description: payload.description || '',
    category: payload.category, endDate: payload.endDate,
    yesProbability: payload.yesProbability, noProbability: 100 - payload.yesProbability,
    totalVolume: 0, status: 'active', createdAt: new Date().toISOString(),
    coverImage: payload.coverImage || null,
  };
  const events = LS.get('pm_events', []);
  events.unshift(ev); LS.set('pm_events', events);
  user.eventsCreated++; user.xp += 30;
  user.grade = Math.min(10, Math.floor(user.xp / 100) + 1);
  LS.set('pm_user', user);
  return { event: ev, user };
}

// ── SKELETONS
function renderSkeletons(n = 6) {
  $('events-grid').innerHTML = Array.from({length: n}, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div style="display:flex;gap:.5rem"><div class="skel-line skel-sm" style="width:64px"></div><div class="skel-line skel-sm" style="width:48px;margin-left:auto"></div></div>
      <div class="skel-line skel-lg" style="width:100%"></div>
      <div class="skel-line skel-md" style="width:85%"></div>
      <div class="skel-bar" style="width:100%"></div>
      <div style="display:flex;gap:.5rem"><div class="skel-line skel-btn" style="flex:1"></div><div class="skel-line skel-btn" style="flex:1"></div></div>
      <div style="display:flex;justify-content:space-between"><div class="skel-line skel-sm" style="width:70px"></div><div class="skel-line skel-sm" style="width:80px"></div></div>
    </div>`).join('');
}

// ── RENDER CARD
function renderCard(ev) {
  const closed = ev.status === 'closed';
  const q = truncate(ev.question, 120);
  return `
    <article class="event-card" data-id="${ev.id}" tabindex="0"
      role="button" aria-label="Открыть событие: ${ev.question}"
      onclick="openDrawer('${ev.id}', null)"
      onkeydown="if(event.key==='Enter')openDrawer('${ev.id}',null)">
      <div class="card-top">
        <span class="card-badge ${badgeClass(ev.category)}">${categoryLabel(ev.category)}</span>
        <span class="card-status ${ev.status}">${closed ? 'Закрыто' : 'Активно'}</span>
      </div>
      <p class="card-question">${q}</p>
      <div class="prob-bar">
        <div class="prob-labels">
          <span class="prob-yes">Да ${ev.yesProbability}%</span>
          <span class="prob-no">${ev.noProbability}% Нет</span>
        </div>
        <div class="prob-track"><div class="prob-fill" style="width:${ev.yesProbability}%"></div></div>
      </div>
      <div class="card-btns">
        <button class="btn-yes" ${closed ? 'disabled' : ''}
          onclick="event.stopPropagation();openDrawer('${ev.id}','yes')"
          aria-label="Поставить Да">✓ Да ${ev.yesProbability}%</button>
        <button class="btn-no" ${closed ? 'disabled' : ''}
          onclick="event.stopPropagation();openDrawer('${ev.id}','no')"
          aria-label="Поставить Нет">✗ Нет ${ev.noProbability}%</button>
      </div>
      <div class="card-meta">
        <span class="card-vol">${formatVolume(ev.totalVolume)} объём</span>
        <span class="card-date">
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none"><path d="M9 4.75V9l3.25 2.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/></svg>
          ${daysLeft(ev.endDate)}
        </span>
      </div>
    </article>`;
}

// ── FILTERS
function applyFilters() {
  let list = [...state.events];

  if (state.currentCategory !== 'all')
    list = list.filter(e => e.category === state.currentCategory);
  if (state.currentStatus === 'active') list = list.filter(e => e.status === 'active');
  if (state.currentStatus === 'closed') list = list.filter(e => e.status === 'closed');

  const q = state.searchQuery.toLowerCase().trim();
  if (q) list = list.filter(e =>
    e.question.toLowerCase().includes(q) ||
    (e.description && e.description.toLowerCase().includes(q))
  );

  const tabSort = { all:null, new:'new', trending:'trending', popular:'volume', liquid:'volume', ending:'ending', competitive:'competitive' };
  const sort = tabSort[state.currentTab] || state.currentSort;

  switch (sort) {
    case 'new':         list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    case 'ending':      list.sort((a,b) => new Date(a.endDate)   - new Date(b.endDate));   break;
    case 'competitive': list.sort((a,b) => Math.abs(a.yesProbability-50) - Math.abs(b.yesProbability-50)); break;
    default:            list.sort((a,b) => b.totalVolume - a.totalVolume);
  }

  state.filteredEvents = list;
  state.visibleCount = state.pageSize;
  renderGrid();
  renderChips();
}

// ── RENDER GRID
function renderGrid() {
  const grid = $('events-grid');
  const visible = state.filteredEvents.slice(0, state.visibleCount);
  if (visible.length === 0) {
    grid.innerHTML = `<div class="end-of-list" style="grid-column:1/-1"><p style="font-size:2rem;margin-bottom:.5rem">🔍</p><p>Нет событий по выбранным фильтрам</p></div>`;
    return;
  }
  grid.innerHTML = visible.map(renderCard).join('');
  const eol = $('end-of-list');
  if (eol) eol.style.display = state.visibleCount >= state.filteredEvents.length ? 'block' : 'none';
}

// ── FILTER CHIPS
function renderChips() {
  const container = $('active-filters');
  if (!container) return;
  const chips = [];

  if (state.currentCategory !== 'all')
    chips.push({ label: `Кат: ${categoryLabel(state.currentCategory)}`, action: () => { state.currentCategory = 'all'; $$('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all')); applyFilters(); }});
  if (state.currentStatus !== 'all')
    chips.push({ label: state.currentStatus === 'active' ? 'Активные' : 'Завершённые', action: () => { state.currentStatus = 'all'; $$('.status-tab').forEach(t => { t.classList.toggle('active', t.dataset.status === 'all'); t.setAttribute('aria-pressed', t.dataset.status === 'all' ? 'true' : 'false'); }); applyFilters(); }});
  if (state.currentTab !== 'all')
    chips.push({ label: { new:'Новые', trending:'Тренды', popular:'Популярные', liquid:'Ликвидные', ending:'Скоро завершатся', competitive:'Конкурентные' }[state.currentTab] || state.currentTab, action: () => { state.currentTab = 'all'; $$('.market-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'all')); applyFilters(); }});
  if (state.searchQuery)
    chips.push({ label: `«${state.searchQuery}»`, action: () => { state.searchQuery = ''; const inp=$('search-input'); if(inp) inp.value=''; const clr=$('search-clear'); if(clr) clr.style.display='none'; applyFilters(); }});

  if (chips.length === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }

  container.style.display = 'flex';
  container.innerHTML = chips.map((c,i) => `<button class="filter-chip" data-chip="${i}">${c.label} ×</button>`).join('')
    + `<button class="filter-chip filter-chip-clear" id="chip-clear-all">Сбросить всё</button>`;

  chips.forEach((c,i) => container.querySelector(`[data-chip="${i}"]`).addEventListener('click', c.action));
  const ca = $('chip-clear-all');
  if (ca) ca.addEventListener('click', () => {
    state.currentCategory = 'all'; state.currentStatus = 'all'; state.currentTab = 'all'; state.searchQuery = '';
    $$('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
    $$('.market-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'all'));
    $$('.status-tab').forEach(t => { t.classList.toggle('active', t.dataset.status === 'all'); t.setAttribute('aria-pressed', t.dataset.status === 'all' ? 'true' : 'false'); });
    const inp=$('search-input'); if(inp) inp.value='';
    const clr=$('search-clear'); if(clr) clr.style.display='none';
    applyFilters();
  });
}

// ── INFINITE SCROLL
function initInfiniteScroll() {
  const sentinel = $('scroll-sentinel');
  if (!sentinel) return;
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && state.visibleCount < state.filteredEvents.length) {
      state.visibleCount += state.pageSize; renderGrid();
    }
  }, { rootMargin: '200px' }).observe(sentinel);
}

// ── USER UI
function updateUserUI() {
  const u = state.user; if (!u) return;
  const b = $('user-balance'); if (b) b.innerHTML = `Баланс: <span>${u.balance} ₽</span>`;
  const g = $('user-grade'); if (g) g.textContent = u.grade;
  const x = $('user-xp'); if (x) x.textContent = `${u.xp} XP`;
}

// ── DRAWER
window.openDrawer = function(eventId, choice) {
  const ev = state.events.find(e => e.id === eventId); if (!ev) return;
  state.drawerEventId = eventId; state.drawerChoice = choice;
  $('drawer-question').textContent = ev.question;
  $('drawer-desc').textContent = ev.description || 'Описание отсутствует';
  $('drawer-category').textContent = categoryLabel(ev.category);
  $('drawer-end-date').textContent = formatDate(ev.endDate);
  $('drawer-yes-prob').textContent = ev.yesProbability + '%';
  $('drawer-no-prob').textContent  = ev.noProbability  + '%';
  $('drawer-status-badge').textContent = ev.status === 'closed' ? 'Закрыто' : 'Активно';
  $('drawer-status-badge').className = `card-status ${ev.status}`;
  $$('.choice-tab').forEach(t => t.classList.remove('selected'));
  if (choice === 'yes') $('choice-yes').classList.add('selected');
  if (choice === 'no')  $('choice-no').classList.add('selected');
  $('bet-amount').value = ''; updatePayout();
  $('drawer-error').classList.remove('show'); $('drawer-error').textContent = '';
  const disabled = ev.status === 'closed';
  $('btn-bet').disabled = disabled; $('bet-amount').disabled = disabled;
  $$('.choice-tab').forEach(t => t.disabled = disabled);
  $$('.amount-preset').forEach(t => t.disabled = disabled);
  if (state.user) $('drawer-balance').textContent = state.user.balance + ' ₽';
  $('drawer-overlay').classList.add('open'); $('drawer').classList.add('open');
  document.body.style.overflow = 'hidden'; $('drawer-close').focus();
};
window.closeDrawer = function() {
  $('drawer-overlay').classList.remove('open'); $('drawer').classList.remove('open');
  document.body.style.overflow = ''; state.drawerEventId = null; state.drawerChoice = null;
};
function updatePayout() {
  const ev = state.events.find(e => e.id === state.drawerEventId); if (!ev) return;
  const amount = parseFloat($('bet-amount').value) || 0;
  const prob = state.drawerChoice === 'yes' ? ev.yesProbability/100 : ev.noProbability/100;
  $('payout-val').textContent = amount > 0 && prob > 0 ? `${(amount/prob).toFixed(2)} ₽` : '—';
}
function initDrawer() {
  $('drawer-overlay').addEventListener('click', closeDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if ($('drawer').classList.contains('open')) closeDrawer(); if ($('modal-overlay').classList.contains('open')) closeModal(); }
  });
  $('choice-yes').addEventListener('click', () => { state.drawerChoice='yes'; $$('.choice-tab').forEach(t=>t.classList.remove('selected')); $('choice-yes').classList.add('selected'); updatePayout(); });
  $('choice-no').addEventListener('click',  () => { state.drawerChoice='no';  $$('.choice-tab').forEach(t=>t.classList.remove('selected')); $('choice-no').classList.add('selected');  updatePayout(); });
  $$('.amount-preset').forEach(btn => btn.addEventListener('click', () => { $('bet-amount').value = btn.dataset.amount; updatePayout(); }));
  $('bet-amount').addEventListener('input', updatePayout);

  $('btn-bet').addEventListener('click', async () => {
    const errEl = $('drawer-error'); errEl.classList.remove('show');
    const amount = parseFloat($('bet-amount').value);
    const { drawerChoice: choice, drawerEventId: evId } = state;
    const ev = state.events.find(e => e.id === evId);
    const showErr = msg => { errEl.textContent = msg; errEl.classList.add('show'); };
    if (!choice) return showErr('Выберите исход: Да или Нет');
    if (!amount || isNaN(amount)) return showErr('Введите сумму ставки');
    if (amount < 10)    return showErr('Минимальная ставка — 10 ₽');
    if (amount > 10000) return showErr('Максимальная ставка — 10 000 ₽');
    if (state.user && amount > state.user.balance) return showErr('Недостаточно средств на балансе');
    if (ev?.status === 'closed') return showErr('Это событие уже закрыто');
    $('btn-bet').disabled = true; $('btn-bet').textContent = 'Обработка…';
    try {
      const result = await postBet({ eventId: evId, choice, amount, userId: state.user?.userId });
      if (result.event) { const idx = state.events.findIndex(e => e.id === evId); if (idx !== -1) state.events[idx] = result.event; }
      if (result.user) { state.user = result.user; updateUserUI(); }
      toast(`Ставка ${amount} ₽ на «${choice === 'yes' ? 'Да' : 'Нет'}» принята!`, 'success');
      closeDrawer(); applyFilters();
    } catch(err) { showErr(err.message); }
    finally { $('btn-bet').disabled = false; $('btn-bet').textContent = 'Поставить'; }
  });
}

// ── MODAL
window.openModal = function() {
  $('modal-overlay').classList.add('open'); document.body.style.overflow = 'hidden'; $('modal-close').focus();
  const tom = new Date(); tom.setDate(tom.getDate()+1); $('ev-end-date').min = tom.toISOString().split('T')[0];
};
window.closeModal = function() {
  $('modal-overlay').classList.remove('open');
  if (!$('drawer').classList.contains('open')) document.body.style.overflow = '';
  $('event-form').reset(); $$('.form-error').forEach(e=>e.classList.remove('show'));
  $$('.form-input,.form-select,.form-textarea').forEach(e=>e.classList.remove('error'));
  $('slider-val').textContent = '50%';
};
function initModal() {
  $('modal-overlay').addEventListener('click', e => { if (e.target===$('modal-overlay')) closeModal(); });
  $('modal-close').addEventListener('click', closeModal);
  $('btn-create-modal').addEventListener('click', openModal);
  $('btn-create-nav').addEventListener('click', openModal);
  $('ev-prob').addEventListener('input', () => { $('slider-val').textContent = $('ev-prob').value + '%'; });
  $('event-form').addEventListener('submit', async e => {
    e.preventDefault(); let valid = true;
    const question = $('ev-question').value.trim(), category = $('ev-category').value, endDate = $('ev-end-date').value;
    const prob = parseInt($('ev-prob').value), desc = $('ev-desc').value.trim();
    const setErr = (id, inputId, msg) => { $(id).textContent=msg; $(id).classList.add('show'); $(inputId).classList.add('error'); valid=false; };
    const clrErr = (id, inputId) => { $(id).classList.remove('show'); $(inputId).classList.remove('error'); };
    if (question.length < 10 || question.length > 120) setErr('err-question','ev-question','Вопрос: от 10 до 120 символов'); else clrErr('err-question','ev-question');
    if (!category) setErr('err-category','ev-category','Выберите категорию'); else clrErr('err-category','ev-category');
    if (!endDate || new Date(endDate) <= new Date()) setErr('err-date','ev-end-date','Выберите дату — минимум завтра'); else clrErr('err-date','ev-end-date');
    if (!valid) return;
    const btn = $('btn-submit'); btn.disabled = true; btn.textContent = 'Создание…';
    try {
      const result = await postEvent({ question, description: desc, category, endDate: new Date(endDate).toISOString(), yesProbability: prob });
      state.events.unshift(result.event);
      if (result.user) { state.user = result.user; updateUserUI(); }
      closeModal(); applyFilters(); toast('Событие создано! +30 XP', 'success');
    } catch(err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Создать событие'; }
  });
}

// ── INIT FILTERS  ← FIX: hideLoading() BEFORE applyFilters()
function initFilters() {
  $$('.cat-tab').forEach(tab => tab.addEventListener('click', e => {
    e.preventDefault();
    $$('.cat-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
    state.currentCategory = tab.dataset.cat;
    applyFilters(); // instant — no loading needed
  }));

  $$('.market-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.market-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
    state.currentTab = tab.dataset.tab;
    // sync sort select
    const map = { new:'new', ending:'ending', popular:'volume', liquid:'volume', trending:'volume', competitive:'volume', all:'volume' };
    const sortEl = $('sort-select');
    if (sortEl && map[state.currentTab]) { sortEl.value = map[state.currentTab]; state.currentSort = sortEl.value; }
    applyFilters(); // instant
  }));

  $('sort-select').addEventListener('change', () => {
    state.currentSort = $('sort-select').value; state.currentTab = 'all';
    $$('.market-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'all'));
    applyFilters();
  });

  $$('.status-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.status-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-pressed','false'); });
    tab.classList.add('active'); tab.setAttribute('aria-pressed','true');
    state.currentStatus = tab.dataset.status;
    applyFilters(); // instant
  }));

  // search with debounce
  const inp = $('search-input'), clr = $('search-clear');
  if (inp) {
    let timer;
    inp.addEventListener('input', () => {
      state.searchQuery = inp.value;
      if (clr) clr.style.display = inp.value ? 'flex' : 'none';
      clearTimeout(timer); timer = setTimeout(applyFilters, 250);
    });
    if (clr) clr.addEventListener('click', () => {
      inp.value = ''; state.searchQuery = ''; clr.style.display = 'none'; inp.focus(); applyFilters();
    });
  }
}

// ── INIT
async function init() {
  renderSkeletons(6);
  try {
    [state.events, state.user] = await Promise.all([fetchEvents(), fetchUser()]);
    updateUserUI(); applyFilters(); initFilters(); initDrawer(); initModal(); initInfiniteScroll();
  } catch(err) {
    $('events-grid').innerHTML = `<div class="end-of-list" style="grid-column:1/-1"><p>⚠️ Ошибка загрузки: ${err.message}</p><p style="margin-top:.5rem;font-size:.8rem;color:#999">Открывайте через HTTP-сервер, не двойным кликом на файл</p></div>`;
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', init);
