'use strict';

/* =========================================================
   Lịch rảnh nhóm bạn — ứng dụng thuần HTML/CSS/JS
   Dữ liệu lưu trong localStorage của trình duyệt.
   ========================================================= */

const STORAGE_KEY = 'groupSchedule.v1';
const DEVICE_KEY = 'groupSchedule.deviceId';

/* Mỗi máy/trình duyệt có một định danh riêng để xác định "thành viên của mình" */
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
const MY_DEVICE = getDeviceId();

/* sync.js sẽ thay thế object này khi được cấu hình */
window.Sync = window.Sync || { enabled: () => false, changed: () => {} };

const SLOTS = [
  { id: 'morning',   label: 'Sáng',  icon: '☀️', cls: 'morning' },
  { id: 'afternoon', label: 'Chiều', icon: '🌤️', cls: 'afternoon' },
  { id: 'evening',   label: 'Tối',   icon: '🌙', cls: 'evening' }
];
const DOW = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const MEMBER_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#22c55e'];

/* ---------------- State ---------------- */

function defaultState() {
  return {
    version: 1,
    groupName: 'Nhóm bạn của tôi',
    members: [],
    availability: {},
    selectedMemberId: null,
    weekKey: toKey(startOfWeek(new Date())),
    chosen: null
  };
}

let state = loadState();
const ui = { modalId: null, modalColor: MEMBER_COLORS[0], showAll: false };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const loaded = normalizeState(JSON.parse(raw));
    const mine = loaded.members.find(m => m.owner === MY_DEVICE);
    if (mine) loaded.selectedMemberId = mine.id;
    return loaded;
  } catch (err) {
    console.warn('Không đọc được dữ liệu đã lưu:', err);
    return defaultState();
  }
}

function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.groupName === 'string' && raw.groupName.trim()) s.groupName = raw.groupName.trim().slice(0, 60);
  if (Array.isArray(raw.members)) {
    s.members = raw.members
      .filter(m => m && typeof m.id === 'string' && typeof m.name === 'string' && m.name.trim())
      .map(m => ({
        id: m.id,
        name: m.name.trim().slice(0, 30),
        color: /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : MEMBER_COLORS[0],
        owner: typeof m.owner === 'string' ? m.owner : null
      }));
  }
  if (raw.availability && typeof raw.availability === 'object') s.availability = raw.availability;
  if (typeof raw.weekKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.weekKey)) s.weekKey = raw.weekKey;
  if (raw.chosen && typeof raw.chosen.dateKey === 'string' && SLOTS.some(sl => sl.id === raw.chosen.slot)) {
    s.chosen = { dateKey: raw.chosen.dateKey, slot: raw.chosen.slot };
  }
  if (!s.members.some(m => m.id === s.selectedMemberId)) s.selectedMemberId = s.members.length ? s.members[0].id : null;
  if (typeof raw.selectedMemberId === 'string' && s.members.some(m => m.id === raw.selectedMemberId)) s.selectedMemberId = raw.selectedMemberId;
  s.members.forEach(m => { if (!s.availability[m.id] || typeof s.availability[m.id] !== 'object') s.availability[m.id] = {}; });
  return s;
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const now = new Date();
    document.getElementById('savedAt').textContent = `Lưu lúc ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  } catch (err) {
    console.warn('Không lưu được dữ liệu:', err);
    toast('⚠️ Không thể lưu dữ liệu trong trình duyệt này.');
  }
}

function save() {
  saveLocal();
  if (window.Sync && window.Sync.enabled()) window.Sync.changed();
}

/* Được sync.js gọi khi có dữ liệu mới từ thành viên khác */
window.getAppState = () => state;
window.applyRemoteState = remote => {
  state = normalizeState(remote);
  saveLocal();
  renderAll();
  toast('🔄 Dữ liệu vừa được cập nhật từ nhóm.');
};

/* ---------------- Date helpers ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }
function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function getWeekDates() {
  const start = fromKey(state.weekKey);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
function dowIndex(date) { return (date.getDay() + 6) % 7; }
function shortDate(date) { return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`; }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- Data helpers ---------------- */

