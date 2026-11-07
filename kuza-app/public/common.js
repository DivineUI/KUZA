const $ = (q, r = document) => r.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rwf = n => 'RWF ' + Number(n || 0).toLocaleString('en-US');

const FLOW = {
  'cold-solutions': ['Deposit pending verification', 'Deposit paid', 'Farmer confirmed', 'Harvested', 'Picked up', 'In transit', 'Delivered', 'Completed'],
  'buyer-collects': ['Deposit pending verification', 'Deposit paid', 'Farmer confirmed', 'Harvested', 'Collected by buyer', 'Completed']
};

// Talks to the server. Throws an Error with the server's message if something fails.
async function api(path, o = {}) {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), o.timeout || 25000);
  try {
    const r = await fetch('/api/' + path, {
      method: o.method || (o.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: o.body ? JSON.stringify(o.body) : undefined,
      signal: ctl.signal
    });
    const type = r.headers.get('content-type') || '';
    let d = {};
    if (type.includes('application/json')) {
      try { d = await r.json(); } catch (e) { d = {}; }
    } else {
      const raw = await r.text().catch(() => '');
      d = { error: raw.slice(0, 180) || `The server returned an unexpected response (${r.status}).` };
    }
    if (!r.ok) throw Object.assign(new Error(d.error || `Request failed (${r.status}).`), { status: r.status });
    return d;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('The assistant is taking too long to respond. Please try again.'), { code: 'TIMEOUT' });
    if (!err.status && !err.code) err.code = 'NETWORK';
    throw err;
  } finally { clearTimeout(timeout); }
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
  kuzaInitUi();   // language switch, chat bubble, translation
  return me;
}

// ---------- Added: approval notice, photo resizing, location pickers ----------
function statusBanner(me) {
  if (!me || me.role === 'ops' || me.status === 'approved') return '';
  return me.status === 'rejected'
    ? `<div class="note bad"><b>Your application was not approved.</b> ${esc(me.rejectionReason || '')} Please contact KUZA if you think this is a mistake.</div>`
    : '<div class="note"><b>Your account is under review.</b> KUZA will check your details and confirm before you can start transacting. You can browse in the meantime.</div>';
}

// Shrinks a photo in the browser so uploads stay small. Returns a JPEG data URL under maxBytes
// (the server rejects anything over 700 KB, so we stay a little below that).
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
          if (out.length * 0.75 <= maxBytes) return resolve(out);   // base64 is ~4/3 the size of the bytes
        }
        side = Math.round(side * 0.75);
      }
      reject(new Error('This photo is too large even after shrinking. Please choose a smaller one.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('One of the files is not a readable image.')); };
    img.src = url;
  });
}

// Province > district > sector (> cell) pickers. Pass the element ids; cell ids are optional.
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

