const DEFAULT_NAMES = ["Alice","Bob","Charlie","Dana","Eli","Fatima","Grace","Hugo"]; // starter sample

const canvas = document.getElementById("wheelCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

const spinButton = document.getElementById("spinButton");
const randomKoekBtn = document.getElementById("randomKoekBtn");
const statsBtn = document.getElementById("statsBtn");
const suggestionsBtn = document.getElementById("suggestionsBtn");
const suggestionsWinnerName = document.getElementById("suggestionsWinnerName");
const muteBtn = document.getElementById("muteBtn");
const bgAudio = document.getElementById("bgAudio");
// themeBtn removed
const winnerEl = document.getElementById("winner");
const historyList = document.getElementById("historyList");
const historyListFull = document.getElementById("historyListFull");

// Auto-reset elements
const autoResetToggle = document.getElementById("autoResetToggle");
const autoResetDay = document.getElementById("autoResetDay");
const autoResetTime = document.getElementById("autoResetTime");
const autoResetStatus = document.getElementById("autoResetStatus");

// Debug elements
const cookieConsentToggle = document.getElementById("cookieConsentToggle");

// Cookie consent elements
const cookieModal = document.getElementById("cookieModal");
const acceptCookiesBtn = document.getElementById("acceptCookies");
const rejectCookiesBtn = document.getElementById("rejectCookies");

const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const nameList = document.getElementById("nameList");
const clearAllBtn = document.getElementById("clearAll");
const importFile = document.getElementById("importFile");
const exportBtn = document.getElementById("exportBtn");

// Winner modal elements
const winnerModal = document.getElementById("winnerModal");
const winnerNameEl = document.getElementById("winnerName");
const winnerMessageEl = document.getElementById("winnerMessage");
const closeWinnerModal = document.getElementById("closeWinnerModal");
const revertFromPopupBtn = document.getElementById("revertFromPopupBtn");
// Post-win lock UI
const postWinMessageEl = document.getElementById("postWinMessage");
// Timer handle for staged winner reveal
let winnerRevealTimer = null;
let winnerAnimationWaitTimer = null;
// Configurable delays (in milliseconds)
const POPUP_DELAY_MS = 1000; // delay after confetti before showing popup
const VICTOR_PRE_REVEAL_MS = 300; // how long to show "Victor" before real winner

// Unban all toggle
const unbanAllToggle = document.getElementById("unbanAllToggle");
console.log('Unban toggle element:', unbanAllToggle);

// Emergency close function - add to window for debugging
window.closeWinnerModal = function() {
  if (winnerModal) {
    winnerModal.setAttribute('hidden', '');
    console.log('Emergency close triggered');
  }
};

// Routing Elements
const routes = Array.from(document.querySelectorAll('[data-route]'));

function normalizePath(pathname){
  if (!pathname) return '/';
  let p = String(pathname).replace(/\\/g, '/');
  // strip trailing /index.html if directly opening a file like /kandijkoek/index.html
  if (p.endsWith('/index.html')) p = p.slice(0, -('/index.html'.length));
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);

  const lower = p.toLowerCase();
  if (lower.includes('/kandijkoek')) return '/kandijkoek';
  if (lower.includes('/stroopwafel')) return '/stroopwafel';

  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return '/';
  }

  return p.startsWith('/') ? p : `/${p}`;
}

function navigateTo(pathname){
  const normalized = normalizePath(pathname);
  const match = routes.find(r => r.getAttribute('data-route') === normalized) ? normalized : '/';
  const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';
  if (!isFileProtocol && location.pathname !== match){
    try {
      history.pushState({}, '', match);
    } catch(error){
      console.warn('Failed to push history state:', error);
    }
  }
  updateRoute(match);
}

// Navigate to the home wheel page. If the current document does not contain the
// wheel UI (e.g., when loaded directly from /kandijkoek/index.html), perform a
// hard navigation to the root index instead of client-side routing.
function goHome(){
  const hasWheelUI = document.getElementById('wheelCanvas') || document.getElementById('spinButton');
  if (hasWheelUI){
    navigateTo('/');
  } else {
    // Fallback for direct loads of the admin page in a subfolder
    try {
      window.location.href = '../index.html';
    } catch(_e){
      navigateTo('/');
    }
  }
}

function updateRoute(pathname){
  const p = normalizePath(pathname);
  let activePath = '/';
  if (p === '/kandijkoek' || p.startsWith('/kandijkoek')) {
    // Gate the names page behind auth
    if (!isAuthorizedForNames()) {
      requestNamesAuth();
      activePath = '/';
    } else {
      activePath = '/kandijkoek';
    }
  } else if (p === '/stroopwafel' || p.startsWith('/stroopwafel')) {
    activePath = '/stroopwafel';
  }
  
  console.log('Current path:', p, 'Active path:', activePath);
  routes.forEach(section => {
    const isActive = section.getAttribute('data-route') === activePath;
    console.log('Section route:', section.getAttribute('data-route'), 'isActive:', isActive);
    if (isActive){
      section.removeAttribute('hidden');
    } else {
      section.setAttribute('hidden', '');
    }
  });
  
  // Update navigation active state
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === activePath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  
  // redraw wheel when showing home route to ensure crisp canvas
  if (activePath === '/' && canvas && ctx) {
    drawWheel().catch(console.error);
  }

  // When route updates, reflect post-win lock state on the home route
  if (activePath === '/'){
    renderPostWinState();
  }
}

// ----- Simple client-side auth for /kandijkoek -----
const AUTH_PASSWORD_HASH = '2480fa06978bd5a3594997c17afe1f125f145895b40ab7ebe16995a36bdb2cd1';
const CLEAR_HISTORY_PASSWORD_HASH = 'cb1a72e0e4919345440ea267a8261b15568b42b6a248da0bcc0e0c7c0b6963f4';
const PASSWORD_HASH_ALGO = 'SHA-256';
const AUTH_STORAGE_KEY = 'wheel:auth:names';
const POSTWIN_LOCK_KEY = 'wheel:postwin:lock';
const AUTO_RESET_KEY = 'wheel:autoReset';
const COOKIE_CONSENT_KEY = 'wheel:cookieConsent';
const DEBUG_COOKIE_CONSENT_KEY = 'wheel:debug:cookieConsent';

