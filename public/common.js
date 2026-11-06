const $ = (q, r = document) => r.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rwf = n => 'RWF ' + Number(n || 0).toLocaleString('en-US');

const FLOW = {
  'cold-solutions': ['Deposit pending verification', 'Deposit paid', 'Farmer confirmed', 'Harvested', 'Picked up', 'In transit', 'Delivered', 'Completed'],
  'buyer-collects': ['Deposit pending verification', 'Deposit paid', 'Farmer confirmed', 'Harvested', 'Collected by buyer', 'Completed']
};

// Talks to the server. Throws an Error with the server's message if something fails.
async function api(path, o = {}) {
  const r = await fetch('/api/' + path, {
    method: o.method || (o.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  let d = {};
  try { d = await r.json(); } catch (e) { }
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong.'), { status: r.status });
  return d;
}

function toast(msg, bad) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'on' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.className = '', 3200);
}

// The delivery timeline for an order
function timeline(m) {
  if (m.status === 'Cancelled')
    return `<span class="badge no">Cancelled${m.depositOutcome ? ' · deposit: ' + esc(m.depositOutcome.toLowerCase()) : ''}</span>`;
  const f = FLOW[m.transport] || FLOW['cold-solutions'], i = f.indexOf(m.status);
  return `<div class="tl">${f.map((s, k) => `<div class="${k <= i ? 'd' : ''} ${k === i ? 'c' : ''}"><i></i>${s}</div>`).join('')}</div>`;
}

const historyHtml = m => `<details class="hist"><summary>History</summary>${(m.history || []).map(e =>
  `<div>${new Date(e.at).toLocaleString()} · ${esc(e.status)}${e.kg ? ' · ' + esc(e.kg) + ' kg' : ''}${e.note ? ' · ' + esc(e.note) : ''}</div>`).join('')}</details>`;

// A small pop-up form. Returns the typed values, or null if cancelled.
function ask(title, fields, okText = 'Save') {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<form class="card"><h3>${esc(title)}</h3>${fields.map(f => `<label>${esc(f.label)}</label>` + (f.options
      ? `<select name="${f.name}">${f.options.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`
      : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}>`)).join('')}
      <div class="actions"><button class="btn">${esc(okText)}</button><button type="button" class="btn ghost">Cancel</button></div></form>`;
    document.body.appendChild(m);
    const form = m.querySelector('form');
    form.onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(form)); m.remove(); resolve(v); };
    m.querySelector('.ghost').onclick = () => { m.remove(); resolve(null); };
  });
}

// Builds the header and footer, checks who is signed in, and redirects if the page needs a role.
async function boot(roles) {
  let me = null, down = false;
  try { me = (await api('me')).user; } catch (e) { down = true; }
  const here = location.pathname.split('/').pop() || 'index.html';
  if (roles && !down && (!me || !roles.includes(me.role))) {
    location.replace('login.html?next=' + encodeURIComponent(here));
    return null;
  }
  const links = [['index.html', 'Home'], ['buyer.html', 'Marketplace'], ['farmer.html', 'Farmers'], ['radar.html', 'Glut Radar']];
  if (me && me.role === 'ops') links.push(['ops.html', 'Operations']);
  if (me && me.role === 'coldroom') links.push(['coldroom.html', 'Cold room']);
  if (me && me.role === 'agent') links.push(['agent.html', 'Quality checks']);
  if (me && me.role === 'farmer') links.push(['profile.html', 'My profile']);

  $('#hdr').innerHTML = `<header><div class="wrap bar"><a class="logo" href="index.html"><i>K</i>KUZA</a>
    <nav>${links.map(l => `<a href="${l[0]}" class="${l[0] === here ? 'on' : ''}">${l[1]}</a>`).join('')}</nav>
    <div class="who">${me ? `<span>${esc(me.name)}</span><button class="btn ghost sm" id="out">Log out</button>`
      : `<a class="btn ghost sm" href="login.html">Log in</a><a class="btn sm" href="login.html?mode=register">Get started</a>`}</div></div></header>`;

  $('#ftr').innerHTML = `<footer><div class="wrap row"><span><b>KUZA</b> &nbsp; Fresh tomatoes, planned before harvest. Rwanda.</span><span>© 2026 KUZA</span></div></footer>`;

  if (down) {
    const n = document.createElement('div');
    n.className = 'wrap note bad';
    n.innerHTML = '<b>Cannot reach the KUZA server.</b> Open this site through the running server (http://localhost:3000), not by double-clicking the HTML file, and check that <code>npm start</code> is still running.';
    $('#hdr').after(n);
  }
  const out = $('#out');
  if (out) out.onclick = async () => { await api('logout', { body: {} }); location.href = 'index.html'; };

  // Apply saved language preferences upon boot
  const savedLang = localStorage.getItem("kuza_lang") || "en";
  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = savedLang;
  setLanguage(savedLang);

  return me;
}