// =====================================================================================
// Language switcher (English / Kinyarwanda) and the chat assistant
// How translation works: every piece of text on the page is looked up in the RW dictionary
// below (English text -> Kinyarwanda). Text that is not in the dictionary simply stays in English.
// To translate more, add a line to RW. It also works on text that the page creates later.
// =====================================================================================
const RW = {
  // header, footer, buttons
  "Home": "Ahabanza", "Marketplace": "Isoko", "Farmers": "Abahinzi", "Operations": "Imikorere", "Cold room": "Icyumba gikonjesha",
  "Log in": "Injira", "Get started": "Tangira", "Log out": "Sohoka",
  "Fresh tomatoes, planned before harvest. Rwanda.": "Inyanya nshya, zateguwe mbere y'isarura. u Rwanda.",
  "Save": "Bika", "Cancel": "Bireke", "Confirm": "Emeza", "Send": "Ohereza", "Other": "Ibindi", "Name": "Izina", "Location": "Aho uherereye",
  // landing page
  "KUZA – Fresh Produce. Reliable Buyers. Smarter Delivery.": "KUZA – Umusaruro mushya. Abaguzi bizewe. Ubwikorezi bunoze.",
  "Tomatoes first, in Rwanda": "Dutangiriye ku nyanya, mu Rwanda",
  "Fresh Produce. Reliable Buyers. Smarter Delivery.": "Umusaruro mushya. Abaguzi bizewe. Ubwikorezi bunoze.",
  "KUZA connects farmers with businesses that need fresh produce, before harvest, and coordinates the storage and transport to get it there.": "KUZA ihuza abahinzi n'ubucuruzi bukeneye umusaruro mushya, mbere y'isarura, ikanatunganya ububiko n'ubwikorezi kugira ngo bugereyo.",
  "Find tomatoes": "Shaka inyanya", "I am a farmer": "Ndi umuhinzi", "How KUZA works": "Uko KUZA ikora",
  "Tomatoes spoil fast. KUZA finds the buyer while the crop is still growing.": "Inyanya zangirika vuba. KUZA ishaka umuguzi igihingwa kikiri mu murima.",
  "Farmers forecast": "Abahinzi bagereranya umusaruro", "Tell us how much you expect, where, and when it will be ready.": "Tubwire ingano witeze, aho uri, n'igihe uzaba witeguye.",
  "Buyers commit": "Abaguzi biyemeza", "Businesses reserve a quantity at an agreed price with a deposit.": "Ubucuruzi buhitamo ingano ku giciro bumvikanyeho, butanze avansi.",
  "Farmers confirm": "Abahinzi bemeza", "The day before harvest, the final quantity is confirmed.": "Umunsi umwe mbere y'isarura, ingano ya nyuma iremezwa.",
  "KUZA delivers": "KUZA irageza", "Storage and transport are coordinated, and every handover is recorded.": "Ububiko n'ubwikorezi biratunganywa, kandi buri gutanga no kwakira birandikwa.",
  "For farmers": "Ku bahinzi", "Know where your tomatoes are going before you pick them.": "Menya aho inyanya zawe zigiye mbere yo kuzisarura.",
  "Forecast your harvest by province, district, sector and cell": "Gereranya umusaruro wawe ugaragaza intara, akarere, umurenge n'akagari",
  "Buyers reserve your tomatoes ahead of time": "Abaguzi bahitamo inyanya zawe hakiri kare",
  "Confirm your final quantity one day before harvest": "Emeza ingano yawe ya nyuma umunsi umwe mbere y'isarura",
  "Less produce left in the field with nowhere to go": "Umusaruro muke usigara mu murima nta hantu ujya",
  "Forecast a harvest": "Gereranya isarura", "Storage and transport, handled": "Ububiko n'ubwikorezi, byose bitunganyijwe",
  "If tomatoes cannot wait on the farm, KUZA arranges temporary cold storage. Buyers can have transport coordinated for them, or collect the produce themselves.": "Niba inyanya zidashobora gutegereza mu murima, KUZA itegura ububiko bukonje bw'agateganyo. Abaguzi bashobora gutunganyirizwa ubwikorezi, cyangwa bakaza kwitwarira umusaruro.",
  "Temporary storage when a harvest is ready before delivery": "Ububiko bw'agateganyo iyo isarura ritegereje kugezwa ku muguzi",
  "Transport coordinated by KUZA, priced separately from the produce": "Ubwikorezi butunganywa na KUZA, igiciro cyabwo gitandukanye n'icy'umusaruro",
  "A clear delivery timeline for farmer, buyer and KUZA": "Uko gutanga bigenda bigaragara neza ku muhinzi, ku muguzi no kuri KUZA",
  "Quantities and handovers recorded at every stage": "Ingano no guhererekanya byandikwa kuri buri cyiciro",
  "For buyers": "Ku baguzi", "Restaurants, hotels, retailers and traders get a reliable supply they can plan around.": "Resitora, amahoteli, abacuruzi bato n'abacuruzi bahabwa umusaruro wizewe bashobora kwiteganyirizaho.",
  "See upcoming harvests by location, quality and date": "Reba amasarura ari imbere ukurikije aho ari, ubwiza n'itariki",
  "Reserve the quantity you need with a deposit": "Hitamo ingano ukeneye utanze avansi",
  "Track your order from confirmation to delivery": "Kurikirana komande yawe uhereye ku iyemezwa kugeza ku igezwa",
  "Confirm receipt to close the order": "Emeza ko wakiriye kugira ngo komande irangire",
  "Browse harvests": "Reba amasarura", "Fresh produce, planned ahead": "Umusaruro mushya, uteguwe hakiri kare",
  "Join KUZA as a farmer or a buyer and put every harvest on the right truck.": "Iyunge na KUZA nk'umuhinzi cyangwa umuguzi, buri sarura rigere aho rigomba kujya.",
  "Create an account": "Fungura konti",
  "Ripe tomatoes on the vine": "Inyanya zeze ku gihingwa", "A farmer holding freshly picked tomatoes": "Umuhinzi ufite inyanya ziherutse gusarurwa",
  "A clean cold storage room with shelving": "Icyumba gikonjesha gisukuye gifite amaterasi", "Crates of fresh red tomatoes": "Amakarito y'inyanya nshya zitukura",
  // sign in and create account
  "KUZA – Sign in": "KUZA – Injira", "Fresh tomatoes, planned before harvest.": "Inyanya nshya, zateguwe mbere y'isarura.",
  "Sign in to forecast a harvest, reserve produce, or follow a delivery.": "Injira ugereranye isarura, uhitemo umusaruro, cyangwa ukurikirane igezwa.",
  "Sign in": "Injira", "Create account": "Fungura konti",
  "Creating an account is free. KUZA reviews every new account before it can start transacting.": "Gufungura konti ni ubuntu. KUZA isuzuma buri konti nshya mbere y'uko itangira gukora ubucuruzi.",
  "I am a": "Ndi", "Farmer": "Umuhinzi", "Business": "Ubucuruzi", "Business name": "Izina ry'ubucuruzi", "Your full name": "Amazina yawe yose",
  "Type of business": "Ubwoko bw'ubucuruzi", "Restaurant": "Resitora", "Hotel": "Hoteli", "Retailer or supermarket": "Ucuruza ibicuruzwa bito cyangwa supamaketi",
  "Market trader": "Umucuruzi wo mu isoko", "Processor": "Utunganya umusaruro", "Contact person": "Umuntu wo kuvugisha", "Website (if you have one)": "Urubuga (niba ururi)",
  "Province": "Intara", "District": "Akarere", "Sector": "Umurenge", "Cell": "Akagari", "Street or area (business address)": "Umuhanda cyangwa agace (aho ubucuruzi buherereye)",
  "Cooperative (if you belong to one)": "Koperative (niba uri muri imwe)", "Estimated tomato harvest per season (kg)": "Umusaruro w'inyanya witeze kuri buri gihembwe (kg)",
  "Fill in every season you grow tomatoes. Leave the others empty.": "Uzuza ibihembwe byose uhingamo inyanya. Ibindi ubisige ubusa.",
  "Photos of your farm (1 to 4)": "Amafoto y'umurima wawe (1 kugeza kuri 4)", "Phone number": "Nimero ya telefoni", "Send me updates by": "Mbwira amakuru nkoresheje",
  "Email": "Imeri", "Phone (SMS)": "Telefoni (SMS)", "Password": "Ijambobanga", "Pick or type": "Hitamo cyangwa wandike",
  "Season A": "Igihembwe A", "Season B": "Igihembwe B", "Season C": "Igihembwe C",
  "Could not load the location list. Sign in still works; reload before creating an account.": "Ntibishobotse kubona urutonde rw'ahantu. Kwinjira biracyakora; ongera ufungure urupapuro mbere yo gufungura konti.",
  "Select province": "Hitamo intara", "Select province first": "Banza uhitemo intara", "Select district": "Hitamo akarere", "All provinces": "Intara zose", "All districts": "Uturere twose",
  "Kigali City": "Umujyi wa Kigali", "Northern Province": "Intara y'Amajyaruguru", "Southern Province": "Intara y'Amajyepfo", "Eastern Province": "Intara y'Iburasirazuba", "Western Province": "Intara y'Iburengerazuba",
  // farmer dashboard and profile
  "KUZA – Farmer dashboard": "KUZA – Ikibaho cy'umuhinzi", "Your farm": "Umurima wawe",
  "Forecast your tomatoes, then confirm your final quantity before harvest.": "Gereranya inyanya zawe, hanyuma wemeze ingano ya nyuma mbere y'isarura.",
  "Expected harvest (kg)": "Umusaruro witezwe (kg)", "Expected harvest date": "Itariki y'isarura ryitezwe", "Expected quality": "Ubwiza bwitezwe",
  "Grade A": "Icyiciro A", "Grade B": "Icyiciro B", "Your asking price per kg (RWF, optional)": "Igiciro wifuza ku kilo (RWF, si itegeko)",
  "Save forecast": "Bika igereranya", "Buyer orders": "Komande z'abaguzi", "Your forecasts": "Ibigereranyo byawe",
  "Pick or type your sector": "Hitamo cyangwa wandike umurenge wawe", "Pick or type your cell": "Hitamo cyangwa wandike akagari kawe",
  "Waiting for KUZA to verify the buyer's deposit.": "Dutegereje ko KUZA igenzura avansi y'umuguzi.", "Confirm quantity": "Emeza ingano", "Cancel order": "Hagarika komande",
  "No orders yet. Buyers will reserve your tomatoes once you add a forecast.": "Nta komande ziraboneka. Abaguzi bazahitamo inyanya zawe umaze kongeramo igereranya.",
  "Harvested, no buyer yet? Store in a cold room": "Wasaruye nta muguzi urabona? Bika mu cyumba gikonjesha",
  "No forecasts yet. Add your first one on the left.": "Nta bigereranyo urashyiramo. Shyiramo icya mbere ibumoso.",
  "Quantity confirmed.": "Ingano yemejwe.", "Order cancelled.": "Komande yahagaritswe.", "Request sent. KUZA will arrange cold-room space.": "Ubusabe bwoherejwe. KUZA izategura umwanya mu cyumba gikonjesha.",
  "Forecast saved.": "Igereranya ryabitswe.", "Kilograms you can supply": "Ibilo ushobora gutanga", "Reason (optional)": "Impamvu (si itegeko)",
  "Forecasts": "Ibigereranyo", "Expected harvest": "Umusaruro witezwe", "Reserved by buyers": "Byahiswemo n'abaguzi", "Waiting for your confirmation": "Dutegereje iyemezwa ryawe",
  "Your trust score": "Amanota y'icyizere cyawe", "Waiting for a certified agent to check quality": "Dutegereje ko umukozi wemewe agenzura ubwiza", "In cold room": "Mu cyumba gikonjesha",
  "Confirm your final quantity": "Emeza ingano yawe ya nyuma", "Cancel this order?": "Wahagarika iyi komande?", "· you receive": "· uhabwa",
  "KUZA – My profile": "KUZA – Umwirondoro wanjye", "My profile": "Umwirondoro wanjye",
  "Keep your harvest estimates up to date so buyers and KUZA can plan.": "Gumana ibigereranyo by'umusaruro bigezweho kugira ngo abaguzi na KUZA bashobore gutegura.",
  "Save changes": "Bika impinduka", "Profile saved.": "Umwirondoro wabitswe.",
  // marketplace
  "KUZA – Marketplace": "KUZA – Isoko", "Tomato harvests coming soon": "Amasarura y'inyanya ari hafi",
  "Reserve a quantity before harvest. A deposit secures your order.": "Hitamo ingano mbere y'isarura. Avansi ni yo ihamya komande yawe.",
  "Available harvests": "Amasarura ahari", "My orders": "Komande zanjye", "Filter by province": "Shungura ukurikije intara",
  "Checked by certified agent": "Byagenzuwe n'umukozi wemewe", "Quality not yet checked": "Ubwiza ntiburagenzurwa", "Ready now · in cold room": "Biri tayari · mu cyumba gikonjesha",
  "per kg asking": "ku kilo, igiciro cyifuzwa", "No harvests available right now. Please check back soon.": "Nta masarura ahari ubu. Ongera urebe vuba.",
  "Reserve tomatoes": "Hitamo inyanya", "Quantity (kg)": "Ingano (kg)", "Agreed price per kg (RWF)": "Igiciro cyumvikanyweho ku kilo (RWF)", "Transport": "Ubwikorezi",
  "KUZA arranges transport": "KUZA itegura ubwikorezi", "· asking": "· igiciro cyifuzwa", "· storage": "· ububiko", "per kg": "kuri kilo", "I will collect it myself": "Nzaza kwitwarira", "Step 1.": "Intambwe ya 1.",
  "Send the deposit by Mobile Money to": "Ohereza avansi ukoresheje Mobile Money kuri", "non-refundable": "idasubizwa", "if you cancel.": "niba uhagaritse komande.",
  "Step 2. Upload your payment proof (screenshot or photo)": "Intambwe ya 2. Shyiraho gihamya yo kwishyura (ifoto cyangwa screenshot)",
  "Place order": "Tanga komande", "Produce total": "Igiteranyo cy'umusaruro", "Transport fee": "Igiciro cy'ubwikorezi",
  "Confirm produce received & payment": "Emeza ko wakiriye umusaruro kandi wishyuye", "You have no orders yet.": "Nta komande uragira.",
  "Order placed. KUZA will verify your payment proof.": "Komande yatanzwe. KUZA izagenzura gihamya yawe yo kwishyura.", "Thank you. Your order is complete.": "Murakoze. Komande yawe yarangiye.",
  "In cold storage": "Mu bubiko bukonje", "Stored at": "Bibitse kuri", "Sign in as a buyer to order": "Injira nk'umuguzi kugira ngo utumize",
  "Available once approved": "Bizaboneka umaze kwemerwa", "Confirmed by KUZA": "Byemejwe na KUZA", "KUZA transport": "Ubwikorezi bwa KUZA",
  // glut radar
  "KUZA – Glut Radar": "KUZA – Radari y'umusaruro mwinshi", "Glut Radar": "Radari y'umusaruro mwinshi",
  "Tomato prices crash when everyone harvests in the same week. KUZA sees forecasts weeks ahead, so we can spot a glut early and steer farmers away from it.": "Ibiciro by'inyanya bigwa iyo buri wese asarura mu cyumweru kimwe. KUZA ibona ibigereranyo hakiri kare, bityo ishobora kubona umusaruro mwinshi hakiri kare ikayobora abahinzi.",
  "Forecast harvest by week": "Isarura ryitezwe ukurikije icyumweru",
  "Light bar = forecast kg, dark = already reserved by buyers. Amber = glut week.": "Umurongo woroshye = ibilo byitezwe, uwijimye = ibimaze guhitwamo n'abaguzi. Umuhondo = icyumweru cy'umusaruro mwinshi.",
  "Harvest-timing tip:": "Inama ku gihe cy'isarura:", "No upcoming forecasts yet.": "Nta bigereranyo biri imbere biraboneka.", "Farmers forecasting": "Abahinzi bagereranya",
  "Forecast": "Igereranya", "Kept fresh in cold rooms": "Bibitswe bishya mu byumba bikonjesha", "Batches quality-checked": "Ibyagenzuwe ubwiza",
  // order stages and statuses
  "Deposit pending verification": "Avansi itegereje kugenzurwa", "Deposit paid": "Avansi yishyuwe", "Farmer confirmed": "Umuhinzi yemeje", "Harvested": "Byasaruwe",
  "Picked up": "Byafashwe", "In transit": "Biri mu nzira", "Delivered": "Byagejejwe", "Collected by buyer": "Byatwawe n'umuguzi", "Completed": "Byarangiye",
  "Cancelled": "Byahagaritswe", "Rejected": "Byanzwe", "Approved": "Byemewe", "Pending": "Bitegereje",
  // messages from the server
  "Please sign in.": "Nyabuneka winjire.", "Incorrect email or password.": "Imeri cyangwa ijambobanga si byo.",
  "An account with this email already exists.": "Konti ifite iyi meri irahari.", "Please enter a valid email address.": "Nyabuneka andika imeri yemewe.",
  "Password must be at least 8 characters.": "Ijambobanga rigomba kuba nibura inyuguti 8.", "Please enter your name.": "Nyabuneka andika izina ryawe.",
  "Please enter your business name.": "Nyabuneka andika izina ry'ubucuruzi.", "Please enter a valid phone number.": "Nyabuneka andika nimero ya telefoni yemewe.",
  "Please choose the province and district.": "Nyabuneka hitamo intara n'akarere.", "Please add 1 to 4 clear photos of your farm.": "Nyabuneka shyiraho amafoto 1 kugeza kuri 4 asobanutse y'umurima wawe.",
  "Your account is waiting for KUZA approval. We will confirm before you can start transacting.": "Konti yawe itegereje kwemezwa na KUZA. Tuzakwemeza mbere y'uko utangira gukora.",
  "Your account is under review.": "Konti yawe iri gusuzumwa.",
  "You are sending messages too fast. Please wait a moment.": "Wohereza ubutumwa vuba cyane. Tegereza akanya gato.",
  // chat assistant
  "KUZA Assistant": "Umufasha wa KUZA", "Ask about KUZA": "Baza ibya KUZA", "Open the KUZA assistant": "Fungura umufasha wa KUZA", "Close": "Funga",
  "Hello! I can answer questions about how KUZA works. What would you like to know?": "Muraho! Nshobora gusubiza ibibazo ku buryo KUZA ikora. Wifuza kumenya iki?",
  "Sorry, the assistant is not available right now. Please try again in a moment.": "Mbabarira, umufasha ntabonetse ubu. Ongera ugerageze nyuma y'akanya."
 };

