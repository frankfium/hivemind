/*
 * Hivemind for Twitch - Settings Popup
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

// Default settings
const DEFAULT_SETTINGS = {
    spamThreshold: 4,
    maxEntries: 4,
    windowDuration: 5, // minutes
    maxMessages: 200,
    updateFrequency: 50, // ms
    trimInterval: 5, // seconds
    startMinimized: true,
    showEmptyState: false
};

// Load settings from storage
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        return result;
    } catch (error) {
        console.error('Error loading settings:', error);
        return DEFAULT_SETTINGS;
    }
}

// Save settings to storage
async function saveSettings(settings) {
    try {
        await chrome.storage.sync.set(settings);
        // Notify content script of settings change
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url.includes('twitch.tv')) {
            chrome.tabs.sendMessage(tab.id, { 
                type: 'SETTINGS_UPDATED', 
                settings: settings 
            }).catch(() => {
                // Content script might not be ready, ignore error
            });
        }
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// Update slider value display
function updateSliderValue(sliderId, valueId) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);
    if (slider && valueDisplay) {
        valueDisplay.textContent = slider.value;
    }
}

// Setup slider event listeners
function setupSlider(sliderId, valueId, settingKey) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    slider.addEventListener('input', () => {
        updateSliderValue(sliderId, valueId);
        saveSetting(settingKey, parseInt(slider.value));
    });
}

// Setup checkbox event listeners
function setupCheckbox(checkboxId, settingKey) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    checkbox.addEventListener('click', () => {
        checkbox.classList.toggle('checked');
        saveSetting(settingKey, checkbox.classList.contains('checked'));
    });
}

// Save individual setting
async function saveSetting(key, value) {
    const currentSettings = await loadSettings();
    currentSettings[key] = value;
    await saveSettings(currentSettings);
}

// Apply settings to UI
function applySettingsToUI(settings) {
    // Apply slider values
    document.getElementById('spamThreshold').value = settings.spamThreshold;
    document.getElementById('maxEntries').value = settings.maxEntries;
    document.getElementById('windowDuration').value = settings.windowDuration;
    document.getElementById('maxMessages').value = settings.maxMessages;
    document.getElementById('updateFrequency').value = settings.updateFrequency;
    document.getElementById('trimInterval').value = settings.trimInterval;

    // Update value displays
    updateSliderValue('spamThreshold', 'spamThresholdValue');
    updateSliderValue('maxEntries', 'maxEntriesValue');
    updateSliderValue('windowDuration', 'windowDurationValue');
    updateSliderValue('maxMessages', 'maxMessagesValue');
    updateSliderValue('updateFrequency', 'updateFrequencyValue');
    updateSliderValue('trimInterval', 'trimIntervalValue');

    // Apply checkbox states
    const startMinimized = document.getElementById('startMinimized');
    const showEmptyState = document.getElementById('showEmptyState');
    
    if (settings.startMinimized) {
        startMinimized.classList.add('checked');
    } else {
        startMinimized.classList.remove('checked');
    }

    if (settings.showEmptyState) {
        showEmptyState.classList.add('checked');
    } else {
        showEmptyState.classList.remove('checked');
    }
}

// Reset to default settings
async function resetToDefaults() {
    if (confirm('Reset all settings to defaults?')) {
        await saveSettings(DEFAULT_SETTINGS);
        applySettingsToUI(DEFAULT_SETTINGS);
    }
}

// Initialize popup
async function init() {
    // Load and apply settings
    const settings = await loadSettings();
    applySettingsToUI(settings);

    // Setup event listeners
    setupSlider('spamThreshold', 'spamThresholdValue', 'spamThreshold');
    setupSlider('maxEntries', 'maxEntriesValue', 'maxEntries');
    setupSlider('windowDuration', 'windowDurationValue', 'windowDuration');
    setupSlider('maxMessages', 'maxMessagesValue', 'maxMessages');
    setupSlider('updateFrequency', 'updateFrequencyValue', 'updateFrequency');
    setupSlider('trimInterval', 'trimIntervalValue', 'trimInterval');

    setupCheckbox('startMinimized', 'startMinimized');
    setupCheckbox('showEmptyState', 'showEmptyState');

    // Reset button
    document.getElementById('resetSettings').addEventListener('click', resetToDefaults);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