async function computePasswordHash(value){
  try{
    const subtle = (window.crypto || window.msCrypto)?.subtle;
    if (!subtle) {
      console.error('Web Crypto API is not available for password hashing.');
      return null;
    }
    if (typeof TextEncoder === 'undefined') {
      console.error('TextEncoder API is not available for password hashing.');
      return null;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await subtle.digest(PASSWORD_HASH_ALGO, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }catch(error){
    console.error('Failed to compute password hash.', error);
    return null;
  }
}

async function verifyPassword(input, expectedHash){
  if (typeof expectedHash !== 'string' || !expectedHash.length) return false;
  const hashed = await computePasswordHash(input);
  if (!hashed) return null;
  return hashed === expectedHash;
}

function isPostWinLocked(){
  try{
    const v = localStorage.getItem(POSTWIN_LOCK_KEY);
    return Boolean(v);
  }catch(_e){ return false; }
}

function setPostWinLock(winner){
  try{
    // Get random winner message
    const winnerMessage = getRandomWinnerMessage(winner);
    const payload = { 
      winner: String(winner || ''), 
      message: winnerMessage,
      at: Date.now() 
    };
    localStorage.setItem(POSTWIN_LOCK_KEY, JSON.stringify(payload));
    
    // Update suggestions button with winner name
    if (suggestionsWinnerName) {
      suggestionsWinnerName.textContent = winner || '';
    }
  }catch(_e){}
  // Also reflect winner in URL hash so other devices can see it when opening the link
  try{
    const encoded = encodeURIComponent(String(winner || ''));
    const newHash = `#winner=${encoded}`;
    if (location.hash !== newHash){
      history.replaceState({}, '', location.pathname + location.search + newHash);
    }
  }catch(_e){}
}

function clearPostWinLock(){
  try{ localStorage.removeItem(POSTWIN_LOCK_KEY); }catch(_e){}
  renderPostWinState();
  // Remove winner hash from URL
  try{
    if (location.hash){
      history.replaceState({}, '', location.pathname + location.search);
    }
  }catch(_e){}
}

function getLockedWinner(){
  try{
    const v = localStorage.getItem(POSTWIN_LOCK_KEY);
    if (!v) return '';
    const obj = JSON.parse(v);
    return typeof obj?.winner === 'string' ? obj.winner : '';
  }catch(_e){ return ''; }
}

function getLockedMessage(){
  try{
    const v = localStorage.getItem(POSTWIN_LOCK_KEY);
    if (!v) return '';
    const obj = JSON.parse(v);
    return typeof obj?.message === 'string' ? obj.message : '';
  }catch(_e){ return ''; }
}

// Cookie consent functions
function hasCookieConsent(){
  try{
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    return consent === 'accepted';
  }catch(_e){ return false; }
}

function setCookieConsent(accepted){
  try{
    localStorage.setItem(COOKIE_CONSENT_KEY, accepted ? 'accepted' : 'rejected');
  }catch(_e){}
}

function showCookieModal(){
  if (cookieModal) {
    cookieModal.removeAttribute('hidden');
  }
}

function hideCookieModal(){
  if (cookieModal) {
    cookieModal.setAttribute('hidden', '');
  }
}

function showBrokenPage(){
  // Hide the main app and show a broken page message
  const appMain = document.querySelector('.app-main');
  const appHeader = document.querySelector('.app-header');
  
  if (appMain) {
    appMain.innerHTML = `
      <div class="error-section">
        <h1>🍪 Cookies zijn vereist!</h1>
        <p>Jij denkt dat je cookies kan weigeren op de koekenrad website?</p>
        <p>Zonder cookies kan het rad niet draaien!</p>
        <p><strong>Het rad is  een cookie!</strong></p>
        <p><small>Jij moet niet denken, jij moet dwijlen!</small></p>
        <button onclick="location.reload()" class="primary">Probeer opnieuw</button>
      </div>
    `;
  }
  
  if (appHeader) {
    appHeader.style.display = 'none';
  }
}

// Debug functions for cookie consent (moved to global scope)
function getDebugCookieConsent(){
  try{
    const debug = localStorage.getItem(DEBUG_COOKIE_CONSENT_KEY);
    return debug === 'enabled';
  }catch(_e){ return false; }
}

function setDebugCookieConsent(enabled){
  try{
    localStorage.setItem(DEBUG_COOKIE_CONSENT_KEY, enabled ? 'enabled' : 'disabled');
  }catch(_e){}
}

function clearCookieConsent(){
  try{
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    localStorage.removeItem(DEBUG_COOKIE_CONSENT_KEY);
  }catch(_e){}
}

function parseWinnerFromHash(){
  try{
    const h = location.hash || '';
    if (!h.startsWith('#')) return '';
    const qs = new URLSearchParams(h.slice(1));
    const w = qs.get('winner') || '';
    return decodeURIComponent(w);
  }catch(_e){ return ''; }
}

function renderPostWinStateWithoutMessage(){
  const layout = document.querySelector('.wheel-layout');
  const historyPane = document.querySelector('.history-pane');
  const sideControls = document.getElementById('spinButton')?.parentElement || null;
  const wheelCanvasWrap = document.querySelector('.wheel-canvas');
  const spinBtn = document.getElementById('spinButton');
  const wheelCanvasEl = document.getElementById('wheelCanvas');
  const headerTitle = document.querySelector('.app-header h1');
  if (!layout) return;
  const locked = isPostWinLocked();
  if (locked){
    // hide wheel UI (left column), keep history on the right
    // keep the column but hide only the spin button and show random button
    if (sideControls) sideControls.removeAttribute('hidden');
    if (spinBtn) spinBtn.setAttribute('hidden', '');
    if (randomKoekBtn) randomKoekBtn.removeAttribute('hidden');
    if (statsBtn) statsBtn.removeAttribute('hidden');
    if (suggestionsBtn) suggestionsBtn.removeAttribute('hidden');
    if (wheelCanvasEl) wheelCanvasEl.setAttribute('hidden', '');
    if (winnerEl) winnerEl.style.display = 'none';
    // Keep post-win message hidden
    if (postWinMessageEl) {
      postWinMessageEl.style.display = 'none';
      postWinMessageEl.classList.remove('visible');
    }
    if (historyPane){ historyPane.classList.add('emphasize'); }
  } else {
    // show wheel UI
    if (sideControls) sideControls.removeAttribute('hidden');
    if (spinBtn) spinBtn.removeAttribute('hidden');
    if (randomKoekBtn) randomKoekBtn.setAttribute('hidden', '');
    if (statsBtn) statsBtn.setAttribute('hidden', '');
    if (suggestionsBtn) suggestionsBtn.setAttribute('hidden', '');
    if (wheelCanvasEl) wheelCanvasEl.removeAttribute('hidden');
    if (winnerEl) winnerEl.style.display = 'block';
    if (postWinMessageEl){
      postWinMessageEl.style.display = 'none';
      postWinMessageEl.classList.remove('visible');
      postWinMessageEl.textContent = '';
    }
    if (historyPane){ historyPane.classList.remove('emphasize'); }
  }

  // Update the header title
  if (headerTitle){
    headerTitle.textContent = locked
      ? 'De koekgoden hebben gesproken...'
      : 'Vraag de koekgoden om een slachtoffer te kiezen:';
  }
}

function renderPostWinState(){
  const layout = document.querySelector('.wheel-layout');
  const historyPane = document.querySelector('.history-pane');
  const sideControls = document.getElementById('spinButton')?.parentElement || null;
  const wheelCanvasWrap = document.querySelector('.wheel-canvas');
  const spinBtn = document.getElementById('spinButton');
  const wheelCanvasEl = document.getElementById('wheelCanvas');
  const headerTitle = document.querySelector('.app-header h1');
  if (!layout) return;
  const locked = isPostWinLocked();
  if (locked){
    // hide wheel UI (left column), keep history on the right
    // keep the column but hide only the spin button and show random button
    if (sideControls) sideControls.removeAttribute('hidden');
    if (spinBtn) spinBtn.setAttribute('hidden', '');
    if (randomKoekBtn) randomKoekBtn.removeAttribute('hidden');
    if (statsBtn) statsBtn.removeAttribute('hidden');
    if (suggestionsBtn) suggestionsBtn.removeAttribute('hidden');
    if (wheelCanvasEl) wheelCanvasEl.setAttribute('hidden', '');
    if (winnerEl) winnerEl.style.display = 'none';
    if (postWinMessageEl){
      // Always prepare the post-win message content when locked
      const winner = getLockedWinner();
      const message = getLockedMessage();
      let displayMessage;
      if (message) {
        // Split custom message on logical break points
        displayMessage = message.replace(/([.!?])\s+/g, '$1<br><br>');
      } else {
        // Default message with better line breaks
        displayMessage = `🍪 De oven is leeg!<br><br><strong>${winner}</strong><br><br>heeft de knapperigste koek gewonnen.`;
      }
      postWinMessageEl.innerHTML = `<div class="postwin-message-content">${displayMessage}</div>`;
      
      // Force orange styling for strong elements
      const strongElements = postWinMessageEl.querySelectorAll('strong');
      strongElements.forEach(el => {
        el.style.color = 'var(--accent)';
        el.style.textShadow = '0 0 10px rgba(245,158,11,.3)';
        el.style.fontSize = '1em';
        el.style.fontWeight = '700';
      });
      
      // Only show post-win message if winner popup is not active
      if (!isWinnerPopupActive) {
        postWinMessageEl.style.setProperty('display', 'flex', 'important');
        postWinMessageEl.classList.add('visible');
        // Add class to wheel-canvas for CSS targeting
        if (wheelCanvasWrap) {
          wheelCanvasWrap.classList.add('has-message');
        }
      } else {
        // Ensure post-win message is hidden while popup is active
        postWinMessageEl.style.setProperty('display', 'none', 'important');
        postWinMessageEl.classList.remove('visible');
        if (wheelCanvasWrap) {
          wheelCanvasWrap.classList.remove('has-message');
        }
      }
    }
    if (historyPane){ historyPane.classList.add('emphasize'); }
  } else {
    // show wheel UI
    if (sideControls) sideControls.removeAttribute('hidden');
    if (spinBtn) spinBtn.removeAttribute('hidden');
    if (randomKoekBtn) randomKoekBtn.setAttribute('hidden', '');
    if (statsBtn) statsBtn.setAttribute('hidden', '');
    if (suggestionsBtn) suggestionsBtn.setAttribute('hidden', '');
    if (wheelCanvasEl) wheelCanvasEl.removeAttribute('hidden');
    if (winnerEl) winnerEl.style.display = 'block';
    if (postWinMessageEl){
      postWinMessageEl.style.display = 'none';
      postWinMessageEl.classList.remove('visible');
      postWinMessageEl.textContent = '';
    }
    // Remove message class from wheel-canvas
    if (wheelCanvasWrap) {
      wheelCanvasWrap.classList.remove('has-message');
    }
    if (historyPane){ historyPane.classList.remove('emphasize'); }
  }

  // Update the header title
  if (headerTitle){
    headerTitle.textContent = locked
      ? 'De koekgoden hebben gesproken...'
      : 'Vraag de koekgoden om een slachtoffer te kiezen:';
  }
}

function isAuthorizedForNames(){
  try{
    return sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  }catch(_e){ return false; }
}

function setAuthorizedForNames(v){
  try{
    if (v) sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
    else sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }catch(_e){}
}

function requestNamesAuth(){
  const modal = document.getElementById('authModal');
  const form = document.getElementById('authForm');
  const input = document.getElementById('authInput');
  const cancelBtn = document.getElementById('authCancel');
  const errorEl = document.getElementById('authError');
  const defaultErrorMessage = errorEl ? errorEl.textContent : '';
  if (!modal || !form || !input) return;

  // reset state
  if (errorEl) errorEl.setAttribute('hidden', '');
  if (errorEl) errorEl.textContent = defaultErrorMessage;
  input.value = '';
  modal.removeAttribute('hidden');
  document.body.classList.add('auth-open');
  setTimeout(() => input.focus(), 0);

  const closeAuth = () => {
    modal.setAttribute('hidden', '');
    document.body.classList.remove('auth-open');
    form.onsubmit = null;
    if (cancelBtn) cancelBtn.onclick = null;
    document.removeEventListener('keydown', onEsc);
  };

  function isEscapeKey(e){
    // Support various browser/event representations
    if (!e) return false;
    if (e.key === 'Escape' || e.key === 'Esc') return true;
    if (e.code === 'Escape') return true;
    if (e.keyCode === 27) return true;
    return false;
  }

  function onEsc(e){
    if (isEscapeKey(e)){
      e.preventDefault();
      closeAuth();
      goHome();
    }
  }
  document.addEventListener('keydown', onEsc);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const value = input.value || '';
    const verificationResult = await verifyPassword(value, AUTH_PASSWORD_HASH);
    if (verificationResult === true){
      setAuthorizedForNames(true);
      closeAuth();
      // Immediately show names route without needing a refresh
      updateRoute('/kandijkoek');
    } else if (verificationResult === null){
      if (errorEl) {
        errorEl.textContent = 'Beveiligde verificatie wordt niet ondersteund in deze browser.';
        errorEl.removeAttribute('hidden');
      }
    } else {
      if (errorEl){
        errorEl.textContent = defaultErrorMessage || 'Onjuist wachtwoord';
        errorEl.removeAttribute('hidden');
      }
      input.select();
    }
  };
  if (cancelBtn){
    cancelBtn.onclick = () => {
      closeAuth();
      goHome();
    };
  }
}

function isNamesRouteActive(){
  const p = normalizePath(location.pathname);
  return p === '/kandijkoek' || p.startsWith('/kandijkoek');
}

window.addEventListener('popstate', () => updateRoute(location.pathname));
// ---- Background audio controls ----
const AUDIO_MUTE_KEY = 'wheel:audio:muted';
function loadMuted(){ try{ return localStorage.getItem(AUDIO_MUTE_KEY) === '1'; }catch(_e){ return false; } }
function saveMuted(v){ try{ localStorage.setItem(AUDIO_MUTE_KEY, v ? '1' : '0'); }catch(_e){} }

function applyMuteUI(){
  if (!muteBtn || !bgAudio) return;
  const muted = loadMuted();
  muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  muteBtn.textContent = muted ? '🔇' : '🔊';
  bgAudio.muted = muted;
}

async function ensureAutoplay(){
  if (!bgAudio) return;
  try{ await bgAudio.play(); }
  catch(_e){
    // Autoplay blocked: start on first user interaction
    const onFirst = () => {
      bgAudio.play().catch(()=>{});
      window.removeEventListener('pointerdown', onFirst);
      window.removeEventListener('keydown', onFirst);
    };
    window.addEventListener('pointerdown', onFirst, { once: true });
    window.addEventListener('keydown', onFirst, { once: true });
  }
}

if (muteBtn && bgAudio){
  // Start muted to satisfy autoplay policies; then reflect stored state
  try{ bgAudio.muted = true; }catch(_e){}
  applyMuteUI();
  ensureAutoplay();
  muteBtn.addEventListener('click', () => {
    const newMuted = !(loadMuted());
    saveMuted(newMuted);
    applyMuteUI();
    if (!newMuted){ ensureAutoplay(); }
  });
}

// theme toggle removed

// App state
let names = loadNames();
let colors = generateColors(names.length);
let bans = loadBans(); // [{ name, remaining }]

let angleOffset = -Math.PI / 2; // start at top
let currentAngle = loadAngle(); // rotation of the wheel (persisted)
let spinning = false;
let history = loadHistory();
let winnerMessages = []; // Will store the loaded messages
let lastSpinSnapshot = null; // snapshot to allow reverting last spin

// Cookie image
let cookieImage = null;

// Track if winner popup is currently showing
let isWinnerPopupActive = false;

function loadCookieImage(){
  return new Promise((resolve, reject) => {
    if (cookieImage) {
      resolve(cookieImage);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      cookieImage = img;
      resolve(img);
    };
    img.onerror = () => {
      console.warn('Could not load cookie image, falling back to canvas drawing');
      resolve(null);
    };
    img.src = 'images/koekrad.png';
  });
}

function loadNames(){
  try {
    const saved = localStorage.getItem("wheel:names");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every(n => typeof n === "string" && n.trim().length)) {
        return parsed;
      }
    }
  } catch(_e) {}
  return [...DEFAULT_NAMES];
}