function getMember(id) { return state.members.find(m => m.id === id) || null; }
function isMine(member) { return !!member && member.owner === MY_DEVICE; }
function getMyMember() { return state.members.find(isMine) || null; }
function getEntry(memberId, dateKey) { return state.availability[memberId]?.[dateKey] || null; }
function isFree(memberId, dateKey, slotId) { return !!getEntry(memberId, dateKey)?.slots?.[slotId]; }
function getNote(memberId, dateKey) { return getEntry(memberId, dateKey)?.note || ''; }

function ensureEntry(memberId, dateKey) {
  if (!state.availability[memberId]) state.availability[memberId] = {};
  if (!state.availability[memberId][dateKey]) {
    state.availability[memberId][dateKey] = { slots: { morning: false, afternoon: false, evening: false }, note: '' };
  }
  const entry = state.availability[memberId][dateKey];
  if (!entry.slots || typeof entry.slots !== 'object') entry.slots = {};
  SLOTS.forEach(s => { entry.slots[s.id] = !!entry.slots[s.id]; });
  if (typeof entry.note !== 'string') entry.note = '';
  return entry;
}

function memberMarkCount(memberId) {
  let n = 0;
  const dates = state.availability[memberId] || {};
  Object.values(dates).forEach(entry => {
    SLOTS.forEach(s => { if (entry?.slots?.[s.id]) n++; });
  });
  return n;
}

function makeOption(dateKey, slot, index) {
  const members = state.members.filter(m => isFree(m.id, dateKey, slot.id));
  return { dateKey, date: fromKey(dateKey), slot, index, members, count: members.length };
}

/* ---------------- Rendering ---------------- */

function renderAll() {
  document.getElementById('groupName').value = state.groupName;
  renderMembers();
  renderWeekBar();
  renderCalendar();
  renderMatrix();
  renderMinSelect();
  renderSuggestions();
  renderChosen();
}

function renderMembers() {
  const box = document.getElementById('memberChips');
  const mine = getMyMember();
  const addBtn = document.getElementById('btnAddMember');
  addBtn.hidden = !!mine;
  addBtn.title = mine ? 'Mỗi thiết bị chỉ được tạo 1 thành viên' : '';

  const totalMarks = state.members.reduce((n, m) => n + memberMarkCount(m.id), 0);
  document.getElementById('memberSummary').textContent = mine
    ? `${state.members.length} thành viên · ${totalMarks} buổi đã đánh dấu · Thiết bị này: ${mine.name} (chỉ sửa được thành viên của bạn)`
    : state.members.length
      ? `${state.members.length} thành viên · ${totalMarks} buổi đã đánh dấu · Thiết bị này chưa có thành viên`
      : 'Chưa có thành viên nào';

  if (!state.members.length) {
    box.innerHTML = '<span class="members-empty">Chưa có thành viên. Nhấn “Thêm thành viên” để bắt đầu.</span>';
    return;
  }
  const canClaim = !mine && state.members.some(m => !m.owner);
  box.innerHTML = state.members.map(m => {
    const own = isMine(m);
    let extra = '';
    if (own) {
      extra = `<button class="chip-edit" type="button" data-action="edit" title="Đổi tên/màu ${esc(m.name)}" aria-label="Sửa ${esc(m.name)}">✎</button>
               <button class="chip-del" type="button" data-action="delete" title="Xóa ${esc(m.name)}" aria-label="Xóa ${esc(m.name)}">×</button>`;
    } else if (!m.owner && canClaim) {
      extra = `<button class="chip-claim" type="button" data-action="claim" title="Gán thành viên này cho thiết bị của bạn">Nhận</button>`;
    } else {
      extra = `<span class="chip-lock" title="Chỉ thiết bị chủ sở hữu mới được sửa">🔒</span>`;
    }
    return `<div class="member-chip ${m.id === state.selectedMemberId ? 'active' : ''} ${own ? 'mine' : ''}" data-id="${esc(m.id)}">
      <button class="chip-main" type="button" data-action="select" title="${own ? 'Lịch của bạn' : 'Chỉ xem lịch của ' + esc(m.name)}">
        <span class="chip-dot" style="--c:${esc(m.color)}"></span>
        <span>${esc(m.name)}</span>
        ${own ? '<span class="chip-you">bạn</span>' : ''}
        <span class="chip-count" title="Số buổi đã đánh dấu">${memberMarkCount(m.id)}</span>
      </button>
      ${extra}
    </div>`;
  }).join('');
}

