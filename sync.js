/* =========================================================
   sync.js — đồng bộ dữ liệu nhóm qua Supabase (ES module)
   Chạy sau app.js. Nếu chưa cấu hình trong config.js thì
   app vẫn hoạt động bình thường ở chế độ offline.
   ========================================================= */

const CONFIG = window.APP_CONFIG || {};
const SUPABASE_URL = String(CONFIG.supabaseUrl || '').trim();
const SUPABASE_KEY = String(CONFIG.supabaseAnonKey || '').trim();
const ROOM_KEY = 'groupSchedule.roomCode';
const CLIENT_KEY = 'groupSchedule.clientId';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const el = {
  dot: document.getElementById('syncDot'),
  status: document.getElementById('syncStatus'),
  detail: document.getElementById('syncDetail'),
  actions: document.getElementById('syncActions'),
  joined: document.getElementById('syncJoined'),
  codeDisplay: document.getElementById('roomCodeDisplay'),
  input: document.getElementById('roomCodeInput'),
  btnJoin: document.getElementById('btnJoinRoom'),
  btnCreate: document.getElementById('btnCreateRoom'),
  btnCopy: document.getElementById('btnCopyRoom'),
  btnLeave: document.getElementById('btnLeaveRoom')
};

let supabase = null;
let channel = null;
let roomCode = null;
let pushTimer = null;
let refreshing = false;

/* Mỗi tab có một clientId riêng để không bỏ qua cập nhật của tab khác */
let myClientId = sessionStorage.getItem(CLIENT_KEY);
if (!myClientId) {
  myClientId = (crypto.randomUUID && crypto.randomUUID()) ||
    'c' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem(CLIENT_KEY, myClientId);
}

/* ---------------- UI helpers ---------------- */

function setStatus(kind, title, detail) {
  el.dot.className = `sync-dot ${kind}`;
  el.status.textContent = title;
  el.detail.textContent = detail || '';
}

function onlineDetail() {
  const n = window.getAppState().members.length;
  return `Đã đồng bộ · ${n} thành viên trong nhóm. Mọi thay đổi tự động cập nhật.`;
}

function setOnline() {
  if (roomCode) setStatus('online', `Đã đồng bộ · Mã ${roomCode}`, onlineDetail());
}

function updateRoomUI() {
  const joined = !!roomCode;
  el.actions.hidden = joined;
  el.joined.hidden = !joined;
  if (joined) el.codeDisplay.textContent = roomCode;
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function generateCode(length = 8) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

async function copyCode() {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
  } catch {
    const tmp = document.createElement('textarea');
    tmp.value = roomCode;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    tmp.remove();
  }
  toast('📋 Đã sao chép mã nhóm. Gửi cho bạn bè để họ tham gia!');
}

/* ---------------- Supabase operations ---------------- */

async function writeState(code) {
  const { error } = await supabase.from('groups').upsert({
    code,
    data: window.getAppState(),
    writer: myClientId,
    updated_at: new Date().toISOString()
  }, { onConflict: 'code' });
  if (error) throw error;
}

function subscribe(code) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('group-' + code)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'groups', filter: `code=eq.${code}`
    }, payload => {
      const row = payload.new;
      if (!row || !row.data || row.writer === myClientId) return;
      window.applyRemoteState(row.data);
      setOnline();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setOnline();
      else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        setStatus('error', 'Mất kết nối realtime', 'Dữ liệu vẫn được lưu; đang thử kết nối lại…');
      }
    });
}