function saveNames(){
  localStorage.setItem("wheel:names", JSON.stringify(names));
}

function loadAngle(){
  const raw = localStorage.getItem("wheel:angle");
  const n = raw == null ? NaN : parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function saveAngle(){
  localStorage.setItem("wheel:angle", String(currentAngle));
}

function capturePreSpinSnapshot(){
  try{
    const lockRaw = localStorage.getItem(POSTWIN_LOCK_KEY);
    const snapshot = {
      angle: currentAngle,
      bans: JSON.parse(JSON.stringify(bans || [])),
      history: JSON.parse(JSON.stringify(history || [])),
      lock: lockRaw == null ? null : lockRaw
    };
    // Save to localStorage so it persists across page reloads
    localStorage.setItem("wheel:lastSpinSnapshot", JSON.stringify(snapshot));
    return snapshot;
  }catch(_e){
    const snapshot = { angle: currentAngle, bans: (bans||[]).slice(), history: (history||[]).slice(), lock: null };
    try {
      localStorage.setItem("wheel:lastSpinSnapshot", JSON.stringify(snapshot));
    } catch(_e2) {}
    return snapshot;
  }
}

function loadLastSpinSnapshot(){
  try{
    const saved = localStorage.getItem("wheel:lastSpinSnapshot");
    return saved ? JSON.parse(saved) : null;
  }catch(_e){
    return null;
  }
}

function revertLastSpin(){
  // Try to load snapshot from localStorage if not in memory
  if (!lastSpinSnapshot) {
    lastSpinSnapshot = loadLastSpinSnapshot();
  }
  
  console.log('revertLastSpin called, snapshot exists:', !!lastSpinSnapshot, 'spinning:', spinning);
  if (!lastSpinSnapshot) {
    console.log('No snapshot available to revert');
    return;
  }
  if (spinning) {
    console.log('Cannot revert while spinning');
    return;
  }
  // Restore angle
  currentAngle = lastSpinSnapshot.angle;
  saveAngle();
  // Restore bans
  bans = Array.isArray(lastSpinSnapshot.bans) ? lastSpinSnapshot.bans : [];
  saveBans();
  // Restore history
  history = Array.isArray(lastSpinSnapshot.history) ? lastSpinSnapshot.history : [];
  saveHistory();
  // Restore lock state
  try{
    const hadLock = lastSpinSnapshot.lock != null && lastSpinSnapshot.lock !== undefined;
    if (hadLock){
      localStorage.setItem(POSTWIN_LOCK_KEY, lastSpinSnapshot.lock);
    } else {
      clearPostWinLock();
    }
  }catch(_e){ clearPostWinLock(); }
  // Close winner modal if open
  if (winnerModal && !winnerModal.hasAttribute('hidden')){
    winnerModal.setAttribute('hidden', '');
  }
  // Refresh UI
  renderList();
  if (canvas && ctx) drawWheel().catch(console.error);
  renderHistory();
  renderFullHistory();
  renderPostWinState();
  // Clear snapshot to prevent repeated reverts
  lastSpinSnapshot = null;
  try {
    localStorage.removeItem("wheel:lastSpinSnapshot");
  } catch(_e) {}
  console.log('Revert completed successfully');
}

function loadHistory(){
  try{
    const saved = localStorage.getItem("wheel:history");
    const arr = saved ? JSON.parse(saved) : [];
    if (Array.isArray(arr)) return arr;
  }catch(_e){}
  return [];
}

function saveHistory(){
  localStorage.setItem("wheel:history", JSON.stringify(history));
}

function loadBans(){
  try{
    const saved = localStorage.getItem("wheel:bans");
    const arr = saved ? JSON.parse(saved) : [];
    if (Array.isArray(arr)) return arr.filter(b => b && typeof b.name === 'string' && Number.isFinite(b.remaining));
  }catch(_e){}
  return [];
}

function saveBans(){
  localStorage.setItem("wheel:bans", JSON.stringify(bans));
}

// Winner messages functions
async function loadWinnerMessages(){
  try {
    const response = await fetch('koekgoden_teksten.json');
    if (!response.ok) throw new Error('Failed to load messages');
    const data = await response.json();
    winnerMessages = data.uitspraken || [];
    console.log('Loaded', winnerMessages.length, 'winner messages');
  } catch (error) {
    console.error('Error loading winner messages:', error);
    // Fallback messages if JSON fails to load
    winnerMessages = [
      "…hun oordeel is gevallen op [winnaar].",
      "…het offer van deze week is onmiskenbaar: [winnaar].",
      "…de oven roept, en [winnaar] zal gehoor geven."
    ];
  }
}

function getRandomWinnerMessage(winnerName){
  if (winnerMessages.length === 0) {
    return `De koekgoden hebben <strong>${winnerName}</strong> gekozen!`;
  }
  
  const randomIndex = Math.floor(Math.random() * winnerMessages.length);
  let message = winnerMessages[randomIndex];
  
  // Replace [winnaar] with the actual winner name wrapped in strong tag
  message = message.replace(/\[winnaar\]/g, `<strong>${winnerName}</strong>`);
  
  // For very long messages, add line breaks to improve readability
  if (message.length > 80) {
    // Try to break at natural points like commas or periods
    message = message.replace(/([.,;])\s+/g, '$1<br>');
  }
  
  return message;
}

// Auto-reset functions
function loadAutoResetSettings(){
  try{
    const saved = localStorage.getItem(AUTO_RESET_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.enabled === 'boolean' && 
          typeof parsed.day === 'number' && typeof parsed.time === 'string') {
        return parsed;
      }
    }
  }catch(_e){}
  return { enabled: false, day: 1, time: "13:00" }; // default: Monday 13:00
}