function renderWeekBar() {
  const dates = getWeekDates();
  const a = dates[0], b = dates[6];
  document.getElementById('weekTitle').textContent =
    `${a.getDate()}/${a.getMonth() + 1} – ${b.getDate()}/${b.getMonth() + 1}/${b.getFullYear()}`;
}

function renderCalendar() {
  const title = document.getElementById('calendarTitle');
  const subtitle = document.getElementById('calendarSubtitle');
  const actions = document.getElementById('calendarActions');
  const box = document.getElementById('dayCards');
  const member = getMember(state.selectedMemberId);

  if (!member) {
    title.textContent = 'Lịch cá nhân';
    subtitle.textContent = 'Thêm thành viên để bắt đầu đánh dấu lịch rảnh.';
    actions.hidden = true;
    box.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="empty-icon">👥</div>
        <h3>Chưa có thành viên nào</h3>
        <p>Nhấn “Thêm thành viên” hoặc dùng “Lịch mẫu cho tôi” để bắt đầu.</p>
      </div>`;
    return;
  }

  const editable = isMine(member);
  title.innerHTML = `${editable ? '✏️' : '🔒'} Lịch của <span style="color:${esc(member.color)}">${esc(member.name)}</span>`;
  subtitle.textContent = editable
    ? 'Tích vào buổi bạn rảnh, rồi ghi chú khung giờ cụ thể (nếu có).'
    : `Bạn đang XEM lịch của ${member.name}. Chỉ thiết bị của ${member.name} mới có thể sửa.`;
  actions.hidden = !editable;

  const todayKey = toKey(new Date());
  const banner = editable ? '' : `<div class="readonly-banner" style="grid-column:1/-1">
      🔒 Đây là lịch do máy khác tạo. Bạn có thể xem và dùng gợi ý, nhưng không thể tích buổi hay sửa ghi chú.
    </div>`;
  box.innerHTML = banner + getWeekDates().map(date => {
    const key = toKey(date);
    const di = dowIndex(date);
    const note = getNote(member.id, key);
    const slotsHtml = SLOTS.map(s => {
      const on = isFree(member.id, key, s.id);
      return `<button type="button" class="slot s-${s.cls} ${on ? 'on' : ''} ${editable ? '' : 'readonly'}" data-slot="${s.id}" aria-pressed="${on}" ${editable ? '' : 'disabled title="Chỉ xem"'}>
                <span>${s.icon}</span><span>${s.label}</span><span class="check">✓</span>
              </button>`;
    }).join('');
    const noteHtml = editable
      ? `<label class="note-label">Ghi chú khung giờ</label>
         <textarea class="note-input ${note ? 'has-note' : ''}" data-date="${key}" rows="2" placeholder="VD: 9h00–11h00">${esc(note)}</textarea>`
      : `<div class="note-label">Ghi chú khung giờ</div>
         <div class="note-readonly ${note ? 'has-note' : ''}">${note ? esc(note) : '—'}</div>`;
    return `<div class="day-card ${di >= 5 ? 'weekend' : ''} ${key === todayKey ? 'today' : ''}" data-date="${key}">
              <div class="day-head">
                <div><span class="day-dow">${DOW[di]}</span><span class="day-date">${shortDate(date)}</span></div>
                ${key === todayKey ? '<span class="today-tag">Hôm nay</span>' : ''}
              </div>
              <div class="slot-toggles">${slotsHtml}</div>
              ${noteHtml}
            </div>`;
  }).join('');
}

function renderMatrix() {
  const table = document.getElementById('matrixTable');
  const total = state.members.length;
  const dates = getWeekDates();
  const head = `<thead><tr><th>Ngày</th>${SLOTS.map(s => `<th>${s.icon} ${s.label}</th>`).join('')}</tr></thead>`;
  const rows = dates.map((date, di) => {
    const key = toKey(date);
    const cells = SLOTS.map(s => {
      const option = makeOption(key, s, di);
      const ratio = total ? option.count / total : 0;
      const level = !total || option.count === 0 ? 'none' : ratio === 1 ? 'full' : ratio >= 0.5 ? 'mid' : 'low';
      const names = option.members.map(m => m.name).join(', ');
      const initials = option.members.map(m => m.name.charAt(0)).join(' · ');
      return `<td><div class="cell ${level}" title="${names ? esc(names) + ' rảnh' : 'Không ai rảnh'}">
                <strong>${option.count}${total ? '/' + total : ''}</strong>
                <span class="mini">${initials ? esc(initials) : '—'}</span>
              </div></td>`;
    }).join('');
    return `<tr><td class="day-label">${DOW[di]}<small>${shortDate(date)}</small></td>${cells}</tr>`;
  }).join('');
  table.innerHTML = `${head}<tbody>${rows}</tbody>`;
}

function renderMinSelect() {
  const select = document.getElementById('minMembers');
  const total = state.members.length;
  const prev = Number(select.value) || 0;
  select.innerHTML = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    return `<option value="${n}">${n} thành viên${n === total ? ' (tất cả)' : ''}</option>`;
  }).join('');
  select.value = String(prev > 0 && prev <= total ? prev : Math.max(1, total));
  select.disabled = total === 0;
}

function renderSuggestions() {
  const list = document.getElementById('suggestionList');
  const summary = document.getElementById('suggestSummary');
  const showMore = document.getElementById('btnShowMore');
  const total = state.members.length;

  if (!total) {
    summary.textContent = 'Cần ít nhất một thành viên.';
    list.innerHTML = `<div class="empty"><div class="empty-icon">🗓️</div><h3>Chưa có dữ liệu</h3><p>Thêm thành viên và đánh dấu lịch rảnh để xem gợi ý.</p></div>`;
    showMore.hidden = true;
    return;
  }

  const dates = getWeekDates();
  const allOptions = [];
  dates.forEach((date, di) => SLOTS.forEach(s => {
    const option = makeOption(toKey(date), s, di);
    if (option.count > 0) allOptions.push(option);
  }));

  const fullCount = allOptions.filter(o => o.count === total).length;
  summary.textContent = `Tuần này có ${fullCount} buổi mà tất cả ${total} thành viên đều rảnh.`;

  const threshold = Number(document.getElementById('minMembers').value) || 1;
  const filtered = allOptions
    .filter(o => o.count >= threshold)
    .sort((a, b) => b.count - a.count || a.dateKey.localeCompare(b.dateKey) || a.index - b.index);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty">
        <div class="empty-icon">🔍</div>
        <h3>Không có buổi nào phù hợp</h3>
        <p>Không có khung giờ nào có ít nhất ${threshold} người rảnh.</p>
        ${threshold > 1 ? '<button class="btn ghost small" type="button" data-action="lower" style="margin-top:10px">Giảm yêu cầu xuống ' + (threshold - 1) + ' người</button>' : ''}
      </div>`;
    showMore.hidden = true;
    return;
  }

  const visible = ui.showAll ? filtered : filtered.slice(0, 6);
  list.innerHTML = visible.map((o, i) => suggestionHtml(o, i, total)).join('');

  if (filtered.length > 6) {
    showMore.hidden = false;
    showMore.textContent = ui.showAll ? 'Thu gọn ▲' : `Xem thêm ${filtered.length - 6} phương án ▼`;
  } else {
    showMore.hidden = true;
  }
}