// ---------- Added: approval notice, photo resizing, location pickers ----------
function statusBanner(me) {
  if (!me || me.role === 'ops' || me.status === 'approved') return '';
  return me.status === 'rejected'
    ? `<div class="note bad"><b>Your application was not approved.</b> ${esc(me.rejectionReason || '')} Please contact KUZA if you think this is a mistake.</div>`
    : '<div class="note"><b>Your account is under review.</b> KUZA will check your details and confirm before you can start transacting. You can browse in the meantime.</div>';
}

// Shrinks a photo in the browser so uploads stay small.
function shrink(file, max = 1200, maxBytes = 650 * 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let side = max, out = '';
      for (let tries = 0; tries < 8; tries++) {
        const k = Math.min(1, side / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.8, 0.65, 0.5]) {
          out = c.toDataURL('image/jpeg', q);
          if (out.length * 0.75 <= maxBytes) return resolve(out);
        }
        side = Math.round(side * 0.75);
      }
      reject(new Error('This photo is too large even after shrinking. Please choose a smaller one.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('One of the files is not a readable image.')); };
    img.src = url;
  });
}

// Province > district > sector (> cell) pickers.
async function initPlaces(ids) {
  const places = await (await fetch('rwanda.json')).json();
  const el = k => ids[k] && document.getElementById(ids[k]);
  const fill = (e, items, ph) => e.innerHTML = `<option value="">${ph}</option>` + items.map(i => `<option>${esc(i)}</option>`).join('');
  const list = (e, items) => e && (e.innerHTML = items.map(i => `<option value="${esc(i)}">`).join(''));
  const sectors = () => (places[el('prov').value] || {})[el('dist').value] || {};
  fill(el('prov'), Object.keys(places), 'Select province');
  fill(el('dist'), [], 'Select province first');
  el('prov').onchange = () => {
    fill(el('dist'), Object.keys(places[el('prov').value] || {}), 'Select district');
    el('sector').value = ''; if (el('cell')) el('cell').value = '';
    list(el('sectorList'), []); list(el('cellList'), []);
  };
  el('dist').onchange = () => {
    el('sector').value = ''; if (el('cell')) el('cell').value = '';
    list(el('sectorList'), Object.keys(sectors())); list(el('cellList'), []);
  };
  el('sector').oninput = () => list(el('cellList'), sectors()[el('sector').value] || []);
}