// Additional translations used by dashboard pages, dialogs and dynamically-created cards.
// Keep this dictionary as the single source of truth for the whole site.
Object.assign(RW, {
  "KUZA – Quality checks": "KUZA – Igenzura ry'ubwiza",
  "KUZA – Cold room": "KUZA – Icyumba gikonjesha",
  "KUZA – Operations": "KUZA – Imikorere",
  "Quality checks": "Igenzura ry'ubwiza",
  "Visit the farm or cold room, measure the real quantity and grade, and record it. Buyers see your result.": "Sura umurima cyangwa icyumba gikonjesha, upime ingano n'ubwiza, hanyuma ubyandike. Abaguzi bazabona ibisubizo.",
  "Rejected (not sellable)": "Byanzwe (ntibigurishwa)", "Kilograms measured": "Ibiro byapimwe", "Note (optional)": "Icyitonderwa (si itegeko)", "Save check": "Bika igenzura",
  "Record check": "Andika igenzura", "Nothing waiting for a check.": "Nta kintu gitegereje kugenzurwa.",
  "Record quality check": "Andika igenzura ry'ubwiza", "Check recorded.": "Igenzura ryanditswe.",
  "Cold room requests": "Ubusabe bw'icyumba gikonjesha",
  "Farmers with harvested tomatoes and no buyer yet. Confirm space, and the stock is shown to buyers as ready now.": "Abahinzi basaruye inyanya ariko bakaba batarabona abaguzi. Emeza umwanya, maze umusaruro werekwe abaguzi ko uhari.",
  "No storage requests.": "Nta busabe bw'ububiko buhari.", "Confirm cold-room space": "Emeza umwanya mu cyumba gikonjesha",
  "Cost per kg per day (RWF)": "Igiciro kuri kilo ku munsi (RWF)", "Confirm space": "Emeza umwanya", "Space confirmed.": "Umwanya wemejwe.",
  "Record deposits, arrange storage, and move each delivery forward.": "Andika avansi, utegure ububiko, kandi ukurikirane uko buri komande igezwa.",
  "Orders": "Komande", "Applications": "Ubusabe", "Approved": "Byemewe", "Rejected": "Byanzwe", "Rules and fees": "Amategeko n'amafaranga",
  "Placeholders until your team decides. Changes apply to new orders.": "Ibi ni iby'agateganyo kugeza igihe itsinda rizafatira umwanzuro. Impinduka zizakoreshwa kuri komande nshya.",
  "Buyer deposit (%)": "Avansi y'umuguzi (%)", "KUZA service fee (%)": "Amafaranga ya serivisi ya KUZA (%)",
  "Forecast margin of error (%)": "Ijanisha ry'ikosa mu igereranya (%)", "Save settings": "Bika igenamiterere",
  "Certified agents": "Abakozi bemewe", "Add certified agent": "Ongeraho umukozi wemewe",
  "Agents get their own account and check farm quality.": "Abakozi bahabwa konti zabo kandi bakagenzura ubwiza bw'umusaruro wo mu murima.",
  "Cold rooms": "Ibyumba bikonjesha", "Add cold-room account": "Ongeraho konti y'icyumba gikonjesha",
  "Each cold-room partner (for example Cold Solutions Rwanda) gets its own account to confirm storage requests.": "Buri mufatanyabikorwa w'ububiko bukonje ahabwa konti ye kugira ngo yemeze ubusabe bw'ububiko.",
  "Storage requests": "Ubusabe bw'ububiko", "Awaiting deposit": "Bitegereje avansi", "In progress": "Birakomeje",
  "Completed": "Byarangiye", "No orders yet.": "Nta komande ziraboneka.", "Deposit approved.": "Avansi yemejwe.",
  "Delivery updated.": "Amakuru y'igezwa yavuguruwe.", "Arrange temporary storage": "Tegura ububiko bw'agateganyo",
  "Storage cost (RWF)": "Igiciro cy'ububiko (RWF)", "Storage recorded.": "Ububiko bwanditswe.",
  "Who is cancelling?": "Ni nde uhagaritse?", "The buyer": "Umuguzi", "The farmer": "Umuhinzi",
  "Cancel order": "Hagarika komande", "Order cancelled.": "Komande yahagaritswe.", "Settings saved.": "Igenamiterere ryabitswe.",
  "Farmer": "Umuhinzi", "Business": "Ubucuruzi", "Phone": "Telefoni", "Website": "Urubuga", "Contact person": "Umuntu wo kuvugisha",
  "Location": "Aho uherereye", "Cooperative": "Koperative", "Estimated harvest": "Umusaruro witezwe", "Reason": "Impamvu",
  "Approve": "Emeza", "Approve deposit": "Emeza avansi", "View payment proof": "Reba gihamya yo kwishyura",
  "Farmer confirmed quantity": "Umuhinzi yemeje ingano", "Arrange storage": "Tegura ububiko", "None given": "Nta mpamvu yatanzwe",
  "Reject": "Anga", "Revoke access": "Kuraho uburenganzira", "Account approved.": "Konti yemejwe.",
  "Account updated.": "Konti yavuguruwe.", "Reject or revoke this account?": "Wanga cyangwa ukuraho uburenganzira kuri iyi konti?",
  "Reason (shown to the user)": "Impamvu (izerekanwa uyikoresha)", "No pending accounts.": "Nta konti zitegereje kwemezwa.",
  "No approved accounts.": "Nta konti zemewe.", "No rejected accounts.": "Nta konti zanzwe.",
  "Confirm cold room": "Emeza icyumba gikonjesha", "Cold room confirmed.": "Icyumba gikonjesha cyemejwe.",
  "Facility": "Ikigo cy'ububiko", "Facility name": "Izina ry'ikigo", "Contact person": "Umuntu wo kuvugisha",
  "Temporary password (8+ characters)": "Ijambobanga ry'agateganyo (inyuguti 8 cyangwa zirenga)",
  "Create account": "Fungura konti", "Cold-room account created.": "Konti y'icyumba gikonjesha yafunguwe.",
  "Full name": "Amazina yose", "Create agent": "Fungura konti y'umukozi", "Agent account created.": "Konti y'umukozi yafunguwe.",
  "No agents yet.": "Nta bakozi barashyirwaho.", "No cold-room accounts yet.": "Nta konti z'ibyumba bikonjesha zirashyirwaho.",
  "Confirm your final quantity": "Emeza ingano yawe ya nyuma", "Kilograms confirmed by the farmer": "Ibiro byemejwe n'umuhinzi",
  "Delivered. Waiting for the buyer to confirm receipt and payment.": "Byagejejwe. Dutegereje ko umuguzi yemeza ko yabibonye kandi ko yishyuye.",
  "Your proof of the deposit is waiting for KUZA to verify it.": "Gihamya yawe ya avansi itegereje kugenzurwa na KUZA.",
  "Confirm produce received & payment": "Emeza ko wakiriye umusaruro kandi wishyuye", "Cancel this order?": "Wahagarika iyi komande?",
  "No storage requests yet.": "Nta busabe bw'ububiko buraboneka.", "No harvests available right now. Please check back soon.": "Nta masarura ahari ubu. Ongera urebe nyuma.",
  "No upcoming forecasts yet.": "Nta bigereranyo by'isarura biri imbere.", "No forecasts yet. Add your first one on the left.": "Nta bigereranyo biraboneka. Ongeraho icya mbere ibumoso.",
  "No orders yet. Buyers will reserve your tomatoes once you add a forecast.": "Nta komande ziraboneka. Abaguzi bazahitamo inyanya zawe umaze kongeramo igereranya.",
  "You have no orders yet.": "Nta komande uragira.", "Nothing waiting for a check.": "Nta kintu gitegereje kugenzurwa.",
  "Harvested, no buyer yet? Store in a cold room": "Wasaruye ariko nta muguzi urabona? Bika mu cyumba gikonjesha",
  "Waiting for a certified agent to check quality": "Dutegereje umukozi wemewe kugira ngo agenzure ubwiza",
  "Checked by certified agent": "Byagenzuwe n'umukozi wemewe", "Quality not yet checked": "Ubwiza ntiburagenzurwa",
  "Ready now · in cold room": "Birahari ubu · mu cyumba gikonjesha", "Requested": "Byasabwe", "· glut": "· umusaruro mwinshi", "Available once approved": "Bizaboneka konti imaze kwemezwa",
  "Sign in as a buyer to order": "Injira nk'umuguzi kugira ngo utumize", "I will collect it myself": "Nzaza kwitwarira umusaruro",
  "KUZA arranges transport": "KUZA itegura ubwikorezi", "· asking": "· igiciro cyifuzwa", "· storage": "· ububiko", "per kg": "kuri kilo", "Buyer collects": "Umuguzi aritwarira", "KUZA transport": "Ubwikorezi bwa KUZA",
  "Harvest-timing tip:": "Inama ku gihe cy'isarura:", "Forecast harvest by week": "Erekana isarura riteganyijwe buri cyumweru",
  "Light bar = forecast kg, dark = already reserved by buyers. Amber = glut week.": "Umurongo werurutse = ibiro biteganyijwe, uwijimye = ibyamaze gutumizwa. Ibara ry'umuhondo = icyumweru cy'umusaruro mwinshi.",
  "Please type a question.": "Nyabuneka andika ikibazo.", "The assistant could not connect. Check your connection and try again.": "Umufasha ntiyashoboye guhuza na seriveri. Reba internet wongere ugerageze.",
  "The assistant is taking too long to respond. Please try again.": "Umufasha atinze gusubiza. Ongera ugerageze.",
  "An unexpected server error occurred. Please try again.": "Habaye ikibazo kititezwe kuri seriveri. Ongera ugerageze.",
  "This account has not been approved. Please contact KUZA.": "Iyi konti ntiremezwa. Nyabuneka hamagara KUZA.",
  "You do not have access to this.": "Nta burenganzira ufite bwo kubona ibi.",
  "Choose farmer or business.": "Hitamo umuhinzi cyangwa ubucuruzi.",
  "Please enter a valid email address.": "Nyabuneka andika imeri yemewe.",
  "Please enter a valid phone number.": "Nyabuneka andika nimero ya telefoni yemewe.",
  "Please enter the expected harvest date.": "Nyabuneka andika itariki y'isarura riteganyijwe.",
  "Please enter a valid quantity.": "Nyabuneka andika ingano yemewe.",
  "Please enter a valid price.": "Nyabuneka andika igiciro cyemewe.",
  "No harvests found.": "Nta masarura yabonetse.", "None": "Nta na kimwe", "History": "Amateka", "Save": "Bika", "Cancel": "Hagarika", "Confirm": "Emeza"
});

