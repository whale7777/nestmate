/* Nestmate · PyNest 계정으로 쓰는 스터디 공간
 * - 로그인: PyNest 와 같은 Supabase 계정 (ID → id@pyclass.site)
 * - 접속 현황·상태: Supabase Realtime Presence (비공개 채널, 승인된 회원만)
 * - 스터디룸: WebRTC 메쉬 (신호는 Realtime Broadcast), 배경 블러(MediaPipe), PIP
 */
(function () {
  'use strict';
  const C = window.NM_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nestmate-auth' },
    realtime: { worker: true, params: { eventsPerSecond: 20 } },
  });
  const A = window.NMAvatar(sb);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emailOf = (id) => `${String(id).trim().toLowerCase()}@pyclass.site`;
  const ST = { study: '공부 중', rest: '쉬는 중', away: '자리 비움', dnd: '방해 금지' };

  const S = {
    me: null, info: null, connectedAt: Date.now(),
    status: 'study', text: '', cam: false,
    people: new Map(), names: new Map(), settings: { notice: '', room_locked: false, room_max: 8 },
    lobby: null, room: null, inRoom: false, rtc: new Map(), local: null, raw: null, blur: null,
    micOn: true, camOn: false, pip: null,
    prefs: Object.assign({ blur: true, mirror: true, theme: '', micOn: true }, load('nestmate-prefs')),
  };
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function savePrefs() { try { localStorage.setItem('nestmate-prefs', JSON.stringify(S.prefs)); } catch (e) {} }
  function applyTheme() { if (S.prefs.theme) document.documentElement.dataset.theme = S.prefs.theme; else delete document.documentElement.dataset.theme; }
  applyTheme();

  const root = $('#root');
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  function ago(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    if (m < 1) return '방금';
    if (m < 60) return m + '분';
    const h = Math.floor(m / 60);
    return h + '시간 ' + (m % 60 ? (m % 60) + '분' : '');
  }
  const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const f = (n) => String(n).padStart(2, '0'); return `${f(Math.floor(s / 3600))}:${f(Math.floor(s / 60) % 60)}:${f(s % 60)}`; };

  /* ---------- 사람 정보 ---------- */
  async function resolveNames(ids) {
    const need = ids.filter((i) => !S.names.has(i));
    if (!need.length) return;
    const { data, error } = await sb.rpc('nm_names', { p_ids: need });
    if (error) { need.forEach((i) => S.names.set(i, { username: '회원', avatar: null })); return; }
    need.forEach((i) => S.names.set(i, { username: '회원', avatar: null }));
    (data || []).forEach((r) => S.names.set(r.id, { username: r.username, avatar: r.avatar }));
  }
  function avatarHtml(uid, size, status) {
    const n = S.names.get(uid) || {};
    return `<span class="av" style="width:${size}px;height:${size}px">${A.avatarSvg(A.normAv(n.avatar, uid), size)}${status ? `<i class="dot ${status}"></i>` : ''}</span>`;
  }
  const nameOf = (uid) => (S.names.get(uid) || {}).username || '회원';

  /* ---------- 화면: 로그인 ---------- */
  function renderAuth(msg) {
    root.innerHTML = `
    <header class="top"><div class="wrap">
      <a class="brand" href="./"><img src="assets/icon-192.png" alt="">Nestmate<small>by PyNest</small></a><span class="sp"></span>
      <nav class="links"><a href="${esc(C.PYNEST_URL)}">PyNest</a><a href="${esc(C.SHOP_URL)}">민혁닷컴</a></nav>
    </div></header>
    <main class="wrap hero"><div class="hero-in">
      <div>
        <h1>같이 공부하는 사람들,<br><em>지금 누가 있는지</em> 바로 보입니다</h1>
        <p class="lead">PyNest 계정으로 들어오면 지금 접속 중인 사람과 각자의 상태가 보입니다. 필요하면 카메라를 켜고 스터디룸에서 같이 공부할 수 있습니다.</p>
        <ul class="pts">
          <li>접속 현황과 상태 메시지, 접속한 지 얼마나 됐는지 표시</li>
          <li>카메라는 선택, 켜더라도 배경 블러 지원</li>
          <li>다른 탭을 보고 있어도 접속 상태 유지, PIP 창 지원</li>
        </ul>
      </div>
      <form class="card login" id="lf" autocomplete="on">
        <h2>PyNest 계정으로 로그인</h2>
        <label class="f">아이디<input class="field" name="u" autocomplete="username" autocapitalize="off" required></label>
        <label class="f">비밀번호<input class="field" name="p" type="password" autocomplete="current-password" required></label>
        <div class="err" id="err">${esc(msg || '')}</div>
        <button class="btn pri" id="lgb" type="submit">로그인</button>
        <p class="small muted" style="margin:0">계정이 없으면 <a href="${esc(C.PYNEST_URL)}">PyNest</a>에서 가입을 신청하세요. 승인되면 Nestmate도 같은 계정으로 들어올 수 있습니다.</p>
      </form>
    </div></main>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const b = $('#lgb'); b.disabled = true; $('#err').textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(f.u.value), password: f.p.value });
      if (error) { b.disabled = false; $('#err').textContent = '아이디 또는 비밀번호가 맞지 않습니다.'; return; }
      boot();
    };
  }

  function renderPending(info) {
    root.innerHTML = `<main class="wrap hero"><div class="card pad" style="max-width:460px;margin:auto;text-align:center">
      <h2>승인 대기 중입니다</h2><p class="muted">${esc(info && info.username || '')} 계정은 아직 선생님의 승인을 받지 못했습니다. 승인되면 바로 이용할 수 있습니다.</p>
      <button class="btn" id="lo">로그아웃</button></div></main>`;
    $('#lo').onclick = logout;
  }

  /* ---------- 화면: 메인 ---------- */
  function shell() {
    root.innerHTML = `
    <header class="top"><div class="wrap">
      <a class="brand" href="./"><img src="assets/icon-192.png" alt="">Nestmate<small>by PyNest</small></a><span class="sp"></span>
      <nav class="links"><a href="${esc(C.PYNEST_URL)}">PyNest</a><a href="${esc(C.SHOP_URL)}">민혁닷컴</a></nav>
      <button class="btn sm" id="bSet" aria-label="설정">설정</button>
      <span class="me-chip" id="meChip"></span>
    </div></header>
    <div class="wrap">
      <div id="notice"></div>
      <div class="grid">
        <aside>
          <section class="card pad mycard" id="my"></section>
          <section class="card roster" id="roster"></section>
        </aside>
        <section class="card room" id="room"></section>
      </div>
    </div>`;
    $('#bSet').onclick = openSettings;
    renderAll();
  }
  function renderAll() { renderChip(); renderNotice(); renderMy(); renderRoster(); renderRoom(); }
  function renderChip() { const el = $('#meChip'); if (el) el.innerHTML = `${avatarHtml(S.me.id, 32)}<b>${esc(S.info.username)}</b>`; }
  function renderNotice() {
    const el = $('#notice'); if (!el) return;
    el.innerHTML = S.settings.notice ? `<div class="notice"><span>📢</span><span>${esc(S.settings.notice)}</span></div>` : '';
  }
  function renderMy() {
    const el = $('#my'); if (!el) return;
    el.innerHTML = `
      <div class="who">${avatarHtml(S.me.id, 56, S.status)}<div><b>${esc(S.info.username)}</b>${S.info.admin ? ' <span class="tag">관리자</span>' : ''}<div class="small muted">접속 <span class="mono" id="myT">${clock(Date.now() - S.connectedAt)}</span></div></div></div>
      <div class="seg" role="group" aria-label="상태">${Object.keys(ST).map((k) => `<button type="button" data-st="${k}" class="${S.status === k ? 'on' : ''}"><i class="dot ${k}"></i>${ST[k]}</button>`).join('')}</div>
      <label class="f">지금 뭐 하고 있나요<input class="field" id="stText" maxlength="40" placeholder="예: 파이썬 반복문 문제 푸는 중" value="${esc(S.text)}"></label>
      ${S.info.admin ? '<button class="btn sm" id="bAdm" type="button">스터디 공간 관리</button>' : ''}`;
    el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { S.status = b.dataset.st; track(); renderMy(); }));
    const t = $('#stText'); let tm;
    t.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { S.text = t.value.trim(); track(); try { localStorage.setItem('nestmate-text', S.text); } catch (e) {} }, 500); };
    if ($('#bAdm')) $('#bAdm').onclick = openAdmin;
  }
  function renderRoster() {
    const el = $('#roster'); if (!el) return;
    const list = [...S.people.values()].sort((a, b) => (a.id === S.me.id ? -1 : b.id === S.me.id ? 1 : a.since - b.since));
    el.innerHTML = `<div class="head"><h2>지금 접속 중</h2><span class="small muted">${list.length}명</span></div>
      <ul>${list.map((p) => `<li class="person">${avatarHtml(p.id, 42, p.status)}<div class="txt"><b>${esc(nameOf(p.id))}${p.id === S.me.id ? ' <span class="tag">나</span>' : ''}${p.cam ? ' <span title="카메라 켬">📷</span>' : ''}${p.room ? ' <span class="tag">스터디룸</span>' : ''}</b><div class="sub">${esc(p.text || ST[p.status] || '')}</div></div><span class="t" data-since="${p.since}">${ago(Date.now() - p.since)}</span></li>`).join('') || '<div class="empty">아직 아무도 없습니다.</div>'}</ul>`;
  }
  setInterval(() => {
    document.querySelectorAll('[data-since]').forEach((e) => (e.textContent = ago(Date.now() - Number(e.dataset.since))));
    const m = $('#myT'); if (m) m.textContent = clock(Date.now() - S.connectedAt);
  }, 1000);

  /* ---------- 로비 (Presence) ---------- */
  function myState() { return { id: S.me.id, status: S.status, text: S.text, since: S.connectedAt, cam: S.camOn, room: S.inRoom }; }
  async function track() { if (S.lobby) { try { await S.lobby.track(myState()); } catch (e) {} } }
  async function joinLobby() {
    S.lobby = sb.channel('nestmate:lobby', { config: { private: true, presence: { key: S.me.id }, broadcast: { self: false } } });
    S.lobby.on('presence', { event: 'sync' }, async () => {
      const st = S.lobby.presenceState(); const m = new Map();
      Object.keys(st).forEach((k) => { const metas = st[k]; const last = metas[metas.length - 1]; if (last) m.set(k, { ...last, id: k }); });
      S.people = m; await resolveNames([...m.keys()]); renderRoster(); renderChip(); renderMy();
    });
    S.lobby.on('broadcast', { event: 'settings' }, () => loadSettings());
    await new Promise((res) => S.lobby.subscribe(async (s) => { if (s === 'SUBSCRIBED') { await S.lobby.track(myState()); res(); } if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { toast('접속 현황 연결이 불안정합니다. 다시 시도하는 중입니다.'); } }));
  }
  async function loadSettings() {
    const { data } = await sb.from('nm_settings').select('*').eq('id', 1).maybeSingle();
    if (data) { S.settings = data; renderNotice(); renderRoom(); }
  }

  /* ---------- 설정 · 관리 ---------- */
  function modal(html) {
    const sc = document.createElement('div'); sc.className = 'scrim'; sc.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    sc.onclick = (e) => { if (e.target === sc) sc.remove(); }; document.body.appendChild(sc);
    const esc2 = (e) => { if (e.key === 'Escape') { sc.remove(); document.removeEventListener('keydown', esc2); } }; document.addEventListener('keydown', esc2);
    return sc;
  }
  function openSettings() {
    const m = modal(`<h2>설정</h2>
      <label class="sw"><span>카메라 배경 블러<small>카메라를 켤 때 기본으로 적용합니다.</small></span><input type="checkbox" id="pBlur" ${S.prefs.blur ? 'checked' : ''}></label>
      <label class="sw"><span>내 화면 좌우 반전<small>내 타일에서만 거울처럼 보입니다.</small></span><input type="checkbox" id="pMir" ${S.prefs.mirror ? 'checked' : ''}></label>
      <label class="sw"><span>입장할 때 마이크 켜기</span><input type="checkbox" id="pMic" ${S.prefs.micOn ? 'checked' : ''}></label>
      <label class="f">화면 테마<select class="field" id="pTh"><option value="">기기 설정에 맞춤</option><option value="light">라이트</option><option value="dark">다크</option></select></label>
      <div class="row between"><button class="btn" id="pOut">로그아웃</button><button class="btn pri" id="pOk">닫기</button></div>`);
    $('#pTh', m).value = S.prefs.theme || '';
    $('#pBlur', m).onchange = (e) => { S.prefs.blur = e.target.checked; savePrefs(); if (S.inRoom && S.camOn) applyBlur(); };
    $('#pMir', m).onchange = (e) => { S.prefs.mirror = e.target.checked; savePrefs(); renderRoom(); };
    $('#pMic', m).onchange = (e) => { S.prefs.micOn = e.target.checked; savePrefs(); };
    $('#pTh', m).onchange = (e) => { S.prefs.theme = e.target.value; savePrefs(); applyTheme(); };
    $('#pOk', m).onclick = () => m.remove(); $('#pOut', m).onclick = () => { m.remove(); logout(); };
  }
  function openAdmin() {
    const s = S.settings;
    const m = modal(`<h2>스터디 공간 관리</h2>
      <label class="f">공지<textarea class="field" id="aN" rows="2" maxlength="120" style="padding:8px 12px">${esc(s.notice)}</textarea></label>
      <label class="sw"><span>스터디룸 잠그기<small>잠그면 새로 입장할 수 없습니다.</small></span><input type="checkbox" id="aL" ${s.room_locked ? 'checked' : ''}></label>
      <label class="f">스터디룸 최대 인원<select class="field" id="aM">${[2, 4, 6, 8, 10, 12].map((n) => `<option ${n === s.room_max ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="row between"><button class="btn" id="aC">취소</button><button class="btn pri" id="aS">저장</button></div>`);
    $('#aC', m).onclick = () => m.remove();
    $('#aS', m).onclick = async () => {
      const { error } = await sb.from('nm_settings').update({ notice: $('#aN', m).value.trim(), room_locked: $('#aL', m).checked, room_max: Number($('#aM', m).value), updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) { toast('저장하지 못했습니다. 권한을 확인해 주세요.'); return; }
      await loadSettings(); S.lobby && S.lobby.send({ type: 'broadcast', event: 'settings', payload: {} }); m.remove(); toast('저장했습니다.');
    };
  }

  /* ---------- 스터디룸 ---------- */
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] };
  function roomCount() { return [...S.people.values()].filter((p) => p.room).length; }
  function renderRoom() {
    const el = $('#room'); if (!el) return;
    if (S.pip && S.pip.doc) return; // PIP 중에는 창 안쪽을 그대로 둠
    const locked = S.settings.room_locked && !S.info.admin;
    const full = !S.inRoom && roomCount() >= S.settings.room_max;
    el.innerHTML = `<div class="head"><h2>스터디룸</h2><span class="small muted">${roomCount()} / ${S.settings.room_max}명${S.settings.room_locked ? ' · 잠김' : ''}</span><span class="sp"></span>
      ${S.inRoom ? '<span class="pipbar"><button class="btn sm" id="bPip" type="button">PIP 창</button></span>' : ''}</div>
      <div class="stage" id="stage">${S.inRoom ? '<div class="tiles" id="tiles"></div>' : `<div class="hint"><h3>같이 공부할 사람을 만나 보세요</h3><p>입장하면 카메라와 마이크는 꺼진 채로 시작해도 됩니다. 켜면 배경 블러가 적용됩니다.</p>
        <button class="btn pri" id="bJoin" type="button" ${locked || full ? 'disabled' : ''}>${locked ? '지금은 잠겨 있습니다' : full ? '자리가 가득 찼습니다' : '스터디룸 입장'}</button></div>`}</div>
      ${S.inRoom ? `<div class="controls">
        <button class="btn ${S.micOn ? 'on' : ''}" id="bMic" type="button">${S.micOn ? '마이크 켬' : '마이크 끔'}</button>
        <button class="btn ${S.camOn ? 'on' : ''}" id="bCam" type="button">${S.camOn ? '카메라 켬' : '카메라 끔'}</button>
        <button class="btn ${S.prefs.blur ? 'on' : ''}" id="bBlur" type="button">배경 블러 ${S.prefs.blur ? '켬' : '끔'}</button>
        <span class="sp"></span><button class="btn bad" id="bLeave" type="button">나가기</button></div>` : ''}`;
    if (S.inRoom) { drawTiles(); }
    const j = $('#bJoin'); if (j) j.onclick = joinRoom;
    if (!S.inRoom) return;
    $('#bMic').onclick = toggleMic; $('#bCam').onclick = toggleCam; $('#bLeave').onclick = leaveRoom;
    $('#bBlur').onclick = () => { S.prefs.blur = !S.prefs.blur; savePrefs(); applyBlur(); renderRoom(); };
    $('#bPip').onclick = openPip;
  }
  function tileEl(uid, stream, isMe) {
    const d = document.createElement('div'); d.className = 'tile' + (isMe && S.prefs.mirror ? ' mirror' : ''); d.dataset.uid = uid;
    const hasVideo = stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled !== false);
    const p = S.people.get(uid) || {};
    const micOff = isMe ? !S.micOn : false;
    d.innerHTML = (hasVideo ? '<video playsinline autoplay></video>' : `<div class="ph">${avatarHtml(uid, 72)}</div>`) +
      `<div class="nm"><i class="dot ${p.status || 'study'}"></i>${esc(nameOf(uid))}${isMe ? ' (나)' : ''}</div>${micOff ? '<span class="mic">마이크 꺼짐</span>' : ''}`;
    const v = d.querySelector('video');
    if (v) { v.srcObject = stream; v.muted = !!isMe; v.play().catch(() => {}); }
    return d;
  }
  function drawTiles(target) {
    const box = target || $('#tiles'); if (!box) return;
    box.innerHTML = '';
    box.appendChild(tileEl(S.me.id, S.local, true));
    S.rtc.forEach((c, uid) => box.appendChild(tileEl(uid, c.stream, false)));
  }

  async function joinRoom() {
    if (S.inRoom) return;
    if (S.settings.room_locked && !S.info.admin) { toast('지금은 스터디룸이 잠겨 있습니다.'); return; }
    S.inRoom = true; S.micOn = !!S.prefs.micOn; S.camOn = false; S.local = new MediaStream();
    try {
      const a = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      a.getAudioTracks().forEach((t) => { t.enabled = S.micOn; S.local.addTrack(t); });
    } catch (e) { S.micOn = false; toast('마이크를 사용할 수 없어 소리 없이 입장합니다.'); }
    S.room = sb.channel('nestmate:room', { config: { private: true, presence: { key: S.me.id }, broadcast: { self: false } } });
    S.room.on('presence', { event: 'sync' }, onRoomSync);
    S.room.on('broadcast', { event: 'sig' }, ({ payload }) => onSignal(payload));
    S.room.subscribe(async (s) => { if (s === 'SUBSCRIBED') await S.room.track({ id: S.me.id, t: Date.now() }); });
    track(); renderRoom();
  }
  async function leaveRoom() {
    if (!S.inRoom) return;
    closePip();
    S.rtc.forEach((c) => { try { c.pc.close(); } catch (e) {} }); S.rtc.clear();
    stopBlur();
    [S.local, S.raw].forEach((st) => st && st.getTracks().forEach((t) => t.stop()));
    S.local = S.raw = null; S.camOn = false; S.inRoom = false;
    if (S.room) { try { await sb.removeChannel(S.room); } catch (e) {} S.room = null; }
    track(); renderRoom();
  }
  function onRoomSync() {
    const ids = Object.keys(S.room.presenceState()).filter((k) => k !== S.me.id);
    resolveNames(ids).then(() => {
      ids.forEach((uid) => { if (!S.rtc.has(uid) && S.me.id < uid) connect(uid, true); });
      [...S.rtc.keys()].forEach((uid) => { if (!ids.includes(uid)) dropPeer(uid); });
      drawTiles();
    });
  }
  function dropPeer(uid) { const c = S.rtc.get(uid); if (c) { try { c.pc.close(); } catch (e) {} S.rtc.delete(uid); } }
  function send(to, type, data) { S.room && S.room.send({ type: 'broadcast', event: 'sig', payload: { to, from: S.me.id, type, data } }); }
  function makePc(uid) {
    const pc = new RTCPeerConnection(ICE); const c = { pc, stream: new MediaStream(), queue: [], ready: false };
    S.rtc.set(uid, c);
    const aT = pc.addTransceiver('audio', { direction: 'sendrecv' }); const vT = pc.addTransceiver('video', { direction: 'sendrecv' });
    c.aS = aT.sender; c.vS = vT.sender;
    const at = S.local && S.local.getAudioTracks()[0]; if (at) c.aS.replaceTrack(at);
    const vt = S.local && S.local.getVideoTracks()[0]; if (vt) c.vS.replaceTrack(vt);
    pc.ontrack = (e) => { c.stream.addTrack(e.track); e.track.onmute = e.track.onunmute = e.track.onended = () => drawTiles(); drawTiles(); };
    pc.onicecandidate = (e) => { if (e.candidate) send(uid, 'ice', e.candidate.toJSON()); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (e) {} } };
    return c;
  }
  async function connect(uid, offerer) {
    const c = makePc(uid);
    if (offerer) { const o = await c.pc.createOffer(); await c.pc.setLocalDescription(o); send(uid, 'offer', c.pc.localDescription.toJSON()); }
  }
  async function onSignal(m) {
    if (!m || m.to !== S.me.id || !S.inRoom) return;
    let c = S.rtc.get(m.from);
    if (m.type === 'offer') {
      if (c) dropPeer(m.from);
      c = makePc(m.from);
      await c.pc.setRemoteDescription(m.data); c.ready = true;
      const an = await c.pc.createAnswer(); await c.pc.setLocalDescription(an); send(m.from, 'answer', c.pc.localDescription.toJSON());
      c.queue.splice(0).forEach((x) => c.pc.addIceCandidate(x).catch(() => {}));
    } else if (m.type === 'answer' && c) {
      await c.pc.setRemoteDescription(m.data); c.ready = true; c.queue.splice(0).forEach((x) => c.pc.addIceCandidate(x).catch(() => {}));
    } else if (m.type === 'ice' && c) {
      if (c.ready) c.pc.addIceCandidate(m.data).catch(() => {}); else c.queue.push(m.data);
    }
  }
  function toggleMic() {
    S.micOn = !S.micOn; const a = S.local && S.local.getAudioTracks()[0];
    if (a) a.enabled = S.micOn; else if (S.micOn) { toast('마이크를 사용할 수 없습니다.'); S.micOn = false; }
    renderRoom();
  }

  /* ---------- 카메라 · 배경 블러 ---------- */
  async function toggleCam() {
    if (S.camOn) { setVideoTrack(null); S.raw && S.raw.getTracks().forEach((t) => t.stop()); S.raw = null; stopBlur(); S.camOn = false; track(); renderRoom(); return; }
    try { S.raw = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } }); }
    catch (e) { toast('카메라를 사용할 수 없습니다. 브라우저 권한을 확인해 주세요.'); return; }
    S.camOn = true; await applyBlur(); track(); renderRoom();
  }
  function setVideoTrack(t) {
    (S.local ? S.local.getVideoTracks() : []).forEach((x) => S.local.removeTrack(x));
    if (t) S.local.addTrack(t);
    S.rtc.forEach((c) => c.vS && c.vS.replaceTrack(t || null).catch(() => {}));
  }
  let seg = null, segLoading = null;
  function loadSeg() {
    if (seg) return Promise.resolve(seg);
    if (segLoading) return segLoading;
    segLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js';
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        try {
          const m = new window.SelfieSegmentation({ locateFile: (f) => 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/' + f });
          m.setOptions({ modelSelection: 1 }); seg = m; res(m);
        } catch (e) { rej(e); }
      };
      s.onerror = rej; document.head.appendChild(s);
    });
    return segLoading;
  }
  function stopBlur() { if (S.blur) { S.blur.stop = true; S.blur.out && S.blur.out.getTracks().forEach((t) => t.stop()); S.blur = null; } }
  async function applyBlur() {
    if (!S.camOn || !S.raw) return;
    stopBlur();
    const rawTrack = S.raw.getVideoTracks()[0];
    if (!S.prefs.blur) { setVideoTrack(rawTrack); return; }
    try {
      const model = await loadSeg();
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([rawTrack]); await v.play();
      const cv = document.createElement('canvas'); cv.width = v.videoWidth || 640; cv.height = v.videoHeight || 360; const g = cv.getContext('2d');
      const st = { stop: false, out: null }; S.blur = st;
      model.onResults((r) => {
        g.save(); g.clearRect(0, 0, cv.width, cv.height);
        g.drawImage(r.segmentationMask, 0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'source-in'; g.drawImage(r.image, 0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'destination-over'; g.filter = 'blur(14px)'; g.drawImage(r.image, 0, 0, cv.width, cv.height);
        g.restore();
      });
      st.out = cv.captureStream(24);
      const loop = async () => {
        if (st.stop) return;
        try { await model.send({ image: v }); } catch (e) {}
        // 탭이 가려지면 rAF 가 멈추므로 타이머로 이어 감 (낮은 프레임)
        if (document.hidden) setTimeout(loop, 500); else requestAnimationFrame(loop);
      };
      loop();
      setVideoTrack(st.out.getVideoTracks()[0]);
    } catch (e) {
      S.prefs.blur = false; setVideoTrack(rawTrack); toast('배경 블러를 불러오지 못해 원본 화면으로 보냅니다.');
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.blur && !S.blur.stop) { /* 루프는 스스로 rAF 로 복귀 */ } });

  /* ---------- PIP ---------- */
  async function openPip() {
    if (S.pip) { closePip(); return; }
    if ('documentPictureInPicture' in window) {
      try {
        const w = await window.documentPictureInPicture.requestWindow({ width: 360, height: 420 });
        [...document.styleSheets].forEach((ss) => { try { const l = w.document.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; if (ss.href) w.document.head.appendChild(l); } catch (e) {} });
        w.document.documentElement.dataset.theme = document.documentElement.dataset.theme || '';
        w.document.body.style.cssText = 'margin:0;padding:10px;background:var(--bg)';
        const box = w.document.createElement('div'); box.className = 'tiles'; box.style.gridTemplateColumns = '1fr'; w.document.body.appendChild(box);
        S.pip = { doc: w, box }; drawTiles(box); w.addEventListener('pagehide', () => { S.pip = null; renderRoom(); });
        const rf = setInterval(() => { if (!S.pip) clearInterval(rf); else drawTiles(box); }, 1500);
        return;
      } catch (e) { /* 아래 비디오 PIP 로 */ }
    }
    const v = document.querySelector('.tile:not(.mirror) video') || document.querySelector('.tile video');
    if (v && v.requestPictureInPicture) { try { await v.requestPictureInPicture(); S.pip = { video: v }; v.addEventListener('leavepictureinpicture', () => { S.pip = null; }, { once: true }); return; } catch (e) {} }
    toast('이 브라우저는 PIP를 지원하지 않거나, 보여줄 영상이 없습니다.');
  }
  function closePip() {
    if (!S.pip) return;
    try { if (S.pip.doc) S.pip.doc.close(); else if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (e) {}
    S.pip = null;
  }

  /* ---------- 시작 · 종료 ---------- */
  async function logout() {
    await leaveRoom();
    if (S.lobby) { try { await sb.removeChannel(S.lobby); } catch (e) {} S.lobby = null; }
    await sb.auth.signOut(); S.me = null; S.people.clear(); renderAuth();
  }
  async function boot() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { renderAuth(); return; }
    S.me = data.session.user;
    const { data: info, error } = await sb.rpc('nm_me');
    if (error || !info) { renderAuth('계정 정보를 불러오지 못했습니다.'); return; }
    S.info = info;
    if (!info.approved) { renderPending(info); return; }
    try { S.text = localStorage.getItem('nestmate-text') || ''; } catch (e) {}
    S.connectedAt = Date.now(); S.names.clear();
    await resolveNames([S.me.id]); A.loadItems().then(() => renderAll());
    shell(); await loadSettings(); await joinLobby();
  }
  window.addEventListener('pagehide', () => { try { S.rtc.forEach((c) => c.pc.close()); } catch (e) {} });
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && S.me) { S.me = null; renderAuth(); } });
  boot();
})();