function saveAutoResetSettings(settings){
  try{
    localStorage.setItem(AUTO_RESET_KEY, JSON.stringify(settings));
  }catch(_e){}
}

function updateAutoResetStatus(){
  if (!autoResetStatus) return;
  const settings = loadAutoResetSettings();
  if (!settings.enabled) {
    autoResetStatus.textContent = "Automatische reset is uitgeschakeld";
    return;
  }
  
  const now = new Date();
  const dayNames = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  const nextReset = getNextResetTime(settings.day, settings.time);
  const timeUntil = nextReset - now;
  
  if (timeUntil <= 0) {
    autoResetStatus.textContent = "Reset wordt uitgevoerd...";
  } else {
    const days = Math.floor(timeUntil / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
    
    let statusText = `Volgende reset: ${dayNames[settings.day]} om ${settings.time}`;
    if (days > 0) statusText += ` (over ${days}d ${hours}u)`;
    else if (hours > 0) statusText += ` (over ${hours}u ${minutes}m)`;
    else statusText += ` (over ${minutes}m)`;
    
    autoResetStatus.textContent = statusText;
  }
}

function getNextResetTime(targetDay, targetTime){
  const now = new Date();
  const [hours, minutes] = targetTime.split(':').map(Number);
  
  // Create target time for today
  const today = new Date(now);
  today.setHours(hours, minutes, 0, 0);
  
  // If today is the target day and time hasn't passed, use today
  if (now.getDay() === targetDay && now < today) {
    return today;
  }
  
  // Otherwise, find next occurrence
  const currentDay = now.getDay();
  let daysUntilTarget;
  
  if (currentDay < targetDay) {
    daysUntilTarget = targetDay - currentDay;
  } else if (currentDay > targetDay) {
    daysUntilTarget = 7 - (currentDay - targetDay);
  } else {
    // Same day but time has passed, go to next week
    daysUntilTarget = 7;
  }
  
  const nextReset = new Date(now);
  nextReset.setDate(now.getDate() + daysUntilTarget);
  nextReset.setHours(hours, minutes, 0, 0);
  
  return nextReset;
}

function performAutoReset(){
  console.log('Performing automatic reset...');
  // Clear post-win lock
  clearPostWinLock();
  // Reset bans
  bans = [];
  saveBans();
  // Update UI
  renderList();
  if (canvas && ctx) drawWheel().catch(console.error);
  renderPostWinState();
  // Show notification
  if (autoResetStatus) {
    autoResetStatus.textContent = "Spel automatisch gereset!";
    setTimeout(() => updateAutoResetStatus(), 3000);
  }
}

function checkAutoReset(){
  const settings = loadAutoResetSettings();
  if (!settings.enabled) return;
  
  const now = new Date();
  const nextReset = getNextResetTime(settings.day, settings.time);
  const timeUntil = nextReset - now;
  
  console.log('Auto-reset check:', {
    now: now.toLocaleString(),
    targetDay: settings.day,
    targetTime: settings.time,
    nextReset: nextReset.toLocaleString(),
    timeUntil: Math.round(timeUntil / 1000) + 's'
  });
  
  // If it's time to reset (within 1 minute tolerance)
  if (timeUntil <= 60000 && timeUntil > -60000) {
    console.log('Triggering auto-reset!');
    performAutoReset();
  }
}

function getActiveNames(){
  if (!Array.isArray(names) || names.length === 0) return [];
  if (!Array.isArray(bans) || bans.length === 0) return [...names];
  const banned = new Set(bans.filter(b => b.remaining > 0).map(b => b.name));
  return names.filter(n => !banned.has(n));
}

function getBanRemaining(name){
  const b = bans.find(x => x.name === name);
  return b ? Math.max(0, b.remaining) : 0;
}

function setBan(name, remaining){
  let b = bans.find(x => x.name === name);
  if (!b){
    b = { name, remaining: 0 };
    bans.push(b);
  }
  b.remaining = Math.max(0, Math.floor(remaining));
  saveBans();
}

function clearBan(name){
  bans = bans.filter(x => x.name !== name);
  saveBans();
}

function unbanAllNames(){
  bans = [];
  saveBans();
  renderList();
  drawWheel().catch(console.error);
}

function toggleBan(name){
  const r = getBanRemaining(name);
  if (r > 0){
    clearBan(name);
  } else {
    setBan(name, 3);
  }
  renderList();
  drawWheel().catch(console.error);
}

function generateColors(n){
  // warm cookie palette for name tags
  const result = [];
  for (let i = 0; i < Math.max(1, n); i++) {
    const hue = 32 + (i * 6) % 12; // 32-44 (warm dough)
    const sat = 70; // fairly saturated
    const light = 40 + ((i * 17) % 30); // 40-70
    result.push(`hsl(${hue} ${sat}% ${light}%)`);
  }
  return result.slice(0, n);
}

function shuffleArray(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// simple seeded RNG for stable chip placement per slice
function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str){
  let h = 2166136261;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function drawCookieCanvas(cx, cy, radius){
  // Fallback canvas drawing when PNG fails to load
  const crustLineWidth = Math.max(6, radius * 0.08);
  
  // Cookie base (dough) - more realistic
  const doughGrad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  doughGrad.addColorStop(0, "#f4e4bc"); // lighter center
  doughGrad.addColorStop(0.7, "#e6c47a"); // golden middle
  doughGrad.addColorStop(1, "#d4a574"); // darker edge
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = doughGrad;
  ctx.fill();

  // Add texture - small bumps and imperfections
  ctx.save();
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const dist = radius * (0.3 + Math.random() * 0.6);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const size = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = "#c9a96b";
    ctx.fill();
  }
  ctx.restore();

  // Crust rim - more realistic
  ctx.lineWidth = crustLineWidth;
  ctx.strokeStyle = "#b98552";
  ctx.stroke();
  
  // Inner rim for depth
  ctx.lineWidth = Math.max(2, crustLineWidth * 0.3);
  ctx.strokeStyle = "#a67c52";
  ctx.stroke();
}

async function drawWheel(){
  // Use CSS pixel size (after DPR transform) to avoid clipping
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const cx = width / 2;
  const cy = height / 2;
  // Compute radius - use more of the canvas space for PNG
  const internalPadding = 8; // minimal padding for canvas edges
  const baseRadius = Math.min(width, height) / 2 - internalPadding;
  const radius = Math.max(1, baseRadius);

  ctx.clearRect(0, 0, width, height);

  const activeNames = getActiveNames();
  if (activeNames.length === 0){
    // empty state
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 22px Inter, system-ui, sans-serif";
    ctx.fillText("Add some names!", cx, cy);
    drawPointer(cx, cy, radius);
    return;
  }

  // Try to load and draw cookie image
  const img = await loadCookieImage();
  let useImage = false;
  if (img) {
    // Draw cookie image as background
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentAngle);
    ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
    ctx.restore();
    useImage = true;
  } else {
    // Fallback to canvas drawing if image fails to load
    drawCookieCanvas(cx, cy, radius);
  }

  const sliceAngle = (Math.PI * 2) / activeNames.length;

  // Subtle slice separators and chips + labels
  const colorsActive = generateColors(activeNames.length);
  for (let i = 0; i < activeNames.length; i++){
    const start = currentAngle + angleOffset + i * sliceAngle;
    const end = start + sliceAngle;

    // separators - make them more visible
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // chocolate chips for this slice (only if not using PNG)
    if (!useImage) {
      const seed = hashStringToSeed(`${activeNames[i]}:${i}`);
      drawCookieChips(cx, cy, radius * 0.9, start, end, seed);
    }

    // label - make more visible
    const mid = start + sliceAngle / 2;
    const textRadius = radius * 0.68;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * textRadius, cy + Math.sin(mid) * textRadius);
    ctx.rotate(mid);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Use high contrast colors for better visibility
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,.8)";
    ctx.lineWidth = 4;
    ctx.font = `bold ${Math.max(14, Math.min(20, Math.floor(radius / 12)))}px Inter, system-ui, sans-serif`;
    const label = activeNames[i];
    const text = (function(){ return label; })();
    // Strong outline for better readability
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // center chocolate chunk (hub) - only if not using PNG
  if (!useImage) {
    const hubRadius = Math.max(12, radius * 0.08);
    const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, hubRadius);
    hubGrad.addColorStop(0, "#6b4423"); // lighter center
    hubGrad.addColorStop(1, "#4a2f1a"); // darker edge
    ctx.beginPath();
    ctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
    ctx.fillStyle = hubGrad;
    ctx.fill();
    
    // Hub highlight
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.arc(cx - hubRadius * 0.3, cy - hubRadius * 0.3, hubRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPointer(cx, cy, radius);
}

