/* PyNest 캐릭터 렌더링: PyNest app.js 의 캐릭터 코드를 그대로 가져왔습니다. 같은 계정, 같은 캐릭터. */
window.NMAvatar=(function(sb){
  const ITEMS = new Map(); // id → {id,name,slot,svg(정리된 것)}
  const ITEM_SLOTS = [['hat', '모자', '🎩'], ['hair', '머리', '💇'], ['face', '얼굴', '😎'], ['outfit', '옷', '👕'], ['back', '뒤(날개·망토)', '🪽'], ['deco', '장식', '✨']];
  const SVG_TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop']);
  const SVG_ATTR = /^(d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points|fill|fill-opacity|fill-rule|clip-rule|stroke|stroke-width|stroke-opacity|stroke-linecap|stroke-linejoin|stroke-dasharray|opacity|transform|id|offset|stop-color|stop-opacity|gradientunits|gradienttransform)$/i;
  function cleanSvg(str) {
    try {
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${str}</svg>`, 'image/svg+xml');
      if (doc.querySelector('parsererror')) return '';
      const walk = (n) => {
        Array.from(n.children).forEach((c) => {
          if (!SVG_TAGS.has(c.localName.toLowerCase())) { c.remove(); return; }
          Array.from(c.attributes).forEach((at) => {
            if (!SVG_ATTR.test(at.name) || /javascript:|data:|url\(\s*[^#\s)]/i.test(at.value)) c.removeAttribute(at.name);
          });
          walk(c);
        });
      };
      walk(doc.documentElement);
      return Array.from(doc.documentElement.childNodes).map((x) => new XMLSerializer().serializeToString(x)).join('').replace(/ xmlns="[^"]*"/g, '');
    } catch (e) { return ''; }
  }
  const IT = (a, slot) => { const id = a.items && a.items[slot]; const it = id && ITEMS.get(id); return it && it.slot === slot ? `<g>${it.svg}</g>` : ''; };
  async function loadItems() {
    try {
      const { data, error } = await sb.from('avatar_items').select('id,name,slot,svg').eq('status', 'active');
      if (error) throw error;
      ITEMS.clear();
      (data || []).forEach((x) => { const sv = cleanSvg(x.svg); if (sv) ITEMS.set(x.id, { id: x.id, name: x.name, slot: x.slot, svg: sv }); });
    } catch (e) { /* v451_items.sql 전이면 아이템 없이 동작해요 */ }
  }
  const AV = {
    skin: ['#ffe0c7', '#f7cba4', '#e8b48a', '#c98d62', '#a56a43', '#7a4a2c'],
    hairColor: ['#2b2b2b', '#5b3a1e', '#9a6a2f', '#e0b04a', '#d6453d', '#3b6fd8', '#8a4fd8', '#f2f2f2'],
    outfitColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#334155', '#f8fafc'],
    bg: ['#dbeafe', '#fee2e2', '#d1fae5', '#fef3c7', '#ede9fe', '#fce7f3', '#e2e8f0', '#1e293b'],
    hair: [['none', '없음'], ['short', '짧은 머리'], ['spiky', '뾰족 머리'], ['long', '긴 머리'], ['bun', '똥머리'], ['curly', '곱슬']],
    eyes: [['dot', '동그란 눈'], ['happy', '웃는 눈'], ['sleepy', '졸린 눈'], ['wide', '큰 눈'], ['wink', '윙크']],
    mouth: [['smile', '미소'], ['open', '활짝'], ['flat', '무표정'], ['tongue', '메롱'], ['o', '오']],
    outfit: [['tee', '티셔츠'], ['hoodie', '후드'], ['suit', '정장'], ['stripe', '줄무늬']],
    hat: [['none', '없음'], ['cap', '야구모자'], ['beanie', '비니'], ['headband', '헤어밴드'], ['crown', '왕관 (Gold~)', 2], ['wizard', '마법사 모자 (Platinum~)', 3]],
    acc: [['none', '없음'], ['glasses', '안경'], ['bow', '리본'], ['shades', '선글라스 (Silver~)', 1], ['headphone', '헤드폰 (Silver~)', 1]],
  };
  const AV_KEYS = ['skin', 'hairColor', 'outfitColor', 'bg', 'hair', 'eyes', 'mouth', 'outfit', 'hat', 'acc', 'hatColor'];
  const avHash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const avPick = (arr, h, k) => arr[(h >>> k) % arr.length];
  const avCode = (list) => list.map((x) => x[0]);
  function defAvatar(seed) {
    const h = avHash(seed || 'x');
    return { skin: avPick(AV.skin, h, 1), hairColor: avPick(AV.hairColor.slice(0, 6), h, 3), outfitColor: avPick(AV.outfitColor, h, 5), bg: avPick(AV.bg.slice(0, 7), h, 7),
      hair: avPick(['short', 'spiky', 'long', 'bun', 'curly'], h, 9), eyes: avPick(avCode(AV.eyes), h, 11), mouth: avPick(['smile', 'open', 'smile', 'tongue'], h, 13),
      outfit: avPick(avCode(AV.outfit), h, 15), hat: 'none', acc: 'none', hatColor: avPick(AV.outfitColor, h, 17) };
  }
  function normAv(a, seed) {
    const d = defAvatar(seed);
    const o = a && typeof a === 'object' ? a : {};
    const r = {};
    AV_KEYS.forEach((k) => { r[k] = typeof o[k] === 'string' ? o[k] : d[k]; });
    const hex = /^#[0-9a-f]{6}$/i;
    ['skin', 'hairColor', 'outfitColor', 'bg', 'hatColor'].forEach((k) => { if (!hex.test(r[k])) r[k] = d[k]; });
    [['hair', AV.hair], ['eyes', AV.eyes], ['mouth', AV.mouth], ['outfit', AV.outfit], ['hat', AV.hat], ['acc', AV.acc]].forEach(([k, l]) => { if (!avCode(l).includes(r[k])) r[k] = d[k]; });
    r.items = {};
    if (o.items && typeof o.items === 'object') ITEM_SLOTS.forEach(([k]) => { if (typeof o.items[k] === 'string' && /^[a-z0-9_]{2,40}$/.test(o.items[k])) r.items[k] = o.items[k]; });
    return r;
  }
  function avatarSvg(av, size = 64) {
    const a = av;
    const sk = a.skin; const hc = a.hairColor; const oc = a.outfitColor; const dark = 'rgba(0,0,0,.22)';
    let s = `<rect width="100" height="100" rx="22" fill="${a.bg}"/>`;
    const iHat = IT(a, 'hat'); const iHair = IT(a, 'hair'); const iFace = IT(a, 'face');
    const hairK = iHair ? 'none' : a.hair; // 아이템을 입으면 같은 자리의 기본 모양은 빠져요
    const hasHat = !!iHat || a.hat !== 'none';
    s += IT(a, 'back');
    // 옷
    s += `<path d="M10 100 C12 76 32 68 50 68 C68 68 88 76 90 100 Z" fill="${oc}"/>`;
    if (a.outfit === 'hoodie') s += `<path d="M30 74 Q50 90 70 74 Q50 66 30 74Z" fill="${dark}"/><path d="M45 82 V94 M55 82 V94" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/>`;
    else if (a.outfit === 'suit') s += `<path d="M38 68 L50 90 L62 68 Z" fill="#fff"/><path d="M47 72 L50 90 L53 72 Z" fill="#ef4444"/><path d="M10 100 C12 76 32 68 38 68 L50 92 L40 100Z M90 100 C88 76 68 68 62 68 L50 92 L60 100Z" fill="${dark}"/>`;
    else if (a.outfit === 'stripe') s += `<g stroke="#fff" stroke-opacity=".55" stroke-width="3"><path d="M14 82 H86 M12 90 H88 M12 98 H88"/></g><path d="M40 68 Q50 78 60 68Z" fill="${dark}"/>`;
    else s += `<path d="M40 68 Q50 78 60 68Z" fill="${dark}"/>`;
    s += `<rect x="43" y="56" width="14" height="14" rx="5" fill="${sk}"/><path d="M43 64 Q50 70 57 64 V60 H43Z" fill="${dark}"/>`;
    s += IT(a, 'outfit');
    // 뒷머리
    if (hairK === 'long') s += `<path d="M23 50 C20 14 80 14 77 50 L80 80 Q50 88 20 80Z" fill="${hc}"/>`;
    if (hairK === 'bun' && !hasHat) s += `<circle cx="50" cy="11" r="10" fill="${hc}"/>`;
    // 얼굴
    s += `<circle cx="26.5" cy="48" r="5" fill="${sk}"/><circle cx="73.5" cy="48" r="5" fill="${sk}"/><ellipse cx="50" cy="46" rx="24" ry="26" fill="${sk}"/>`;
    s += `<ellipse cx="35" cy="55" rx="4.5" ry="3" fill="#ff7a8a" fill-opacity=".35"/><ellipse cx="65" cy="55" rx="4.5" ry="3" fill="#ff7a8a" fill-opacity=".35"/>`;
    // 눈
    const eyeC = '#27272a';
    const E = {
      dot: `<circle cx="40" cy="46" r="3.2" fill="${eyeC}"/><circle cx="60" cy="46" r="3.2" fill="${eyeC}"/>`,
      happy: `<path d="M35.5 47.5 Q40 41.5 44.5 47.5 M55.5 47.5 Q60 41.5 64.5 47.5" fill="none" stroke="${eyeC}" stroke-width="2.6" stroke-linecap="round"/>`,
      sleepy: `<path d="M35.5 46 H44.5 M55.5 46 H64.5" stroke="${eyeC}" stroke-width="2.8" stroke-linecap="round"/><path d="M36 49 Q40 51 44 49 M56 49 Q60 51 64 49" fill="none" stroke="${dark}" stroke-width="1.2"/>`,
      wide: `<circle cx="40" cy="46" r="5.4" fill="#fff"/><circle cx="60" cy="46" r="5.4" fill="#fff"/><circle cx="40.8" cy="46.4" r="3" fill="${eyeC}"/><circle cx="60.8" cy="46.4" r="3" fill="${eyeC}"/><circle cx="42" cy="45" r="1" fill="#fff"/><circle cx="62" cy="45" r="1" fill="#fff"/>`,
      wink: `<circle cx="40" cy="46" r="3.2" fill="${eyeC}"/><path d="M55.5 47.5 Q60 41.5 64.5 47.5" fill="none" stroke="${eyeC}" stroke-width="2.6" stroke-linecap="round"/>`,
    };
    s += E[a.eyes] || E.dot;
    const M = {
      smile: `<path d="M42 58 Q50 66 58 58" fill="none" stroke="#7a2e2e" stroke-width="2.6" stroke-linecap="round"/>`,
      open: `<path d="M41 57 Q50 71 59 57Z" fill="#7a1f2b"/><path d="M44 62 Q50 66 56 62" fill="#ff8da1"/>`,
      flat: `<path d="M43 61 H57" stroke="#7a2e2e" stroke-width="2.6" stroke-linecap="round"/>`,
      tongue: `<path d="M42 58 Q50 66 58 58" fill="none" stroke="#7a2e2e" stroke-width="2.6" stroke-linecap="round"/><path d="M50 62.5 Q50 70 55 68.5 Q57 64 55 61Z" fill="#ff6b81"/>`,
      o: `<ellipse cx="50" cy="61" rx="3.2" ry="4" fill="#7a1f2b"/>`,
    };
    s += M[a.mouth] || M.smile;
    s += iFace;
    // 앞머리
    const H = {
      short: `<path d="M25 48 C20 2 80 2 75 48 C68 36 58 31 50 31 C42 31 32 36 25 48Z" fill="${hc}"/>`,
      spiky: `<path d="M26 46 L24 28 L34 34 L38 18 L46 30 L52 14 L58 30 L66 18 L68 34 L76 28 L74 46 C68 38 58 33 50 33 C42 33 32 38 26 46Z" fill="${hc}"/>`,
      long: `<path d="M25 52 C19 2 81 2 75 52 C70 38 62 31 50 31 C38 31 30 38 25 52Z" fill="${hc}"/>`,
      bun: `<path d="M25 48 C20 2 80 2 75 48 C68 36 58 31 50 31 C42 31 32 36 25 48Z" fill="${hc}"/>`,
      curly: `<g fill="${hc}"><circle cx="30" cy="34" r="9"/><circle cx="42" cy="26" r="9"/><circle cx="55" cy="25" r="9"/><circle cx="68" cy="33" r="9"/><circle cx="24" cy="44" r="6"/><circle cx="76" cy="44" r="6"/></g>`,
    };
    // 모자를 쓰면 머리카락이 머리 모양 밖으로 삐져나오지 않게 잘라요
    if (hairK !== 'none') s += hasHat ? `<defs><clipPath id="pn-hc"><ellipse cx="50" cy="47" rx="27" ry="29"/></clipPath></defs><g clip-path="url(#pn-hc)">${H[hairK] || ''}</g>` : H[hairK] || '';
    s += iHair;
    // 모자
    const hcol = a.hatColor;
    const T = {
      cap: `<path d="M24 38 C26 10 74 10 76 38 Z" fill="${hcol}"/><path d="M66 34 H93 Q93 42 66 41Z" fill="${hcol}"/><path d="M66 34 H93 Q93 42 66 41Z" fill="${dark}"/>`,
      beanie: `<path d="M24 38 C24 10 76 10 76 38 Z" fill="${hcol}"/><rect x="22" y="33" width="56" height="8" rx="4" fill="${dark}"/><circle cx="50" cy="11" r="5" fill="${hcol}"/>`,
      headband: `<path d="M24 36 Q50 24 76 36 L76 42 Q50 30 24 42Z" fill="${hcol}"/>`,
      crown: `<path d="M28 30 L30 10 L40 20 L50 6 L60 20 L70 10 L72 30 Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.5" stroke-linejoin="round"/><circle cx="50" cy="22" r="2.4" fill="#ef4444"/>`,
      wizard: `<path d="M26 34 L50 -4 L74 34 Z" fill="#6d28d9"/><rect x="22" y="31" width="56" height="7" rx="3.5" fill="#4c1d95"/><path d="M48 14 l2 4 4 .5 -3 3 .8 4 -3.8 -2 -3.8 2 .8 -4 -3 -3 4 -.5Z" fill="#fde047"/>`,
    };
    if (a.hat !== 'none' && !iHat) s += T[a.hat] || '';
    s += iHat;
    // 액세서리
    const C = {
      glasses: `<g fill="#bfdbfe" fill-opacity=".35" stroke="#334155" stroke-width="2"><circle cx="40" cy="46" r="7.5"/><circle cx="60" cy="46" r="7.5"/></g><path d="M47.5 46 H52.5" stroke="#334155" stroke-width="2"/>`,
      shades: `<g fill="#111827"><rect x="31" y="40" width="18" height="11" rx="4"/><rect x="51" y="40" width="18" height="11" rx="4"/></g><path d="M49 44 H51" stroke="#111827" stroke-width="2"/>`,
      headphone: `<path d="M24 50 C22 14 78 14 76 50" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/><rect x="19" y="42" width="9" height="16" rx="4" fill="#ef4444"/><rect x="72" y="42" width="9" height="16" rx="4" fill="#ef4444"/>`,
      bow: `<path d="M50 70 L38 63 V77 Z M50 70 L62 63 V77 Z" fill="#ec4899"/><circle cx="50" cy="70" r="3.4" fill="#be185d"/>`,
    };
    if (a.acc !== 'none' && !iFace) s += C[a.acc] || '';
    s += IT(a, 'deco');
    return `<svg class="avsvg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="캐릭터">${s}</svg>`;
  }
  return { avatarSvg, normAv, loadItems };
})
;
