/*
 * Hivemind for Twitch - Trending Chat Message Tracker
 * Copyright (C) 2024 Frank Fiumara
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Hivemind for Twitch + 7TV support
// - Tracks trending chat messages (prefers 7TV .text-token text)
// - Shows top 4 in a side panel
// - Shift + 1..4 fills (and optionally sends) the message

// Auto-send functionality removed

// Settings - will be loaded from storage
let SPAM_THRESHOLD = 4;
let MAX_ENTRIES = 4;
let WINDOW_MS = 300000; // 5 minutes - keep messages for 5 minutes
let WINDOW_MAX = 200;   // keep up to 200 messages in memory
let TRIM_INTERVAL_MS = 5000; // trim every 5 seconds (less aggressive)
let RENDER_THROTTLE_MS = 50;   // at most ~20 renders/sec (faster response)
let RAF_FALLBACK_MS = 200;     // fallback if rAF is throttled (background tabs)
let currentSettings = {
  showEmptyState: false,
  startMinimized: true
};

// Track current stream to detect navigation
let currentStreamUrl = '';
let currentChannel = '';
const messageCounts = {};
const messageTimestamps = {}; // track most recent occurrence of each message
let trendingTexts = [];
const processedIdMap = new Map();
const processedIdQueue = [];
let processedElements = new WeakMap();
const ELEMENT_REPROCESS_GRACE_MS = 120;
const PROCESSED_ID_LIMIT = 2000;
const messageTokens = new Map();
const recent = []; // queue of { text, ts }
let trimTimer = null;

// --- Logging --------------------------------------------------------------
const LOG_NS = 'HIVEMIND';
const LOG_STYLES = {
  ns: 'color:#F5E427;font-weight:700',
  tag: 'color:#9aa0a6',
  info: 'color:#7cb342',
  warn: 'color:#ff9100',
  error: 'color:#ef5350',
  debug: 'color:#64b5f6'
};
function log(tag, level, msg, ...args) {
  try {
    // Ultra-simple logging - just use console.log for everything
    const fullMsg = args.length > 0 ? `${msg} ${args.join(' ')}` : msg;
    console.log(`HIVEMIND [${tag}]: ${fullMsg}`);
  } catch (err) {
    // Ultimate fallback
    console.log(`HIVEMIND [${tag}]: ${msg}`);
  }
}
function info(tag, msg, ...args) { log(tag, 'info', msg, ...args); }
function warn(tag, msg, ...args) { log(tag, 'warn', msg, ...args); }
function error(tag, msg, ...args) { log(tag, 'error', msg, ...args); }
function debug(tag, msg, ...args) {
  // Enable verbose logs via localStorage: hivemind:debug = true
  let enabled = false;
  try { enabled = JSON.parse(localStorage.getItem('hivemind:debug') || 'false'); } catch {}
  if (enabled) log(tag, 'debug', msg, ...args);
}

// Panel - create immediately but don't append to body yet
const panel = document.createElement('div');
panel.id = 'hivemind-panel';
panel.style.display = 'none';
info('init', 'Panel created');

// Settings management
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get({
      spamThreshold: 4,
      maxEntries: 4,
      windowDuration: 5,
      maxMessages: 200,
      updateFrequency: 50,
      trimInterval: 5,
      startMinimized: true,
      showEmptyState: false
    });
    
    SPAM_THRESHOLD = result.spamThreshold;
    MAX_ENTRIES = result.maxEntries;
    WINDOW_MS = result.windowDuration * 60 * 1000; // convert minutes to ms
    WINDOW_MAX = result.maxMessages;
    RENDER_THROTTLE_MS = result.updateFrequency;
    TRIM_INTERVAL_MS = result.trimInterval * 1000; // convert seconds to ms
    
    // Store UI settings
    currentSettings.showEmptyState = result.showEmptyState;
    currentSettings.startMinimized = result.startMinimized;
    
    info('settings', 'Loaded settings from storage');
    return result;
  } catch (error) {
    warn('settings', 'Failed to load settings, using defaults:', error);
    return null;
  }
}

function updateSettings(newSettings) {
  if (newSettings.spamThreshold !== undefined) SPAM_THRESHOLD = newSettings.spamThreshold;
  if (newSettings.maxEntries !== undefined) MAX_ENTRIES = newSettings.maxEntries;
  if (newSettings.windowDuration !== undefined) WINDOW_MS = newSettings.windowDuration * 60 * 1000;
  if (newSettings.maxMessages !== undefined) WINDOW_MAX = newSettings.maxMessages;
  if (newSettings.updateFrequency !== undefined) RENDER_THROTTLE_MS = newSettings.updateFrequency;
  if (newSettings.trimInterval !== undefined) TRIM_INTERVAL_MS = newSettings.trimInterval * 1000;
  
  // Update UI settings
  if (newSettings.showEmptyState !== undefined) currentSettings.showEmptyState = newSettings.showEmptyState;
  if (newSettings.startMinimized !== undefined) currentSettings.startMinimized = newSettings.startMinimized;
  
  info('settings', 'Settings updated');
  schedulePanelUpdate();
}

// Clear all message data when navigating to a new stream
function clearMessageData() {
  // Clear all message tracking data
  Object.keys(messageCounts).forEach(key => delete messageCounts[key]);
  Object.keys(messageTimestamps).forEach(key => delete messageTimestamps[key]);
  messageTokens.clear();
  trendingTexts = [];
  recent.length = 0;
  
  // Clear processed message tracking
  processedIdMap.clear();
  processedIdQueue.length = 0;
  processedElements = new WeakMap();
  
  // Reset panel content to force update
  lastPanelContent = '';
  
  info('navigation', 'Cleared message data for new stream');
  schedulePanelUpdate();
}

// Detect stream/channel changes
function checkForStreamChange() {
  const currentUrl = window.location.href;
  const urlMatch = currentUrl.match(/twitch\.tv\/([^\/\?]+)/);
  const newChannel = urlMatch ? urlMatch[1] : '';
  
  // Check if we've navigated to a different stream/channel
  if (currentChannel && currentChannel !== newChannel) {
    info('navigation', `Stream changed from ${currentChannel} to ${newChannel}`);
    clearMessageData();
  }
  
  // Update tracking variables
  currentStreamUrl = currentUrl;
  currentChannel = newChannel;
}

// Listen for settings updates from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    updateSettings(message.settings);
  }
});

// Settings removed

// Utility
function escapeHtml(s) {
  return (s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// Token helpers (7TV + Twitch) for emote-aware parsing/rendering
function parseSrcset(srcset) {
  if (!srcset) return '';
  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1].split(' ')[0];
  return last ? (last.startsWith('//') ? `https:${last}` : last) : '';
}

function extractMessageTokens(node) {
  if (!node) return [];
  // Prefer 7TV body
  const body7 = node.querySelector('.seventv-chat-message-body');
  if (body7) {
    const ordered = Array.from(body7.querySelectorAll('.text-token, img.seventv-chat-emote'));
    const tokens = ordered.map(el => {
      if (el.tagName === 'IMG') {
        const alt = el.getAttribute('alt') || '';
        const src = parseSrcset(el.getAttribute('srcset')) || el.getAttribute('src') || '';
        return src ? { kind: 'emote', alt, src } : { kind: 'text', text: alt };
      }
      return { kind: 'text', text: (el.textContent || '').trim() };
    }).filter(t => (t.kind === 'text' ? !!t.text : !!t.src || !!t.alt));
    return tokens;
  }
  // Twitch fallback
  const body = node.querySelector('[data-a-target="chat-line-message-body"]') || node;
  const ordered = Array.from(body.querySelectorAll('.text-fragment, .mention-fragment, img'));
  const tokens = ordered.map(el => {
    if (el.tagName === 'IMG') {
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || parseSrcset(el.getAttribute('srcset')) || '';
      return src ? { kind: 'emote', alt, src } : { kind: 'text', text: alt };
    }
    return { kind: 'text', text: (el.textContent || '').trim() };
  }).filter(t => (t.kind === 'text' ? !!t.text : !!t.src || !!t.alt));
  return tokens;
}

function tokensToText(tokens) {
  return tokens
    .map(t => t.kind === 'text' ? t.text : (t.alt || ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize a message key for counting (case/whitespace/zero-width insensitive)
function normalizeText(s) {
  if (!s) return '';
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width chars
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// TODO: Implement partial text recognition for v1.1
// This will allow fuzzy matching of similar messages to catch variations
// and consolidate trending counts for messages that are essentially the same
function findSimilarMessage(newMessage, existingMessages) {
  // Future implementation:
  // 1. Calculate similarity using Levenshtein distance or Jaro-Winkler
  // 2. Group similar messages under a canonical version
  // 3. Increment count when similarity threshold is met (e.g., 85% similar)
  // 4. Handle cases like "PogChamp" vs "pogchamp" vs "POGCHAMP"
  // 5. Add settings for similarity threshold and minimum length
  
  // For now, return null to use exact matching
  return null;
}

// TODO: Add similarity calculation function
function calculateSimilarity(str1, str2) {
  // Future implementation:
  // Use string similarity algorithms to determine how similar two messages are
  // Return percentage (0-100) of similarity
  // Consider using libraries like 'string-similarity' or implementing Levenshtein distance
  return 0;
}

function recordMessage(text, tokens, preNormalized) {
  if (!text) return false;
  const key = preNormalized || normalizeText(text);
  if (!key) return false;
  if (tokens && tokens.length && !messageTokens.has(key)) {
    messageTokens.set(key, tokens);
  }
  const now = Date.now();
  messageCounts[key] = (messageCounts[key] || 0) + 1;
  messageTimestamps[key] = now; // Update most recent timestamp
  if (messageCounts[key] === SPAM_THRESHOLD) {
    // Message reached threshold
  }
  recent.push({ text: key, ts: now });
  // Proactively request a panel refresh (rAF will coalesce bursts)
  schedulePanelUpdate();
  return true;
}

function trimWindow(nowTs) {
  const now = nowTs || Date.now();
  let trimmed = 0;
  
  // Only trim if we're over the limit or messages are very old
  while (recent.length && (
    (WINDOW_MAX > 0 && recent.length > WINDOW_MAX) ||
    (WINDOW_MS > 0 && (now - recent[0].ts) > WINDOW_MS)
  )) {
    const item = recent.shift();
    if (!item) break;
    const t = item.text;
    if (t in messageCounts) {
      messageCounts[t] -= 1;
      // Only remove from trending if count drops below threshold
      if (messageCounts[t] <= 0) {
        delete messageCounts[t];
        delete messageTimestamps[t];
        if (messageTokens.has(t)) messageTokens.delete(t);
      }
      trimmed++;
    }
  }
  
  // Only schedule update if we actually removed trending messages
  if (trimmed) {
    schedulePanelUpdate();
  }
}

function startWindowTrimTimer() {
  if (trimTimer) return;
  trimTimer = setInterval(() => trimWindow(), TRIM_INTERVAL_MS);
}

function extractMessageText(node) {
  if (!node) return '';

  // 7TV message body (preferred when present)
  const body7 = node.querySelector('.seventv-chat-message-body');
  if (body7) {
    // Use only .text-token per user requirement
    const tokens = Array.from(body7.querySelectorAll('.text-token'))
      .map(n => (n.textContent || '').trim())
      .filter(Boolean);
    const text = (tokens.length ? tokens.join(' ') : (body7.innerText || '').trim());
    const out = text.replace(/\s+/g, ' ').trim();
    // 7TV text parsed
    return out;
  }

  // Twitch default message body
  const body = node.querySelector('[data-a-target="chat-line-message-body"]') || node;
  const parts = Array.from(body.querySelectorAll('.text-fragment, .mention-fragment, .message-body, span'))
    .map(n => (n.innerText || n.textContent || '').trim())
    .filter(Boolean);
  const text = (parts.length ? parts.join(' ') : (body.innerText || '').trim());
  const out = text.replace(/\s+/g, ' ').trim();
  // Twitch text parsed
  return out;
}

function getTrending() {
  const sorted = Object.entries(messageCounts)
    .filter(([, count]) => count >= SPAM_THRESHOLD)
    .sort((a, b) => {
      // First sort by count (descending)
      if (b[1] !== a[1]) return b[1] - a[1];
      // If counts are equal, sort by most recent occurrence
      const aTs = messageTimestamps[a[0]] || 0;
      const bTs = messageTimestamps[b[0]] || 0;
      return bTs - aTs;
    })
    .slice(0, MAX_ENTRIES);
  trendingTexts = sorted.map(([key]) => key);
  return sorted;
}

// Render throttling variables moved to top with other settings
let panelUpdateScheduled = false;
let lastRenderTs = 0;
let lastPanelContent = '';   // track last rendered content to prevent unnecessary updates
let panelDelayId = null;     // delay before attempting render
let panelFallbackId = null;  // fallback if rAF starves
let rafId = null;
function schedulePanelUpdate() {
  if (panelUpdateScheduled) return;
  panelUpdateScheduled = true;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const elapsed = now - lastRenderTs;
  const delay = Math.max(0, RENDER_THROTTLE_MS - elapsed);

  const run = () => {
    if (rafId) { try { cancelAnimationFrame(rafId); } catch {} rafId = null; }
    if (panelDelayId) { clearTimeout(panelDelayId); panelDelayId = null; }
    if (panelFallbackId) { clearTimeout(panelFallbackId); panelFallbackId = null; }
    panelUpdateScheduled = false;
    const ts = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    lastRenderTs = ts;
    updatePanel();
  };

  const scheduleNow = () => {
    if (panelDelayId) { clearTimeout(panelDelayId); panelDelayId = null; }
    try { rafId = requestAnimationFrame(run); } catch { setTimeout(run, 0); }
    // Always set a fallback timer to guarantee progress if rAF is throttled
    if (panelFallbackId) { clearTimeout(panelFallbackId); }
    panelFallbackId = setTimeout(run, RAF_FALLBACK_MS);
  };

  if (delay <= 0) {
    scheduleNow();
  } else {
    panelDelayId = setTimeout(scheduleNow, delay);
  }
}

function updatePanel() {
  const trending = getTrending();
  const entries = trending.map(([key], i) => {
    const tokens = messageTokens.get(key) || [{ kind: 'text', text: key }];
    const html = tokens.map(t => {
      if (t.kind === 'emote') {
        const alt = escapeHtml(t.alt || '');
        const src = escapeHtml(t.src || '');
        return `<img class="hm-emote" src="${src}" alt="${alt}" title="${alt}"/>`;
      }
      return `<span class="hm-text">${escapeHtml(t.text)}</span>`;
    }).join(' ');
    return `<div class="entry" data-index="${i}"><span class="index">${i + 1}</span><span class="msg">${html}</span></div>`;
  }).join('');

  // Safely get extension URL with error handling
  let iconUrl = 'temp.png'; // fallback
  try {
    if (chrome && chrome.runtime && chrome.runtime.getURL) {
      iconUrl = chrome.runtime.getURL('temp.png');
    }
  } catch (e) {
    // Extension context invalidated, use fallback
    iconUrl = 'temp.png';
  }

  const newContent = `
    <div class="header">
      <div class="title">
        <img src="${iconUrl}" class="hivemind-icon" alt="Hivemind" />
        <span class="count">${trending.length}</span>
      </div>
    </div>
    <div class="entries">${entries || (currentSettings.showEmptyState ? '<div class="empty">…</div>' : '')}</div>
  `;

  // Only update if content has actually changed
  if (newContent === lastPanelContent) {
    return;
  }
  
  lastPanelContent = newContent;
  panel.innerHTML = newContent;

  // Event listeners attached

  panel.querySelectorAll('.entry').forEach(el => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-index'));
      triggerSlot(index + 1);
    });
  });

  // Panel click handling
  panel.addEventListener('click', e => {
    const entry = e.target && e.target.closest && e.target.closest('.entry');
    if (entry) {
      const index = Number(entry.getAttribute('data-index'));
      triggerSlot(index + 1);
    }
  });

  // Panel rendered

  // Click event is now bound in attachPanelToHeader()
}

function flash(el) {
  if (!el) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 200);
}

function triggerSlot(i) {
  const entry = panel.querySelectorAll('.entry')[i - 1];
  if (!entry) return;
  const key = trendingTexts[i - 1];
  if (!key) return;
  const tokens = messageTokens.get(key);
  const sendText = tokens ? tokensToText(tokens) : key;
  // Keybind triggered
  fillChatInput(sendText, false); // Never auto-send
  flash(entry);
}

function getChatInputElement() {
  // Prefer Slate editor
  return (
    document.querySelector('div[role="textbox"][data-a-target="chat-input"][contenteditable="true"][data-slate-editor="true"]') ||
    document.querySelector('.chat-wysiwyg-input__editor[contenteditable="true"][data-slate-editor="true"]') ||
    document.querySelector('textarea[data-a-target="chat-input"]') ||
    document.querySelector('[data-a-target="chat-input"][contenteditable="true"], div[data-a-target="chat-input"]')
  );
}

function simulateUserFocus(el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = Math.max(1, Math.floor(rect.left + Math.min(10, Math.max(1, rect.width / 4))));
  const y = Math.max(1, Math.floor(rect.top + Math.min(10, Math.max(1, rect.height / 2))));
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, composed: true };
  
  // More comprehensive focus simulation
  try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch { el.dispatchEvent(new MouseEvent('mousedown', opts)); }
  try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch {}
  try { el.dispatchEvent(new FocusEvent('focus', { bubbles: true })); } catch {}
  try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
  try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch { el.dispatchEvent(new MouseEvent('mouseup', opts)); }
  try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch {}
  try { el.dispatchEvent(new MouseEvent('click', opts)); } catch {}
  try { el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); } catch {}
}

// Ensure chat input regains keyboard focus after programmatic edits.
function ensureInputFocus(el) {
  if (!el) return;
  const attemptFocus = () => {
    try { 
      el.focus({ preventScroll: true }); 
      // For Slate editors, also try to set cursor position
      if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch { 
      try { el.focus(); } catch {} 
    }
  };
  
  // Multiple attempts with increasing delays
  attemptFocus();
  if (document.activeElement !== el) {
    setTimeout(attemptFocus, 0);
  }
  if (document.activeElement !== el) {
    setTimeout(attemptFocus, 50);
  }
  if (document.activeElement !== el) {
    setTimeout(attemptFocus, 100);
  }
}

function clearSlate(editor) {
  try {
    // Clear content gently
    editor.innerHTML = '';
    
    // Set cursor at the beginning
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(editor, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    
    // Fire minimal input events to notify Slate.js
    editor.dispatchEvent(new InputEvent('input', { 
      bubbles: true, 
      inputType: 'deleteContentBackward',
      data: ''
    }));
    
  } catch (err) {
    // Ultimate fallback: just clear the content
    editor.innerHTML = '';
  }
}

function insertSlate(editor, text) {
  try {
    // First ensure the editor is focused
    editor.focus();
    
    // Clear any existing content more gently
    editor.innerHTML = '';
    
    // Insert the text as a single text node
    const textNode = document.createTextNode(text);
    editor.appendChild(textNode);
    
    // Set cursor at the end of the text with proper selection
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    
    // Fire events to notify Slate.js but don't interfere with normal editing
    editor.dispatchEvent(new InputEvent('beforeinput', { 
      bubbles: true, 
      inputType: 'insertText',
      data: text,
      cancelable: false
    }));
    
    editor.dispatchEvent(new InputEvent('input', { 
      bubbles: true, 
      inputType: 'insertText',
      data: text
    }));
    
    // Ensure the editor remains focused and editable
    setTimeout(() => {
      editor.focus();
      // Make sure cursor is still at the end
      const range = document.createRange();
      const sel = window.getSelection();
      if (textNode.parentNode === editor) {
        range.setStart(textNode, textNode.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 10);
    
  } catch (err) {
    // Ultimate fallback
    editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function fillChatInput(text, sendNow) {
  const el = getChatInputElement();
  if (!el) return;
  
  // Debounce rapid insertions
  const now = Date.now();
  if (now - lastFillTime < FILL_DEBOUNCE_MS) {
    return; // Skip this insertion to prevent duplicates
  }
  lastFillTime = now;
  
  // Scroll into view subtly so focus is not blocked
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
  
  // Focus first, then fill
  simulateUserFocus(el);
  ensureInputFocus(el);
  
  // Wait a bit for focus to settle, then fill
  setTimeout(() => {
    // Double-check focus before proceeding
    if (document.activeElement !== el) {
      el.focus();
    }
    
    if (el.tagName === 'TEXTAREA') {
      // Clear completely first
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      const setter = desc && desc.set;
      if (setter) setter.call(el, ''); else el.value = '';
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Insert fresh text
      if (setter) setter.call(el, text); else el.value = text;
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })); } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      try { el.selectionStart = el.selectionEnd = text.length; } catch {}
      ensureInputFocus(el);
      // Textarea filled
      if (sendNow) clickSendButton();
      return;
    }

    // Slate/contenteditable path - improved handling with better clearing
    clearSlate(el);
    
    // Longer delay to ensure clear operation completes
    setTimeout(() => {
      // Double-check that editor is actually empty before inserting
      if (el.textContent.trim() === '' && el.innerHTML.trim() === '') {
        insertSlate(el, text);
        
        // Final focus check and cursor positioning
        setTimeout(() => {
          ensureInputFocus(el);
          // Contenteditable filled
          if (sendNow) clickSendButton();
        }, 10);
      } else {
        // If still not empty, try clearing again
        clearSlate(el);
        setTimeout(() => {
          insertSlate(el, text);
          setTimeout(() => {
            ensureInputFocus(el);
            if (sendNow) clickSendButton();
          }, 10);
        }, 20);
      }
    }, 50); // Increased delay to ensure clearing completes
  }, 100); // Increased delay to ensure focus is properly established
}

function clickSendButton() {
  const btn = document.querySelector('[data-a-target="chat-send-button"]');
  if (btn) {
    btn.click();
    // Send button clicked
  } else {
    warn('input', 'Send button not found');
  }
}

// Chat mutation observer (scoped to chat container)
let chatObserver = null;
let chatObserverPoll = null;
let lastObserverActivity = 0;
let observerRestartCount = 0;

const MESSAGE_SELECTORS = [
  '.seventv-chat-message-background',
  '.seventv-user-message',
  '.seventv-chat-message-body',
  '[data-test-selector="chat-line-message"]',
  '.chat-line__message',
  '[data-a-target="chat-line-message-body"]'
].join(',');

const TOKEN_SELECTORS = [
  '.seventv-chat-message-body .text-token',
  '[data-a-target="chat-line-message-body"] .text-fragment'
].join(',');

function resolveMessageElement(el) {
  if (!el) return null;
  // Prefer 7TV message wrapper if available
  const msg7 = el.closest ? (el.closest('.seventv-user-message') || el.closest('.seventv-chat-message-background')) : null;
  if (msg7) return msg7;
  // Fallback to Twitch
  const msgTw = el.closest ? (el.closest('[data-test-selector="chat-line-message"]') || el.closest('.chat-line__message')) : null;
  if (msgTw) return msgTw;
  // As last resort, return the element itself
  return el;
}

function processMessageEl(el) {
  const msgEl = resolveMessageElement(el);
  if (!msgEl) return false;

  // Deduplicate via ID or element reference
  const id = msgEl.getAttribute ? (
    msgEl.getAttribute('msg-id') ||
    msgEl.getAttribute('data-msg-id') ||
    msgEl.getAttribute('data-id') ||
    msgEl.getAttribute('id') ||
    msgEl.dataset?.messageId ||
    msgEl.dataset?.id
  ) : null;
  const tokens = extractMessageTokens(msgEl);
  const text = tokensToText(tokens);
  if (!text) return false;
  const signature = normalizeText(text);
  if (!signature) return false;

  const now = Date.now();

  if (id) {
    const prev = processedIdMap.get(id);
    if (prev && prev.signature === signature) return false;
    processedIdMap.set(id, { signature, ts: now });
    processedIdQueue.push(id);
    if (processedIdQueue.length > PROCESSED_ID_LIMIT) {
      const oldId = processedIdQueue.shift();
      if (oldId) processedIdMap.delete(oldId);
    }
  } else {
    const prev = processedElements.get(msgEl);
    // Increase grace period to prevent reprocessing
    if (prev && prev.signature === signature && (now - prev.ts) < (ELEMENT_REPROCESS_GRACE_MS * 2)) return false;
    processedElements.set(msgEl, { signature, ts: now });
  }

  recordMessage(text, tokens, signature);
  // Message counted
  return true;
}

function handleChatMutations(mutations) {
  let changed = false;
  let added = 0;
  let errors = 0;

  const visitNode = (node) => {
    try {
      if (!node) return;
      const nodeType = node.nodeType;
      if (nodeType === 1) {
        const el = node;
        if (el.matches && el.matches(MESSAGE_SELECTORS)) {
          if (processMessageEl(el)) { changed = true; added++; }
          return;
        }
        if (el.querySelectorAll) {
          el.querySelectorAll(MESSAGE_SELECTORS).forEach(el2 => {
            if (processMessageEl(el2)) { changed = true; added++; }
          });
          // Also look for token-based additions (7TV/Twitch fragments)
          el.querySelectorAll(TOKEN_SELECTORS).forEach(tok => {
            const mEl = resolveMessageElement(tok);
            if (processMessageEl(mEl)) { changed = true; added++; }
          });
        }
        // If the node itself is a token
        if (el.matches && el.matches(TOKEN_SELECTORS)) {
          const mEl = resolveMessageElement(el);
          if (processMessageEl(mEl)) { changed = true; added++; }
        }
        return;
      }
      if (nodeType === 11 && node.childNodes && node.childNodes.length) {
        node.childNodes.forEach(child => visitNode(child));
      }
    } catch (err) {
      errors++;
      // Error processing node
    }
  };

  try {
    // Processing mutations
    for (const m of mutations) {
      // Processing mutation
      
      // Added nodes path
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(visitNode);
      }
      // Character data changes (e.g., token text updates)
      if (m.type === 'characterData' && m.target && m.target.parentElement) {
        const parent = m.target.parentElement;
        const msgEl = resolveMessageElement(parent);
        if (msgEl && processMessageEl(msgEl)) { changed = true; added++; }
      }
      // Also check for attribute changes that might indicate new messages
      if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
        const el = m.target;
        if (el.matches && el.matches(MESSAGE_SELECTORS)) {
          if (processMessageEl(el)) { changed = true; added++; }
        }
      }
    }
  } catch (err) {
    error('observer', 'Error in mutation handler: ' + err.message);
    errors++;
  }

  if (changed) {
    lastObserverActivity = Date.now();
    // Messages processed
    schedulePanelUpdate();
  } else if (errors > 0) {
    // Mutation handler had errors
  }
}

function findChatContainer() {
  // Try 7TV chat container first
  let container = document.querySelector('.seventv-chat-list, .seventv-message-container, .seventv-chat-scroller');
  if (container) return container;
  
  // Fallback to Twitch containers
  container = document.querySelector('[role="log"], .chat-scrollable-area__message-container, [data-a-target="chat-scroller"]');
  if (container) return container;
  
  // Last resort: find parent of any message element
  const msg = document.querySelector(MESSAGE_SELECTORS);
  if (msg && msg.parentElement) return msg.parentElement;
  return null;
}

function attachChatObserver() {
  if (chatObserver) return true;
  const container = findChatContainer();
  if (!container) {
    // No chat container found
    return false;
  }
  info('observer', 'Found chat container: ' + (container.className || container.tagName));
  chatObserver = new MutationObserver(handleChatMutations);
  chatObserver.observe(container, { childList: true, subtree: true, characterData: false, attributes: false }); // Reduced observer scope
  info('observer', 'Attached to chat container');
  // Seed counts from currently visible messages (light pass)
  try {
    let seeded = 0;
    const messageElements = container.querySelectorAll(MESSAGE_SELECTORS);
    // Found message elements
    messageElements.forEach(el => { if (processMessageEl(el)) seeded++; });
    container.querySelectorAll(TOKEN_SELECTORS).forEach(tok => { if (processMessageEl(resolveMessageElement(tok))) seeded++; });
    // Seeded from visible messages
  } catch {}
  schedulePanelUpdate();
  
  // Optimized periodic refresh - less frequent and more efficient
  if (!window.hivemindRefreshInterval) {
    let lastUpdateTime = 0;
    window.hivemindRefreshInterval = setInterval(() => {
      const now = Date.now();
      // Only refresh if no updates in the last 5 seconds and we have messages
      if (Object.keys(messageCounts).length > 0 && (now - lastUpdateTime) > 5000) {
        schedulePanelUpdate();
        lastUpdateTime = now;
      }
      
      // Health check: restart observer if it's been inactive for too long
      if (chatObserver && (now - lastObserverActivity) > 15000 && observerRestartCount < 2) {
        warn('observer', 'Observer inactive for 15s, restarting... (attempt ' + (observerRestartCount + 1) + '/2)');
        chatObserver.disconnect();
        chatObserver = null;
        observerRestartCount++;
        setTimeout(() => {
          attachChatObserver();
        }, 2000);
      }
    }, 5000); // Check every 5 seconds instead of 2
  }
  
  return true;
}

let attachAttempts = 0;
let warnedNoContainer = false;
function attachFallbackObserver() {
  if (chatObserver) return true;
  chatObserver = new MutationObserver(handleChatMutations);
  chatObserver.observe(document, { childList: true, subtree: true, characterData: false, attributes: false }); // Reduced observer scope
  info('observer', 'Attached FALLBACK to document');
  // Seed from entire document once
  try {
    let seeded = 0;
    document.querySelectorAll(MESSAGE_SELECTORS).forEach(el => { if (processMessageEl(el)) seeded++; });
    document.querySelectorAll(TOKEN_SELECTORS).forEach(tok => { if (processMessageEl(resolveMessageElement(tok))) seeded++; });
    // Fallback seeded
  } catch {}
  schedulePanelUpdate();
  return true;
}

function startChatObserverPolling() {
  if (attachChatObserver()) return;
  if (chatObserverPoll) return;
  chatObserverPoll = setInterval(() => {
    attachAttempts++;
    if (attachChatObserver()) {
      clearInterval(chatObserverPoll);
      chatObserverPoll = null;
      return;
    }
    if (!warnedNoContainer && attachAttempts === 1) {
      warn('observer', 'Chat container not found yet, polling...');
      warnedNoContainer = true;
    }
    if (attachAttempts >= 3) { // Reduced from 5 to 3 attempts
      clearInterval(chatObserverPoll);
      chatObserverPoll = null;
      attachFallbackObserver();
    }
  }, 2000); // Increased from 1000ms to 2000ms
}

// Mount panel into the channel header actions (next to Follow button)
let headerPoll = null;
let headerKeepalive = null;
let headerAttachAttempts = 0;
function findHeaderRightContainer() {
  return (
    document.querySelector('[data-target="channel-header-right"]') ||
    document.querySelector('[data-target="channel-header-actions-right"]') ||
    document.querySelector('[data-test-selector="channel-header-right"]') ||
    document.querySelector('[data-a-target="channel-header-right"]') ||
    null
  );
}

function attachPanelToHeader() {
  const container = findHeaderRightContainer();
  if (!container) return false;
  if (!panel.classList.contains('hm-inline')) {
    panel.classList.add('hm-inline');
  }
  if (panel.parentElement !== container) {
    container.appendChild(panel);
    panel.style.display = '';
    
    // Respect startMinimized setting
    if (!currentSettings.startMinimized) {
      panel.classList.add('open');
    }
    
    // Bind click event immediately when panel is attached
    if (!panel.dataset.hmBound) {
      panel.dataset.hmBound = '1';
      panel.addEventListener('click', (e) => {
        // Don't toggle if clicking on an entry
        if (e.target.closest('.entry')) return;
        panel.classList.toggle('open');
        // Dropdown toggled
      });
    }
    
    updatePanel();
    info('ui', 'Panel attached to channel header');
  }
  return true;
}

function startHeaderAttachPolling() {
  if (attachPanelToHeader()) return;
  if (headerPoll) return;
  headerPoll = setInterval(() => {
    headerAttachAttempts++;
    if (attachPanelToHeader()) {
      clearInterval(headerPoll);
      headerPoll = null;
      // keepalive to reattach after SPA navigations - less frequent
      if (!headerKeepalive) {
        headerKeepalive = setInterval(() => { attachPanelToHeader(); }, 10000); // Increased from 5000ms
      }
    } else if (headerAttachAttempts >= 2) { // Reduced from 3 to 2 attempts
      // Fallback: show as overlay so it doesn't disappear entirely
      if (panel.style.display === 'none') {
        panel.classList.remove('hm-inline');
        document.body.appendChild(panel);
        panel.style.display = '';
        // Bind click event for overlay mode
        if (!panel.dataset.hmBound) {
          panel.dataset.hmBound = '1';
          panel.addEventListener('click', (e) => {
            if (e.target.closest('.entry')) return;
            panel.classList.toggle('open');
          });
        }
        warn('ui', 'Header not found; showing overlay fallback');
      }
    }
  }, 2000); // Increased from 1000ms to 2000ms
}

// Manual refresh function for debugging
function forceRefreshMessages() {
  info('debug', 'Force refreshing messages...');
  const container = findChatContainer();
  if (container) {
    let refreshed = 0;
    container.querySelectorAll(MESSAGE_SELECTORS).forEach(el => { 
      if (processMessageEl(el)) refreshed++; 
    });
    container.querySelectorAll(TOKEN_SELECTORS).forEach(tok => { 
      if (processMessageEl(resolveMessageElement(tok))) refreshed++; 
    });
    // Force refresh processed
    schedulePanelUpdate();
  }
}

// Expose debug functions to window for manual testing
window.hivemindDebug = {
  forceRefresh: forceRefreshMessages,
  getCounts: () => messageCounts,
  getTrending: () => getTrending(),
  restartObserver: () => {
    if (chatObserver) {
      chatObserver.disconnect();
      chatObserver = null;
    }
    attachChatObserver();
  },
  testMessageProcessing: () => {
    console.log('=== TESTING MESSAGE PROCESSING ===');
    const container = findChatContainer();
    console.log('Container found:', container);
    if (container) {
      const messages = container.querySelectorAll(MESSAGE_SELECTORS);
      console.log('Messages found:', messages.length);
      messages.forEach((msg, i) => {
        if (i < 3) { // Test first 3 messages
          const text = extractMessageText(msg);
          const tokens = extractMessageTokens(msg);
          console.log(`Message ${i}:`, text, tokens);
        }
      });
    }
  },
  enableDebug: () => {
    localStorage.setItem('hivemind:debug', 'true');
    console.log('Debug mode enabled');
  }
};

// Init - wait for page to be ready
async function initializeHivemind() {
  info('init', 'Starting');
  await loadSettings();
  
  // Initialize stream tracking
  checkForStreamChange();
  
  startHeaderAttachPolling();
  startChatObserverPolling();
  startWindowTrimTimer();
  
  // Set up periodic stream change detection
  setInterval(checkForStreamChange, 2000); // Check every 2 seconds
  
  // Also listen for navigation events (for faster detection)
  window.addEventListener('popstate', checkForStreamChange);
  
  // updatePanel() will be called when panel is attached
}

// Optimized initialization - start immediately if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeHivemind);
} else {
  // DOM is ready, start immediately
  initializeHivemind();
}

// Keybinds: Shift + 1..4 with debouncing
let lastKeybindTime = 0;
const KEYBIND_DEBOUNCE_MS = 200;
let lastFillTime = 0;
const FILL_DEBOUNCE_MS = 500; // Prevent rapid text insertions // Prevent rapid-fire keybinds

document.addEventListener('keydown', e => {
  const codeToIndex = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4 };
  const idx = codeToIndex[e.code];
  if (e.shiftKey && idx) {
    const now = Date.now();
    if (now - lastKeybindTime < KEYBIND_DEBOUNCE_MS) {
      debug('keybind', 'Debounced keybind (too fast)');
      return;
    }
    lastKeybindTime = now;
    e.preventDefault();
    e.stopPropagation();
    triggerSlot(idx);
  }
});