function drawCookieChips(cx, cy, r, start, end, seed){
  const rand = mulberry32(seed);
  const chips = 4 + Math.floor(rand() * 5); // 4-8
  const placed = [];
  ctx.save();
  for (let c = 0; c < chips; c++){
    let attempts = 0;
    let placedThis = null;
    while (attempts++ < 40 && !placedThis){
      const pad = Math.min(0.18, (end - start) * 0.18);
      const a = start + pad + rand() * Math.max(0.001, (end - start) - 2 * pad);
      const rr = r * (0.25 + rand() * 0.7);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const size = Math.max(3, r * (0.02 + rand() * 0.03));
      const clearance = 2; // minimal gap between chips in px
      let ok = true;
      for (let i = 0; i < placed.length; i++){
        const p = placed[i];
        const dx = x - p.x;
        const dy = y - p.y;
        const minDist = size + p.size + clearance;
        if (dx * dx + dy * dy < minDist * minDist){ ok = false; break; }
      }
      if (ok){
        placedThis = { x, y, size };
        placed.push(placedThis);
      }
    }
    const chip = placedThis || (function(){
      // Fallback: place even if overlapping to avoid missing chips
      const a = start + (end - start) * 0.5;
      const rr = r * 0.5;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const size = Math.max(3, r * 0.025);
      return { x, y, size };
    })();
    // More realistic chocolate chip
    ctx.beginPath();
    const chipColor = rand() > 0.2 ? "#3f2a22" : "#2d1c16";
    ctx.fillStyle = chipColor;
    ctx.arc(chip.x, chip.y, chip.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Chip highlight for 3D effect
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.arc(chip.x - chip.size * 0.4, chip.y - chip.size * 0.4, Math.max(1, chip.size * 0.3), 0, Math.PI * 2);
    ctx.fill();
    
    // Chip shadow for depth
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.arc(chip.x + chip.size * 0.2, chip.y + chip.size * 0.2, Math.max(1, chip.size * 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPointer(cx, cy, radius){
  const tipX = cx;
  // Ensure the pointer stays fully inside the canvas (avoid clipping at top)
  const minTopPadding = 30; // pixels
  const tipY = Math.max(minTopPadding, cy - radius - 6);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - 16, tipY - 26);
  ctx.lineTo(tipX + 16, tipY - 26);
  ctx.closePath();
  ctx.fillStyle = "#fbbf24"; // amber
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.stroke();
  ctx.restore();
}

function truncateAndFillText(ctx, text, x, y, maxWidth){
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    return;
  }
  let truncated = text;
  while (ctx.measureText(truncated + "…").width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  ctx.strokeText(truncated + "…", x, y);
  ctx.fillText(truncated + "…", x, y);
}

function getWinnerIndex(){
  const activeNames = getActiveNames();
  if (activeNames.length === 0) return -1;
  const tau = Math.PI * 2;
  const sliceAngle = tau / activeNames.length;
  const thetaTop = -Math.PI / 2; // pointer angle in canvas space
  const norm = (a) => ((a % tau) + tau) % tau;
  const a = norm(thetaTop);
  for (let i = 0; i < activeNames.length; i++){
    const start = norm(currentAngle + angleOffset + i * sliceAngle);
    const end = norm(start + sliceAngle);
    if (start <= end){
      if (a >= start && a < end) return i;
    } else {
      // wrapped across 2π
      if (a >= start || a < end) return i;
    }
  }
  return -1;
}

function spin(){
  if (spinning || names.length === 0) return;
  if (isPostWinLocked()){
    // Prevent spinning when locked; reflect UI just in case
    renderPostWinState();
    return;
  }
  if (getActiveNames().length === 0) return;
  // Take snapshot so we can revert if winner is not aanwezig
  lastSpinSnapshot = capturePreSpinSnapshot();
  spinning = true;
  winnerEl.textContent = "";

  // Enhanced spin parameters for THE moment
  const baseRotations = 8 + Math.random() * 4; // 8-12 turns for more drama
  const targetAngle = currentAngle + baseRotations * Math.PI * 2 + Math.random() * Math.PI * 2;
  const duration = 6000 + Math.random() * 2000; // 6-8s for more suspense

  const start = performance.now();
  const startAngle = currentAngle;

  // Enhanced easing for more dramatic effect
  function easeOutQuart(t){
    return 1 - Math.pow(1 - t, 4);
  }

  // Add dramatic sound effects (if audio is available)
  function playSpinSound() {
    if (bgAudio && !bgAudio.muted) {
      // Create a spinning sound effect
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + duration / 1000);
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
    }
  }

  // Start dramatic sound
  playSpinSound();

  // Screen shake removed - keeping other effects

  // Add dramatic lighting effect
  function addDramaticLighting(t) {
    const canvasWrap = document.querySelector('.wheel-canvas');
    if (canvasWrap) {
      const glowIntensity = Math.sin(t * Math.PI * 4) * 0.3 + 0.7; // Pulsing glow
      // Apply glow to container to avoid clipping by canvas border-radius
      canvasWrap.style.filter = `drop-shadow(0 0 ${20 + glowIntensity * 30}px rgba(245, 158, 11, ${0.5 + glowIntensity * 0.3}))`;
    }
  }

  // Add particle effects during spin
  function addSpinParticles(t) {
    if (t > 0.1 && t < 0.9 && Math.random() < 0.3) {
      const particle = document.createElement('div');
      particle.style.position = 'fixed';
      particle.style.left = Math.random() * window.innerWidth + 'px';
      particle.style.top = Math.random() * window.innerHeight + 'px';
      particle.style.width = '4px';
      particle.style.height = '4px';
      particle.style.background = `hsl(${30 + Math.random() * 20}, 70%, 60%)`;
      particle.style.borderRadius = '50%';
      particle.style.pointerEvents = 'none';
      particle.style.zIndex = '1000';
      particle.style.animation = 'spinParticle 2s ease-out forwards';
      
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 2000);
    }
  }

  function frame(now){
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutQuart(t);
    currentAngle = startAngle + (targetAngle - startAngle) * eased;
    
    // Add dramatic effects
    if (t < 0.8) {
      addDramaticLighting(t);
      addSpinParticles(t);
    } else {
      // Stop effects as we approach the end
      const canvasWrap = document.querySelector('.wheel-canvas');
      if (canvasWrap) {
        canvasWrap.style.filter = '';
      }
    }
    
    drawWheel().catch(console.error);
    
    if (t < 1){
      requestAnimationFrame(frame);
    } else {
      spinning = false;
      const winnerIndex = getWinnerIndex();
      const activeNames = getActiveNames();
      const winner = activeNames[winnerIndex] ?? "";
      
      // Final dramatic pause before reveal
      setTimeout(() => {
        burstConfetti();
        saveAngle();
        if (winner){
          // Immediately set lock state to prevent refresh abuse
          setPostWinLock(winner);
          // Don't update UI yet - keep everything as is until popup closes
          
          // Show the big winner popup
          setTimeout(() => {
            showWinnerPopup(winner);
          }, POPUP_DELAY_MS); // Show after confetti starts
  				history.unshift({ who: winner, when: Date.now() });
  			// Keep full history; UI will display only the last 10
  			saveHistory();
          renderHistory();
          renderFullHistory();
          // Apply 3-spin temporary ban for winner
          // If the same person is already banned, reset to 3
          const existing = bans.find(b => b.name === winner);
          if (existing){
            existing.remaining = 3;
          } else {
            bans.push({ name: winner, remaining: 3 });
          }
          saveBans();
          // After committing the win, decrement remaining bans for all entries for the next spin
          decrementBans();
          // Redraw to reflect any bans
          drawWheel().catch(console.error);
        }
      }, 500); // Dramatic pause
    }
  }

  requestAnimationFrame(frame);
}

function renderList(){
  nameList.innerHTML = "";
  const activeNames = getActiveNames();
  names.forEach((n, i) => {
    const li = document.createElement("li");
    const tag = document.createElement("span");
    tag.className = "tag";
    const color = document.createElement("span");
    color.className = "color";
    // color index based on position in active list if present
    const activeIndex = activeNames.indexOf(n);
    const colorIndex = activeIndex >= 0 ? activeIndex : i;
    const palette = generateColors(activeNames.length || names.length);
    color.style.background = palette[colorIndex % palette.length];
    const label = document.createElement("span");
    label.textContent = n;
    tag.appendChild(color);
    tag.appendChild(label);

    const actions = document.createElement("span");
    const del = document.createElement("button");
  del.textContent = "Wegwezen!";
    del.className = "danger";
    del.addEventListener("click", () => {
      if (spinning) return;
      names.splice(i, 1);
      colors = generateColors(names.length);
      saveNames();
      renderList();
      drawWheel().catch(console.error);
    });

  // Secret page controls: toggle ban/unban (switch)
  if (isNamesRouteActive()){
    const wrapper = document.createElement("label");
    wrapper.className = "toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    const remaining = getBanRemaining(n);
    // ON means active (not banned)
    input.checked = remaining === 0;
    input.addEventListener("change", () => {
      if (spinning) return;
      if (input.checked){
        clearBan(n);
      } else {
        setBan(n, 3);
      }
      renderList();
      drawWheel().catch(console.error);
    });
    wrapper.appendChild(input);
    actions.appendChild(wrapper);
  }

    actions.appendChild(del);
    li.appendChild(tag);
    li.appendChild(actions);
    if (getBanRemaining(n) > 0){
      li.classList.add("banned");
      const remain = document.createElement("span");
      remain.className = "remain";
      remain.textContent = `(${getBanRemaining(n)} spins)`;
      tag.appendChild(remain);
    }
    nameList.appendChild(li);
  });
  
  // Show/hide unban all toggle based on whether there are any banned names
  if (unbanAllToggle) {
    const hasBannedNames = names.some(n => getBanRemaining(n) > 0);
    const unbanAllControls = unbanAllToggle.closest('.unban-all-controls');
    if (unbanAllControls) {
      unbanAllControls.style.display = hasBannedNames ? 'block' : 'none';
    }
  }
}

function removeHistoryEntry(index){
  if (!Number.isInteger(index) || index < 0 || index >= history.length) {
    return;
  }
  const [removed] = history.splice(index, 1);
  saveHistory();
  renderHistory();
  renderFullHistory();
  console.log('History entry removed:', removed);
}

function renderHistory(){
  if (!historyList) return;
  historyList.innerHTML = "";
  // Show only the most recent 10 while keeping full history in storage
  const toShow = history.slice(0, 10);
  toShow.forEach((item, index) => {
    const actualIndex = index;
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = item.who;
    const when = document.createElement("span");
    when.className = "when";
    try{
      const d = new Date(item.when);
      when.textContent = d.toLocaleDateString('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }catch(_e){ when.textContent = ""; }
    li.appendChild(who);
    li.appendChild(when);
    historyList.appendChild(li);
  });
}

function renderFullHistory(){
  if (!historyListFull) return;
  historyListFull.innerHTML = "";
  history.forEach((item, index) => {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = item.who;
    const when = document.createElement("span");
    when.className = "when";
    try{
      const d = new Date((item.when));
      when.textContent = d.toLocaleDateString('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }catch(_e){ when.textContent = ""; }
    li.appendChild(who);
    li.appendChild(when);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger history-remove";
    removeBtn.textContent = "Verwijder";
    removeBtn.addEventListener("click", () => {
      if (!confirm(`Weet je zeker dat je ${item.who} (${new Date(item.when).toLocaleString()}) wilt verwijderen?`)) {
        return;
      }
      removeHistoryEntry(index);
    });
    li.appendChild(removeBtn);
    historyListFull.appendChild(li);
  });
}

// Enhanced Confetti for THE moment
function burstConfetti(){
  const container = document.createElement("div");
  container.className = "confetti";
  const pieces = 200; // More pieces for more drama
  
  // Create multiple bursts for extra spectacle
  for (let burst = 0; burst < 3; burst++) {
    setTimeout(() => {
      for (let i = 0; i < pieces / 3; i++){
        const el = document.createElement("i");
        // Use warm cookie colors
        const hue = 20 + Math.random() * 40; // Orange/yellow range
        el.style.background = `hsl(${hue} 90% 60%)`;
        el.style.left = Math.random() * 100 + "%";
        el.style.top = "-10px";
        const delay = Math.random() * 120;
        const duration = 1500 + Math.random() * 1500;
        const translateX = (Math.random() - 0.5) * 300; // Wider spread
        const rotate = Math.random() * 1080; // More rotation
        const scale = 0.5 + Math.random() * 1.5; // Variable size
        
        el.animate([
          { transform: `translate(0, 0) rotate(0deg) scale(${scale})`, opacity: 1 },
          { transform: `translate(${translateX}px, 110vh) rotate(${rotate}deg) scale(${scale * 0.5})`, opacity: 0.9 }
        ], { duration, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
        container.appendChild(el);
      }
    }, burst * 200); // Staggered bursts
  }
  
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 4000);
}

function showWinnerPopup(winnerName){
  if (!winnerModal || !winnerNameEl) {
    console.log('Modal elements not found:', { winnerModal, winnerNameEl });
    return;
  }
  
  console.log('Showing popup for:', winnerName);
  // Set popup as active
  isWinnerPopupActive = true;
  
  // Stage 1: show no name initially; reveal real winner after animation
  if (winnerRevealTimer) {
    clearTimeout(winnerRevealTimer);
    winnerRevealTimer = null;
  }
  if (winnerAnimationWaitTimer) {
    clearTimeout(winnerAnimationWaitTimer);
    winnerAnimationWaitTimer = null;
  }
  winnerNameEl.textContent = "";
  winnerModal.removeAttribute('hidden');
  
  // Simple close function
  const closeModal = () => {
    console.log('Closing modal');
    winnerModal.setAttribute('hidden', '');
    if (winnerRevealTimer) {
      clearTimeout(winnerRevealTimer);
      winnerRevealTimer = null;
    }
    // Set popup as inactive and update UI to locked state
    isWinnerPopupActive = false;
    renderPostWinState();
  };
  
  // Add simple click handlers
  if (closeWinnerModal) {
    closeWinnerModal.onclick = closeModal;
  }
  
  // Add revert button handler
  if (revertFromPopupBtn) {
    revertFromPopupBtn.onclick = () => {
      closeModal();
      revertLastSpin();
    };
  }
  
  winnerModal.onclick = (e) => {
    if (e.target === winnerModal) {
      closeModal();
    }
  };
  
  // Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  });

  // Stage 2: reveal only AFTER the popup is fully on-screen (animation finished)
  const startRevealTimer = () => {
    if (winnerRevealTimer) {
      clearTimeout(winnerRevealTimer);
    }
    // Immediately show Victor when the modal is fully visible
    if (!winnerModal.hasAttribute('hidden')) {
      winnerNameEl.textContent = "Victor";
    }
    // After the configured delay, swap to the real winner
    winnerRevealTimer = setTimeout(() => {
      if (!winnerModal.hasAttribute('hidden')) {
        winnerNameEl.textContent = winnerName;
      }
      winnerRevealTimer = null;
    }, VICTOR_PRE_REVEAL_MS);
  };

  const contentEl = winnerModal.querySelector('.winner-modal-content');
  if (contentEl) {
    const cs = getComputedStyle(contentEl);
    const durations = (cs.animationDuration || '0s')
      .split(',')
      .map(s => s.trim())
      .map(s => s.endsWith('ms') ? parseFloat(s) : s.endsWith('s') ? parseFloat(s) * 1000 : 0);
    const maxDurationMs = Math.max(0, ...durations);
    let started = false;
    const safelyStart = () => {
      if (started) return;
      started = true;
      startRevealTimer();
    };
    if (maxDurationMs > 0) {
      contentEl.addEventListener('animationend', safelyStart, { once: true });
      // Fallback in case animationend doesn't fire
      winnerAnimationWaitTimer = setTimeout(safelyStart, maxDurationMs);
    } else {
      // No animation detected; start immediately
      startRevealTimer();
    }
  } else {
    // Structure changed; start immediately
    startRevealTimer();
  }
}

// Events
if (spinButton) {
  spinButton.addEventListener("click", spin);
}

if (randomKoekBtn){
  randomKoekBtn.addEventListener('click', () => {
    // List of all cookie pages (including error.html)
    const cookiePages = [
      'bitterkoekjes.html',
      'bokkepootjes.html',
      'cafenoir.html',
      'chocolatechipcookie.html',
      'error.html',
      'gevuldekoeken.html',
      'janhagel.html',
      'jodenkoeken.html',
      'kandijkoek.html',
      'kletskoppen.html',
      'kokoskoekjes.html',
      'kokosmakroon.html',
      'langevinger.html',
      'liga.html',
      'mariabiscuit.html',
      'scholiertjes.html',
      'speculaas.html',
      'speculaasbrokken.html',
      'sprenkeltjes.html',
      'spritsen.html',
      'stroopwafel.html'
    ];
    
    // Select a random page
    const randomIndex = Math.floor(Math.random() * cookiePages.length);
    const randomPage = cookiePages[randomIndex];
    
    // Navigate to the random koek page
    window.location.href = `Random_Koeken_Pagina/${randomPage}`;
  });
}

// Stats button click handler
if (statsBtn){
  statsBtn.addEventListener('click', () => {
    window.location.href = 'stats.html';
  });
}

// Suggestions button click handler
if (suggestionsBtn){
  suggestionsBtn.addEventListener('click', () => {
    window.open('https://www.ah.nl/producten/1246/koek', '_blank');
  });
}

// Unban all toggle event
if (unbanAllToggle) {
  unbanAllToggle.addEventListener("change", (e) => {
    if (e.target.checked) {
      unbanAllNames();
      // Uncheck the toggle after use
      setTimeout(() => {
        unbanAllToggle.checked = false;
      }, 100);
    }
  });
}

// Revert last spin button (Niet aanwezig) - use event delegation to handle dynamic elements
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'revertLastSpinBtn') {
    console.log('Revert button clicked!');
    revertLastSpin();
  }
});

nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!isNamesRouteActive()) return; // only allow adding on secret names page
  const value = nameInput.value.trim();
  if (!value) return;
  if (spinning) return;
  names.push(value);
  colors = generateColors(names.length);
  nameInput.value = "";
  saveNames();
  renderList();
  drawWheel().catch(console.error);
});

clearAllBtn.addEventListener("click", () => {
  if (spinning) return;
  if (!confirm("Weet je zeker dat je alle klusclub leden wilt weghalen?")) return;
  names = [];
  colors = [];
  saveNames();
  renderList(); 
  drawWheel().catch(console.error);
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(names, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "names.json";
  a.click();
  URL.revokeObjectURL(url);
});

importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.every(s => typeof s === "string" && s.trim().length)){
      names = arr.map(s => s.trim());
      colors = generateColors(names.length);
      saveNames();
      renderList();
      drawWheel().catch(console.error);
    } else {
      alert("Invalid JSON. Should be an array of non-empty strings.");
    }
  } catch(err){
    alert("Failed to import file.");
  } finally {
    importFile.value = "";
  }
});