// ================= BILINGUAL TRANSLATIONS =================
const translations = {
  en: {
    title: "KUZA – Fresh Produce. Reliable Buyers. Smarter Delivery.",
    pill: "Tomatoes first, in Rwanda",
    heroTitle: "Fresh Produce. Reliable Buyers. Smarter Delivery.",
    heroLead: "KUZA connects farmers with businesses that need fresh produce, before harvest, and coordinates the storage and transport to get it there.",
    btnTomatoes: "Find tomatoes",
    btnFarmer: "I am a farmer",
    howWorksTitle: "How KUZA works",
    howWorksSub: "Tomatoes spoil fast. KUZA finds the buyer while the crop is still growing.",
    step1Title: "Farmers forecast",
    step1Desc: "Tell us how much you expect, where, and when it will be ready.",
    step2Title: "Buyers commit",
    step2Desc: "Businesses reserve a quantity at an agreed price with a deposit.",
    step3Title: "Farmers confirm",
    step3Desc: "The day before harvest, the final quantity is confirmed.",
    step4Title: "KUZA delivers",
    step4Desc: "Storage and transport are coordinated, and every handover is recorded.",
    chatHeader: "KUZA Assistant",
    chatWelcome: "Hello! How can I help you with KUZA today?",
    chatSend: "Send",
    chatBtnText: "AI Assistant"
  },
  rw: {
    title: "KUZA – Ibicuruzwa bishya. Abaguzi bizewe. Gutanga byoroshye.",
    pill: "Inyanya zibanza, mu Rwanda",
    heroTitle: "Ibicuruzwa bishya. Abaguzi bizewe. Gutanga byoroshye.",
    heroLead: "KUZA ihuza abahinzi n'abashoramari bakeneye umusaruro mushya mbere y'isarura, ikanateganya aho ubikwa n'uko utwarwa.",
    btnTomatoes: "Shakisha inyanya",
    btnFarmer: "Ndi umuhinzi",
    howWorksTitle: "Uko KUZA ikora",
    howWorksSub: "Inyanya zirabora vuba. KUZA ishaka umuguzi igihe igihingwa kigikura.",
    step1Title: "Abahinzi batangaza umusaruro",
    step1Desc: "Tubwire uwo witeze, aho uherereye n'igihe uzaba witeguye.",
    step2Title: "Abaguzi biyemeza",
    step2Desc: "Abashoramari babika umubare ku giciro cyumvikanyweho n'ingwate.",
    step3Title: "Abahinzi bemeza",
    step3Desc: "Umunsi umwe mbere y'isarura, umubare nyawo wemejwa.",
    step4Title: "KUZA iratanga",
    step4Desc: "Aho kubika n'ubwikorezi biteganywa neza, kandi buri igikorwa cyose kirandikwa.",
    chatHeader: "Umujyanama wa KUZA",
    chatWelcome: "Mwaramutse! Nabafasha iki kuri KUZA uyu munsi?",
    chatSend: "Ohereza",
    chatBtnText: "Umujyanama AI"
  }
};

function setLanguage(lang) {
  localStorage.setItem("kuza_lang", lang);
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (translations[lang] && translations[lang][key]) {
      el.innerText = translations[lang][key];
    }
  });
}

// ================= AI CHATBOT INTERACTION =================
function toggleChat() {
  const chatBox = document.getElementById("ai-chat-box");
  if (!chatBox) return;
  chatBox.style.display = (chatBox.style.display === "flex") ? "none" : "flex";
}

function handleChatKey(event) {
  if (event.key === "Enter") {
    sendChat();
  }
}

async function sendChat() {
  const inputField = document.getElementById("ai-chat-input");
  const messagesArea = document.getElementById("ai-chat-messages");
  if (!inputField || !messagesArea) return;

  const message = inputField.value.trim();
  if (!message) return;

  // Append user message
  const userMsgDiv = document.createElement("div");
  userMsgDiv.className = "chat-msg user";
  userMsgDiv.innerText = message;
  messagesArea.appendChild(userMsgDiv);

  inputField.value = "";
  messagesArea.scrollTop = messagesArea.scrollHeight;

  // Append loading placeholder
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "chat-msg ai";
  loadingDiv.innerText = "...";
  messagesArea.appendChild(loadingDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;

  try {
    const currentLang = localStorage.getItem("kuza_lang") || "en";
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, lang: currentLang })
    });
    const data = await response.json();
    loadingDiv.innerText = data.reply || "I am here to assist you!";
  } catch (err) {
    loadingDiv.innerText = "Sorry, connection error.";
  }
  messagesArea.scrollTop = messagesArea.scrollHeight;
}