function suggestionHtml(o, rank, total) {
  const isBest = rank === 0;
  const allFree = o.count === total;
  const notes = o.members.map(m => {
    const note = getNote(m.id, o.dateKey);
    return note ? `<div><b style="color:${esc(m.color)}">${esc(m.name)}:</b> ${esc(note)}</div>` : '';
  }).filter(Boolean).join('');

  const isChosen = state.chosen && state.chosen.dateKey === o.dateKey && state.chosen.slot === o.slot.id;
  const tag = isBest ? (allFree ? '<span class="best-tag">🎉 Mọi người rảnh</span>' : '<span class="best-tag">👑 Tốt nhất</span>') : '';

  return `<div class="suggestion ${isBest ? 'best' : ''}">
      <div class="sug-head">
        <div>
          <div class="sug-date"><span class="sug-badge">${rank + 1}</span>${DOW[dowIndex(o.date)]}, ${shortDate(o.date)}</div>
          <div class="sug-meta">
            <span class="slot-pill ${o.slot.cls}">${o.slot.icon} ${o.slot.label}</span>
            ${tag}
          </div>
        </div>
        <span class="sug-count">${o.count}/${total} rảnh</span>
      </div>
      <div class="progress"><i style="width:${Math.round(o.count / total * 100)}%"></i></div>
      <div class="sug-members">${o.members.map(m => `<span class="person"><i style="--c:${esc(m.color)}"></i>${esc(m.name)}</span>`).join('')}</div>
      <div class="sug-notes">
        ${notes || '<div class="no-note">Không có ghi chú cụ thể.</div>'}
      </div>
      <button class="choose-btn" type="button" data-action="choose" data-date="${o.dateKey}" data-slot="${o.slot.id}" ${isChosen ? 'disabled' : ''}>
        ${isChosen ? '✓ Đã chọn thời điểm này' : 'Chọn thời điểm này'}
      </button>
    </div>`;
}