// Secret page: clear history
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
if (clearHistoryBtn){
  clearHistoryBtn.addEventListener("click", () => {
    // Show password modal instead of direct confirmation
    showClearHistoryAuth();
  });
}

// Clear history auth modal functions
function showClearHistoryAuth(){
  const modal = document.getElementById('clearHistoryAuthModal');
  const input = document.getElementById('clearHistoryAuthInput');
  const error = document.getElementById('clearHistoryAuthError');
  
  if (modal && input && error) {
    modal.removeAttribute('hidden');
    input.value = '';
    if (!error.dataset.defaultMessage){
      error.dataset.defaultMessage = error.textContent || '';
    }
    error.textContent = error.dataset.defaultMessage;
    error.setAttribute('hidden', '');
    input.focus();
  }
}

function hideClearHistoryAuth(){
  const modal = document.getElementById('clearHistoryAuthModal');
  if (modal) {
    modal.setAttribute('hidden', '');
  }
}

function clearHistoryWithAuth(){
  const warningMessage = "⚠️ WAARSCHUWING ⚠️\n\n" +
                        "Als je de geschiedenis leegmaakt, worden ook alle statistieken gereset!\n\n" +
                        "Dit betekent dat:\n" +
                        "• Alle winnaars worden verwijderd\n" +
                        "• Totaal aantal spins wordt gereset naar 0\n" +
                        "• Seizoensstatistieken per jaar verdwijnen\n" +
                        "• Winsten per naam worden gereset naar 0\n" +
                        "• Deze actie kan niet ongedaan worden gemaakt\n\n" +
                        "Weet je zeker dat je wilt doorgaan?";
  
  if (!confirm(warningMessage)) return;
  
  history = [];
  saveHistory();
  renderHistory();
  renderFullHistory();
  hideClearHistoryAuth();
}