async function joinRoom(rawCode, silent = false) {
  const code = normalizeCode(rawCode);
  if (code.length < 4) {
    toast('❌ Mã nhóm phải có ít nhất 4 ký tự.');
    return;
  }
  setStatus('connecting', 'Đang kết nối…', `Đang tìm nhóm ${code}…`);
  try {
    const { data, error } = await supabase
      .from('groups').select('data').eq('code', code).maybeSingle();
    if (error) throw error;

    if (data?.data) {
      window.applyRemoteState(data.data);
    } else {
      await writeState(code);
      if (!silent) toast('✨ Không tìm thấy mã, đã tạo nhóm mới với mã này.');
    }

    roomCode = code;
    localStorage.setItem(ROOM_KEY, code);
    updateRoomUI();
    subscribe(code);
    setOnline();
    if (!silent) toast(`✅ Đã tham gia nhóm ${code}.`);
  } catch (err) {
    console.error(err);
    setStatus('error', 'Không tham gia được', err.message || 'Kiểm tra lại kết nối và cấu hình Supabase.');
  }
}

async function createRoom() {
  const code = generateCode();
  setStatus('connecting', 'Đang tạo nhóm…', 'Vui lòng đợi vài giây.');
  try {
    await writeState(code);
    roomCode = code;
    localStorage.setItem(ROOM_KEY, code);
    updateRoomUI();
    subscribe(code);
    setOnline();
    toast(`🎉 Đã tạo nhóm ${code}. Gửi mã này cho bạn bè!`);
  } catch (err) {
    console.error(err);
    setStatus('error', 'Không tạo được nhóm', err.message || 'Kiểm tra kết nối và bảng groups trong Supabase.');
  }
}

function leaveRoom() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  roomCode = null;
  localStorage.removeItem(ROOM_KEY);
  clearTimeout(pushTimer);
  updateRoomUI();
  setStatus('offline', 'Chế độ offline', 'Dữ liệu hiện tại vẫn được giữ trên máy này.');
  toast('Đã rời nhóm.');
}

function changed() {
  if (!supabase || !roomCode) return;
  clearTimeout(pushTimer);
  setStatus('saving', 'Đang lưu…', 'Đang gửi thay đổi lên nhóm…');
  pushTimer = setTimeout(async () => {
    try {
      await writeState(roomCode);
      setOnline();
    } catch (err) {
      console.error(err);
      setStatus('error', 'Lỗi đồng bộ', err.message || 'Không gửi được thay đổi.');
      toast('⚠️ Không đồng bộ được thay đổi. Kiểm tra kết nối.');
    }
  }, 600);
}

async function refreshFromServer() {
  if (!supabase || !roomCode || refreshing) return;
  refreshing = true;
  try {
    const { data, error } = await supabase
      .from('groups').select('data, writer').eq('code', roomCode).maybeSingle();
    if (!error && data?.data && data.writer !== myClientId) window.applyRemoteState(data.data);
  } catch { /* bỏ qua, realtime sẽ lo phần còn lại */ }
  refreshing = false;
}

/* ---------------- Gắn sự kiện ---------------- */

el.btnJoin.addEventListener('click', () => joinRoom(el.input.value));
el.input.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(el.input.value); });
el.btnCreate.addEventListener('click', createRoom);
el.btnCopy.addEventListener('click', copyCode);
el.btnLeave.addEventListener('click', leaveRoom);
window.addEventListener('focus', refreshFromServer);

/* ---------------- Khởi động ---------------- */

if (!SUPABASE_URL || !SUPABASE_KEY) {
  updateRoomUI();
  el.actions.hidden = true;
  setStatus('offline', 'Chế độ offline',
    'Chưa cấu hình Supabase trong config.js — dữ liệu chỉ lưu trên máy này.');
} else {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    });
    window.Sync = { enabled: () => true, changed };
    el.actions.hidden = false;

    const savedRoom = localStorage.getItem(ROOM_KEY);
    if (savedRoom) {
      await joinRoom(savedRoom, true);
    } else {
      updateRoomUI();
      setStatus('offline', 'Chưa tham gia nhóm',
        'Tạo nhóm mới hoặc nhập mã của nhóm bạn bè để đồng bộ.');
    }
  } catch (err) {
    console.error('Không tải được Supabase:', err);
    setStatus('error', 'Lỗi cấu hình', 'Không tải được thư viện Supabase. Kiểm tra config.js và đường truyền.');
  }
}