function renderChosen() {
  const card = document.getElementById('chosenCard');
  const body = document.getElementById('chosenBody');
  if (!state.chosen) { card.hidden = true; return; }

  const slot = SLOTS.find(s => s.id === state.chosen.slot);
  const date = fromKey(state.chosen.dateKey);
  const option = makeOption(state.chosen.dateKey, slot, dowIndex(date));
  card.hidden = false;
  body.innerHTML = `
    <div class="chosen-body-line"><strong>${DOW[dowIndex(date)]}, ${shortDate(date)}</strong> · ${slot.icon} ${slot.label}</div>
    <div class="chosen-body-line">${option.count}/${state.members.length} thành viên rảnh: ${option.members.map(m => esc(m.name)).join(', ') || '—'}</div>
    <div class="chosen-notes">${option.members.map(m => {
      const note = getNote(m.id, state.chosen.dateKey);
      return note ? `<div><b>${esc(m.name)}:</b> ${esc(note)}</div>` : '';
    }).join('') || 'Không có ghi chú cụ thể.'}</div>`;
}

/* ---------------- Member modal ---------------- */

function openMemberModal(id = null) {
  if (id && !isMine(getMember(id))) {
    toast('🔒 Bạn chỉ được sửa thành viên do chính thiết bị này tạo.');
    return;
  }
  if (!id && getMyMember()) {
    toast('Mỗi thiết bị chỉ được tạo 1 thành viên.');
    return;
  }
  ui.modalId = id;
  const member = id ? getMember(id) : null;
  ui.modalColor = member?.color || MEMBER_COLORS[state.members.length % MEMBER_COLORS.length];
  document.getElementById('memberModalTitle').textContent = member ? `Sửa thành viên: ${member.name}` : 'Thêm thành viên';
  document.getElementById('fMemberName').value = member?.name || '';
  document.getElementById('colorSwatches').innerHTML = MEMBER_COLORS.map(c =>
    `<button type="button" class="swatch ${c === ui.modalColor ? 'selected' : ''}" style="--c:${c}" data-color="${c}" aria-label="Màu ${c}"></button>`).join('');
  document.getElementById('memberModal').hidden = false;
  setTimeout(() => document.getElementById('fMemberName').focus(), 0);
}
function closeMemberModal() { document.getElementById('memberModal').hidden = true; ui.modalId = null; }

/* ---------------- Sample / import / export ---------------- */