// Secret page: reset post-win lock
const resetPostWinBtn = document.getElementById('resetPostWinBtn');
if (resetPostWinBtn){
  resetPostWinBtn.addEventListener('click', () => {
    clearPostWinLock();
    // Navigate home so users can spin again and see the wheel return
    navigateTo('/kandijkoek');
  });
}

// Auto-reset controls
if (autoResetToggle && autoResetDay && autoResetTime) {
  // Load and apply saved settings
  const settings = loadAutoResetSettings();
  autoResetToggle.checked = settings.enabled;
  autoResetDay.value = settings.day;
  autoResetTime.value = settings.time;
  
  // Update status display
  updateAutoResetStatus();
  
  // Toggle change handler
  autoResetToggle.addEventListener('change', () => {
    const newSettings = {
      enabled: autoResetToggle.checked,
      day: parseInt(autoResetDay.value),
      time: autoResetTime.value
    };
    saveAutoResetSettings(newSettings);
    updateAutoResetStatus();
  });
  
  // Day/time change handlers
  autoResetDay.addEventListener('change', () => {
    if (autoResetToggle.checked) {
      const newSettings = {
        enabled: true,
        day: parseInt(autoResetDay.value),
        time: autoResetTime.value
      };
      saveAutoResetSettings(newSettings);
      updateAutoResetStatus();
    }
  });
  
  autoResetTime.addEventListener('change', () => {
    if (autoResetToggle.checked) {
      const newSettings = {
        enabled: true,
        day: parseInt(autoResetDay.value),
        time: autoResetTime.value
      };
      saveAutoResetSettings(newSettings);
      updateAutoResetStatus();
    }
  });
}