// Text that contains numbers or names: [pattern, Kinyarwanda with $1, $2 for the captured parts]
const RWX = [
  [/^(\d[\d,]*) kg available$/, "$1 kg zihari"], [/^(\d[\d,]*) kg tomatoes$/, "Inyanya $1 kg"], [/^Hello, (.+)$/, "Muraho, $1"],
  [/^Expected harvest: (.+)$/, "Isarura ryitezwe: $1"], [/^Farmer: (.+)$/, "Umuhinzi: $1"],
  [/^(\d[\d,]*) kg reserved · (\d[\d,]*) kg still available$/, "$1 kg zahiswemo · $2 kg zikiboneka"],
  [/^KUZA commission \((\d+)%\):$/, "Komisiyo ya KUZA ($1%):"], [/^Stored at (.+)$/, "Bibitse kuri $1"],
  [/^Week of (.+)$/, "Icyumweru gitangira ku $1"], [/^Harvest on (.+)$/, "Isarura ku itariki ya $1"],
  [/^Harvest (.+)$/, "Isarura $1"], [/^Farmer: (.+)$/, "Umuhinzi: $1"],
  [/^Phone: (.+)$/, "Telefoni: $1"], [/^Location: (.+)$/, "Aho biherereye: $1"],
  [/^Website: (.+)$/, "Urubuga: $1"], [/^Reason: (.+)$/, "Impamvu: $1"],
  [/^Cold room: (.+)$/, "Icyumba gikonjesha: $1"], [/^Deposit: (.+)$/, "Avansi: $1"],
  [/^Total (.+)$/, "Igiteranyo $1"], [/^Farmer trust (\d+)\/100$/, "Icyizere cy'umuhinzi: $1/100"],
  [/^Farm photo (\d+)$/, "Ifoto y'umurima $1"], [/^No (.+) accounts\.$/, "Nta konti za $1."],
  [/^(\d[\d,]*) kg · claimed (.+)$/, "$1 kg · byavuzwe: $2"], [/^Mark: (.+)$/, "Shyira kuri: $1"],
  [/^· asking (RWF .+) per kg$/, "· igiciro cyifuzwa $1 kuri kilo"], [/^· storage (RWF .+)$/, "· ububiko $1"],
  [/^(.+) · farmer (.+) · harvest (.+)$/, "$1 · umuhinzi $2 · isarura $3"],
  [/^Harvest (.+) · Buyer collects$/, "Isarura $1 · umuguzi aritwarira"],
  [/^Harvest (.+) · KUZA transport$/, "Isarura $1 · ubwikorezi bwa KUZA"],
  [/^RWF ([\d,]+) per kg · RWF ([\d,]+) total$/, "RWF $1 kuri kilo · RWF $2 yose"],
  [/^Total RWF (.+) · deposit RWF (.+) · KUZA fee RWF (.+)$/, "Igiteranyo RWF $1 · avansi RWF $2 · amafaranga ya KUZA RWF $3"],
  [/^· you receive (.+)$/, "· uhabwa $1"],
  [/^Harvest (.+) · (.+)$/, "Isarura $1 · $2"], [/^(\d[\d,]*) kg · farmer (.+) · harvest (.+)$/, "$1 kg · umuhinzi $2 · isarura $3"]
];