/* Chỉ điền lịch mẫu cho CHÍNH thành viên của thiết bị này */
function fillMySample() {
  let me = getMyMember();
  if (!me) {
    const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    me = { id, name: 'Bạn', color: MEMBER_COLORS[state.members.length % MEMBER_COLORS.length], owner: MY_DEVICE };
    state.members.push(me);
    state.availability[id] = {};
    state.selectedMemberId = id;
  }
  if (memberMarkCount(me.id) && !confirm('Thay lịch hiện tại của bạn bằng lịch mẫu?')) return;

  const pattern = [[1, 0, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [1, 0, 1], [1, 1, 0], [0, 1, 1]];
  const notes = { 0: 'Sau 9h', 2: '20h00 – 21h30', 5: '9h00 – 11h00' };
  const week = Array.from({ length: 7 }, (_, i) => toKey(addDays(startOfWeek(new Date()), i)));
  state.availability[me.id] = {};
  week.forEach((key, di) => {
    const arr = pattern[di];
    state.availability[me.id][key] = {
      slots: { morning: !!arr[0], afternoon: !!arr[1], evening: !!arr[2] },
      note: notes[di] || ''
    };
  });
  state.selectedMemberId = me.id;
}

/* Chỉ xóa thành viên do chính thiết bị này tạo */
function removeMyMember() {
  const me = getMyMember();
  if (!me) { toast('Thiết bị này chưa có thành viên để xóa.'); return; }
  if (!confirm(`Xóa thành viên "${me.name}" và toàn bộ lịch của bạn khỏi nhóm?`)) return;
  state.members = state.members.filter(m => m.id !== me.id);
  delete state.availability[me.id];
  if (state.selectedMemberId === me.id) state.selectedMemberId = state.members[0]?.id || null;
}

/* Nhập JSON: chỉ khôi phục lịch của chính thiết bị này */
function importOwnData(raw) {
  const imported = normalizeState(raw);
  const me = getMyMember();
  if (!me) { toast('Thiết bị này chưa có thành viên để nhận dữ liệu.'); return; }
  const src = imported.members.find(m => m.owner === MY_DEVICE) ||
              imported.members.find(m => m.id === me.id);
  if (!src) { toast('File không chứa thành viên của thiết bị này.'); return; }
  const entries = imported.availability[src.id];
  if (!entries || typeof entries !== 'object') { toast('File không chứa lịch của bạn.'); return; }
  state.availability[me.id] = entries;
  me.name = src.name;
  me.color = src.color;
}

function exportJson() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob(['\uFEFF' + data], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lich-nhom-${toKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('✅ Đã xuất file JSON.');
}

/* ---------------- Utils ---------------- */

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- Events ---------------- */

document.getElementById('groupName').addEventListener('input', e => {
  state.groupName = e.target.value.slice(0, 60);
  save();
});

document.getElementById('btnAddMember').addEventListener('click', () => openMemberModal());
document.getElementById('memberChips').addEventListener('click', e => {
  const chip = e.target.closest('.member-chip');
  if (!chip) return;
  const id = chip.dataset.id;
  const action = e.target.closest('button')?.dataset.action;
  const m = getMember(id);

  if (action === 'edit') {
    openMemberModal(id);
    return;
  }
  if (action === 'claim') {
    if (getMyMember()) { toast('Thiết bị này đã có thành viên.'); return; }
    if (!m || m.owner) return;
    m.owner = MY_DEVICE;
    state.selectedMemberId = id;
    save(); renderAll();
    toast(`Đã gán "${m.name}" làm thành viên của thiết bị này.`);
    return;
  }
  if (action === 'delete') {
    if (!isMine(m)) { toast('🔒 Bạn không thể xóa thành viên của máy khác.'); return; }
    if (!confirm(`Xóa "${m.name}" và toàn bộ lịch rảnh của bạn?`)) return;
    removeMyMember();
    ui.showAll = false;
    save(); renderAll();
    toast(`Đã xóa ${m.name}.`);
    return;
  }
  state.selectedMemberId = id;
  saveLocal();
  renderAll();
});

document.getElementById('colorSwatches').addEventListener('click', e => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  ui.modalColor = b.dataset.color;
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s === b));
});
document.getElementById('memberForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('fMemberName').value.trim();
  if (!name) return;
  if (ui.modalId) {
    const m = getMember(ui.modalId);
    if (!isMine(m)) {
      toast('🔒 Bạn chỉ được sửa thành viên của mình.');
      closeMemberModal();
      return;
    }
    m.name = name;
    m.color = ui.modalColor;
    toast('Đã cập nhật thành viên của bạn.');
  } else {
    if (getMyMember()) {
      toast('Mỗi thiết bị chỉ được tạo 1 thành viên.');
      closeMemberModal();
      return;
    }
    const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.members.push({ id, name, color: ui.modalColor, owner: MY_DEVICE });
    state.availability[id] = {};
    state.selectedMemberId = id;
    toast(`Đã thêm ${name} — thành viên của thiết bị này.`);
  }
  ui.showAll = false;
  closeMemberModal();
  save(); renderAll();
});
document.querySelectorAll('[data-close="memberModal"]').forEach(b => b.addEventListener('click', closeMemberModal));
document.getElementById('memberModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeMemberModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('memberModal').hidden) closeMemberModal();
});

document.getElementById('btnPrevWeek').addEventListener('click', () => {
  state.weekKey = toKey(addDays(fromKey(state.weekKey), -7));
  ui.showAll = false;
  save(); renderWeekBar(); renderCalendar(); renderMatrix(); renderSuggestions();
});
document.getElementById('btnNextWeek').addEventListener('click', () => {
  state.weekKey = toKey(addDays(fromKey(state.weekKey), 7));
  ui.showAll = false;
  save(); renderWeekBar(); renderCalendar(); renderMatrix(); renderSuggestions();
});
document.getElementById('btnToday').addEventListener('click', () => {
  state.weekKey = toKey(startOfWeek(new Date()));
  ui.showAll = false;
  save(); renderWeekBar(); renderCalendar(); renderMatrix(); renderSuggestions();
});