// Cookie consent event listeners
if (acceptCookiesBtn) {
  acceptCookiesBtn.addEventListener('click', () => {
    setCookieConsent(true);
    hideCookieModal();
    // Initialize the app after accepting cookies
    renderList();
    if (canvas && ctx) drawWheel().catch(console.error);
    renderHistory();
    renderFullHistory();
    loadWinnerMessages();
  });
}

if (rejectCookiesBtn) {
  rejectCookiesBtn.addEventListener('click', () => {
    setCookieConsent(false);
    hideCookieModal();
    showBrokenPage();
  });
}

// Debug controls event listeners (only on Kandijkoek page)
if (cookieConsentToggle) {
  // Load current debug state
  const currentDebugState = getDebugCookieConsent();
  cookieConsentToggle.checked = currentDebugState;
  console.log('Debug toggle loaded:', currentDebugState);
  
  cookieConsentToggle.addEventListener('change', () => {
    console.log('Debug toggle changed to:', cookieConsentToggle.checked);
    setDebugCookieConsent(cookieConsentToggle.checked);
  });
}

// Clear history auth modal event listeners
const clearHistoryAuthForm = document.getElementById('clearHistoryAuthForm');
const clearHistoryAuthInput = document.getElementById('clearHistoryAuthInput');
const clearHistoryAuthSubmit = document.getElementById('clearHistoryAuthSubmit');
const clearHistoryAuthCancel = document.getElementById('clearHistoryAuthCancel');
const clearHistoryAuthError = document.getElementById('clearHistoryAuthError');

if (clearHistoryAuthForm) {
  const defaultClearHistoryErrorMessage = clearHistoryAuthError ? clearHistoryAuthError.textContent : '';
  clearHistoryAuthForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = clearHistoryAuthInput.value.trim();
    if (clearHistoryAuthError){
      const defaultMsg = clearHistoryAuthError.dataset?.defaultMessage ?? defaultClearHistoryErrorMessage;
      clearHistoryAuthError.textContent = defaultMsg;
      clearHistoryAuthError.setAttribute('hidden', '');
    }

    const verificationResult = await verifyPassword(password, CLEAR_HISTORY_PASSWORD_HASH);
    if (verificationResult === true) {
      clearHistoryWithAuth();
    } else if (verificationResult === null) {
      if (clearHistoryAuthError) {
        clearHistoryAuthError.textContent = 'Beveiligde verificatie wordt niet ondersteund in deze browser.';
        clearHistoryAuthError.removeAttribute('hidden');
      }
      clearHistoryAuthInput.value = '';
      clearHistoryAuthInput.focus();
    } else {
      if (clearHistoryAuthError){
        const defaultMsg = clearHistoryAuthError.dataset?.defaultMessage ?? defaultClearHistoryErrorMessage;
        clearHistoryAuthError.textContent = defaultMsg || 'Onjuist wachtwoord';
        clearHistoryAuthError.removeAttribute('hidden');
      }
      clearHistoryAuthInput.value = '';
      clearHistoryAuthInput.focus();
    }
  });
}

if (clearHistoryAuthCancel) {
  clearHistoryAuthCancel.addEventListener('click', () => {
    hideClearHistoryAuth();
  });
}

// Close modal when clicking outside
const clearHistoryAuthModal = document.getElementById('clearHistoryAuthModal');
if (clearHistoryAuthModal) {
  clearHistoryAuthModal.addEventListener('click', (e) => {
    if (e.target === clearHistoryAuthModal) {
      hideClearHistoryAuth();
    }
  });
}



// On each successful spin, decrement bans
function decrementBans(){
  if (!Array.isArray(bans) || bans.length === 0) return;
  let changed = false;
  for (const b of bans){
    if (b.remaining > 0){
      b.remaining -= 1;
      changed = true;
    }
  }
  if (changed){
    bans = bans.filter(b => b.remaining > 0);
    saveBans();
  }
}

// Cookie consent controlled by debug toggle for testing:
// - debug ON  => always suppress cookie modal (treat as consented)
// - debug OFF => always show cookie modal (ignore stored consent)
const storedConsent = hasCookieConsent();
const debugMode = getDebugCookieConsent();
const effectiveConsent = debugMode ? true : false;
console.log('Cookie consent check:', { storedConsent, debugMode, effectiveConsent });

if (!effectiveConsent) {
  console.log('Showing cookie modal (forced by debug OFF)');
  showCookieModal();
} else {
  console.log('Skipping cookie modal');
  hideCookieModal();
}

// Always initialize core UI so lists/history are not empty on any route
renderList();
if (canvas && ctx) drawWheel().catch(console.error);
renderHistory();
renderFullHistory();
loadWinnerMessages();

// Initialize auto-reset checker
setInterval(() => {
  checkAutoReset();
  updateAutoResetStatus();
}, 10000); // Check every 10 seconds for testing

// Initialize route based on current URL. If served as a static file without server routing,
// direct navigation to /kandijkoek may 404; when loaded from root or in /kandijkoek/ folder, it works.
updateRoute(location.pathname);

// Reflect lock state once DOM is ready
renderPostWinState();

// Update suggestions button with current winner if locked
if (isPostWinLocked() && suggestionsWinnerName) {
  const winner = getLockedWinner();
  suggestionsWinnerName.textContent = winner || '';
}

// If no local lock exists but URL includes a winner hash, adopt it into lock
if (!isPostWinLocked()){
  const hashWinner = parseWinnerFromHash();
  if (hashWinner){
    setPostWinLock(hashWinner);
    renderPostWinState();
  }
}

// Ensure UI reacts if hash changes (e.g., user shares/edits link without reload)
window.addEventListener('hashchange', () => {
  const w = parseWinnerFromHash();
  if (w){
    setPostWinLock(w);
  } else {
    clearPostWinLock();
  }
  renderPostWinState();
});

// Resize handling for crisp canvas on DPR
function resizeCanvasForDPR(){
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Size canvas to fit inside the main container width and viewport height minus header/footer
  const container = document.querySelector('.wheel-canvas') || document.querySelector('.app-main');
  const containerWidth = container ? Math.floor(container.clientWidth) : window.innerWidth;
  const availableWidth = Math.max(280, containerWidth);
  const reservedVertical = 180; // header/footer + breathing room
  const availableHeight = Math.max(280, Math.floor(window.innerHeight - reservedVertical));
  const target = Math.min(availableWidth, availableHeight);
  const size = Math.min(720, target); // soft cap
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWheel().catch(console.error);
}

if (canvas && ctx) {
  resizeCanvasForDPR();
  window.addEventListener("resize", () => {
    resizeCanvasForDPR();
  });
}

// Keyboard: Space to spin (when not typing in inputs)
window.addEventListener('keydown', (e) => {
  const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
  if (!isSpace) return;
  const target = e.target;
  const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (isTyping) return;
  e.preventDefault();
  spin();
});

// Persist angle on page hide just in case
window.addEventListener('beforeunload', saveAngle);