let KLANG = 'en';
try { KLANG = localStorage.getItem('kuza_lang') === 'rw' ? 'rw' : 'en'; } catch (e) { }
const kuzaLang = () => KLANG;

// Translates one string (keeps any spaces around it). Unknown text comes back unchanged.
function kuzaT(s) {
  if (KLANG !== 'rw' || !s) return s;
  const k = s.replace(/\s+/g, ' ').trim();
  if (!k) return s;
  let out = RW[k];
  if (out === undefined) for (const [re, to] of RWX) { const m = k.match(re); if (m) { out = to.replace(/\$(\d)/g, (_, i) => m[i]); break; } }
  return out === undefined ? s : s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];
}

const kOrig = new WeakMap(), kSet = new WeakMap();   // original English text, and the text we last wrote
const kAttrs = ['placeholder', 'title', 'alt', 'aria-label'];

function kText(n) {
  if (!n.nodeValue.trim() || /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) return;
  const p = n.parentNode;
  if (p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', n.nodeValue.trim());   // a dropdown must keep sending English values
  if (kSet.get(n) === n.nodeValue && kOrig.has(n)) {                                                     // text we wrote ourselves: re-translate from the English original
    const v = kuzaT(kOrig.get(n)); if (v !== n.nodeValue) { n.nodeValue = v; kSet.set(n, v); }
  } else {                                                                                                // new text from the page
    kOrig.set(n, n.nodeValue);
    const v = kuzaT(n.nodeValue); kSet.set(n, v); if (v !== n.nodeValue) n.nodeValue = v;
  }
}
function kApply(root) {
  if (root.nodeType === 3) return kText(root);
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
  nodes.forEach(kText);
  [root, ...root.querySelectorAll('[placeholder],[title],[alt],[aria-label]')].forEach(el => kAttrs.forEach(a => {
    if (!el.hasAttribute || !(el.hasAttribute(a) || el.hasAttribute('data-en-' + a))) return;
    if (!el.hasAttribute('data-en-' + a)) el.setAttribute('data-en-' + a, el.getAttribute(a));
    const v = kuzaT(el.getAttribute('data-en-' + a)); if (el.getAttribute(a) !== v) el.setAttribute(a, v);
  }));
}
let kTitle = null;
function kPage() {
  if (kTitle === null) kTitle = document.title;
  document.title = kuzaT(kTitle);
  document.documentElement.lang = KLANG;
  document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.l === KLANG));
  kApply(document.body);
}
function kuzaSetLang(l) {
  KLANG = l === 'rw' ? 'rw' : 'en';
  try { localStorage.setItem('kuza_lang', KLANG); } catch (e) { }
  kPage();
}