document.getElementById('dayCards').addEventListener('click', e => {
  const btn = e.target.closest('.slot');
  if (!btn) return;
  const dayCard = btn.closest('.day-card');
  const member = getMember(state.selectedMemberId);
  if (!member || !dayCard || !isMine(member)) return;
  const entry = ensureEntry(member.id, dayCard.dataset.date);
  const slot = btn.dataset.slot;
  entry.slots[slot] = !entry.slots[slot];
  save(); renderCalendar(); renderMembers(); renderMatrix(); renderSuggestions(); renderChosen();
});
document.getElementById('dayCards').addEventListener('input', e => {
  const area = e.target.closest('.note-input');
  if (!area) return;
  const member = getMember(state.selectedMemberId);
  if (!member || !isMine(member)) return;
  const entry = ensureEntry(member.id, area.dataset.date);
  entry.note = area.value.slice(0, 300);
  area.classList.toggle('has-note', !!entry.note.trim());
  save(); renderSuggestions(); renderChosen();
});

document.getElementById('btnSelectAll').addEventListener('click', () => {
  const member = getMember(state.selectedMemberId);
  if (!member || !isMine(member)) return;
  getWeekDates().forEach(d => {
    const entry = ensureEntry(member.id, toKey(d));
    SLOTS.forEach(s => { entry.slots[s.id] = true; });
  });
  save(); renderCalendar(); renderMembers(); renderMatrix(); renderSuggestions(); renderChosen();
  toast(`Đã đánh dấu cả tuần cho ${member.name}.`);
});
document.getElementById('btnClearWeek').addEventListener('click', () => {
  const member = getMember(state.selectedMemberId);
  if (!member || !isMine(member)) return;
  if (!confirm(`Xóa tất cả đánh dấu của ${member.name} trong tuần này?`)) return;
  getWeekDates().forEach(d => {
    const entry = ensureEntry(member.id, toKey(d));
    SLOTS.forEach(s => { entry.slots[s.id] = false; });
    entry.note = '';
  });
  save(); renderCalendar(); renderMembers(); renderMatrix(); renderSuggestions(); renderChosen();
});

document.getElementById('minMembers').addEventListener('change', () => {
  ui.showAll = false;
  renderSuggestions();
});
document.getElementById('btnShowMore').addEventListener('click', () => {
  ui.showAll = !ui.showAll;
  renderSuggestions();
});
document.getElementById('suggestionList').addEventListener('click', e => {
  const lower = e.target.closest('[data-action="lower"]');
  if (lower) {
    const select = document.getElementById('minMembers');
    select.value = String(Math.max(1, Number(select.value) - 1));
    renderSuggestions();
    return;
  }
  const btn = e.target.closest('[data-action="choose"]');
  if (!btn) return;
  state.chosen = { dateKey: btn.dataset.date, slot: btn.dataset.slot };
  save(); renderSuggestions(); renderChosen();
  toast('Đã lưu thời điểm họp đã chọn.');
});
document.getElementById('btnClearChosen').addEventListener('click', () => {
  state.chosen = null;
  save(); renderSuggestions(); renderChosen();
});

document.getElementById('btnSample').addEventListener('click', () => {
  fillMySample();
  ui.showAll = false;
  save(); renderAll();
  toast('✨ Đã điền lịch mẫu cho thành viên của bạn.');
});
document.getElementById('btnReset').addEventListener('click', () => {
  removeMyMember();
  ui.showAll = false;
  save(); renderAll();
  toast('Đã xóa thành viên của thiết bị này.');
});
document.getElementById('btnExport').addEventListener('click', exportJson);
document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileImport').click());
document.getElementById('fileImport').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    importOwnData(parsed);
    ui.showAll = false;
    save(); renderAll();
    toast('✅ Đã khôi phục lịch của riêng bạn từ file.');
  } catch (err) {
    console.error(err);
    toast('❌ File JSON không hợp lệ.');
  }
  e.target.value = '';
});

/* ---------------- Start ---------------- */

renderAll();