// Translate anything the page adds or changes later (cards, messages, pop-ups)
new MutationObserver(list => {
  if (KLANG !== 'rw') return;
  for (const r of list) {
    if (r.type === 'characterData') { if (kSet.get(r.target) !== r.target.nodeValue) kText(r.target); }
    else r.addedNodes.forEach(n => kApply(n));
  }
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

// ---------- Chat assistant widget ----------
function kuzaChat() {
  if ($('#chat')) return;
  const w = document.createElement('div');
  w.id = 'chat';
  w.innerHTML = `<button id="chatFab" aria-label="Open the KUZA assistant"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
    <div id="chatBox" hidden><div class="ch-head"><b>KUZA Assistant</b><button id="chatX" aria-label="Close">×</button></div>
    <div id="chatLog" aria-live="polite"></div>
    <form id="chatForm"><input id="chatIn" maxlength="500" placeholder="Ask about KUZA" autocomplete="off"><button class="btn sm">Send</button></form></div>`;
  document.body.appendChild(w);
  const log = $('#chatLog'), hist = [];
  const add = (who, text) => { const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  add('bot', 'Hello! I can answer questions about how KUZA works. What would you like to know?');
  const open = on => { $('#chatBox').hidden = !on; $('#chatFab').style.display = on ? 'none' : ''; if (on) $('#chatIn').focus(); };
  $('#chatFab').onclick = () => open(true);
  $('#chatX').onclick = () => open(false);
  $('#chatForm').onsubmit = async e => {
    e.preventDefault();
    const input = $('#chatIn'), text = input.value.trim();
    if (!text) return;
    input.value = ''; add('me', text); hist.push({ role: 'user', text });
    const wait = add('bot', '…');
    try {
      const r = await api('chat', { body: { messages: hist, lang: KLANG }, timeout: 30000 });
      wait.textContent = r.reply; hist.push({ role: 'assistant', text: r.reply });
    } catch (err) {
      console.error('[KUZA chat] Request failed:', err);
      wait.textContent = err.status === 429 ? kuzaT('You are sending messages too fast. Please wait a moment.')
        : err.status === 404 ? kuzaT('The KUZA chat endpoint was not found. On Render, deploy this project as a Web Service using npm start.')
        : err.status >= 500 ? kuzaT('The KUZA server returned an error. Please check the Render logs and try again.')
        : err.code === 'TIMEOUT' ? kuzaT('The assistant is taking too long to respond. Please try again.')
        : err.code === 'NETWORK' ? kuzaT('The assistant could not connect. Check your connection and try again.')
        : kuzaT('Sorry, the assistant is not available right now. Please try again in a moment.');
      hist.pop();
    }
    log.scrollTop = log.scrollHeight;
  };
}

// Called once the header exists: adds the language switch and the chat bubble, then translates the page
function kuzaInitUi() {
  const who = $('.who');
  if (who && !$('.lang')) {
    const sw = document.createElement('div');
    sw.className = 'lang';
    sw.innerHTML = '<button data-l="en" title="English">EN</button><button data-l="rw" title="Kinyarwanda">RW</button>';
    who.prepend(sw);
    sw.onclick = e => { const b = e.target.closest('[data-l]'); if (b) kuzaSetLang(b.dataset.l); };
  }
  kuzaChat();
  kPage();
}
