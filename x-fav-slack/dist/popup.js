"use strict";
class PopupManager {
    constructor() {
        // Settings elements
        this.webhookUrlInput = document.getElementById('webhook-url');
        this.channelInput = document.getElementById('channel');
        this.buttonPositionSelect = document.getElementById('button-position');
        this.saveBtn = document.getElementById('save-btn');
        this.testBtn = document.getElementById('test-btn');
        this.statusMessage = document.getElementById('status-message');
        // History elements
        this.historyList = document.getElementById('history-list');
        this.emptyHistory = document.getElementById('empty-history');
        this.exportBtn = document.getElementById('export-btn');
        this.clearHistoryBtn = document.getElementById('clear-history-btn');
        // Tab elements
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.init();
    }
    async init() {
        await this.loadSettings();
        this.attachEventListeners();
        await this.loadHistory();
    }
    attachEventListeners() {
        // Settings events
        this.saveBtn.addEventListener('click', () => this.saveSettings());
        this.testBtn.addEventListener('click', () => this.testConnection());
        this.webhookUrlInput.addEventListener('input', () => {
            this.clearStatus();
        });
        // Tab events
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
                if (tabName === 'history') {
                    this.loadHistory();
                }
            });
        });
        // History events
        this.exportBtn.addEventListener('click', () => this.exportHistory());
        this.clearHistoryBtn.addEventListener('click', () => this.clearAllHistory());
    }
    switchTab(tabName) {
        // Update tab buttons
        this.tabButtons.forEach(button => {
            if (button.dataset.tab === tabName) {
                button.classList.add('active');
            }
            else {
                button.classList.remove('active');
            }
        });
        // Update tab contents
        this.tabContents.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            }
            else {
                content.classList.remove('active');
            }
        });
    }
    async loadSettings() {
        chrome.storage.sync.get(['webhookUrl', 'channel', 'buttonPosition'], (result) => {
            if (result.webhookUrl) {
                this.webhookUrlInput.value = result.webhookUrl;
            }
            if (result.channel) {
                this.channelInput.value = result.channel;
            }
            if (result.buttonPosition) {
                this.buttonPositionSelect.value = result.buttonPosition;
            }
        });
    }
    async saveSettings() {
        const webhookUrl = this.webhookUrlInput.value.trim();
        if (!webhookUrl) {
            this.showStatus('Please enter a Slack webhook URL', 'error');
            return;
        }
        if (!this.isValidWebhookUrl(webhookUrl)) {
            this.showStatus('Invalid webhook URL format', 'error');
            return;
        }
        const channel = this.channelInput.value.trim();
        const buttonPosition = this.buttonPositionSelect.value;
        chrome.storage.sync.set({
            webhookUrl,
            channel,
            buttonPosition
        }, () => {
            this.showStatus('Settings saved successfully!', 'success');
        });
    }
    async testConnection() {
        const webhookUrl = this.webhookUrlInput.value.trim();
        if (!webhookUrl) {
            this.showStatus('Please enter a webhook URL first', 'error');
            return;
        }
        if (!this.isValidWebhookUrl(webhookUrl)) {
            this.showStatus('Invalid webhook URL format', 'error');
            return;
        }
        this.testBtn.disabled = true;
        this.testBtn.textContent = 'Testing...';
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'testSlackConnection',
                webhookUrl,
                channel: this.channelInput.value.trim()
            });
            if (response.success) {
                this.showStatus('Connection successful! Test message sent to Slack.', 'success');
            }
            else {
                this.showStatus(`Connection failed: ${response.error || 'Unknown error'}`, 'error');
            }
        }
        catch (error) {
            this.showStatus('Failed to test connection', 'error');
        }
        finally {
            this.testBtn.disabled = false;
            this.testBtn.textContent = 'Test Connection';
        }
    }
    async loadHistory() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
            if (response.success && response.history) {
                this.displayHistory(response.history);
            }
        }
        catch (error) {
            console.error('Failed to load history:', error);
        }
    }
    displayHistory(history) {
        if (!history || history.length === 0) {
            this.historyList.style.display = 'none';
            this.emptyHistory.style.display = 'block';
            return;
        }
        this.historyList.style.display = 'block';
        this.emptyHistory.style.display = 'none';
        this.historyList.innerHTML = '';
        history.forEach(item => {
            const historyItem = this.createHistoryItem(item);
            this.historyList.appendChild(historyItem);
        });
    }
    createHistoryItem(item) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        const date = new Date(item.sharedAt);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        itemDiv.innerHTML = `
      <div class="history-item-content">
        <div class="history-item-title">${this.escapeHtml(item.title)}</div>
        <div class="history-item-url">${this.escapeHtml(item.url)}</div>
        <div class="history-item-meta">
          <span>${dateStr} ${timeStr}</span>
          ${item.channel ? `<span>→ ${this.escapeHtml(item.channel)}</span>` : ''}
        </div>
      </div>
      <div class="history-item-actions">
        <button class="btn-icon" title="Open URL" data-url="${this.escapeHtml(item.url)}">
          🔗
        </button>
        <button class="btn-icon delete-btn" title="Delete" data-id="${item.id}">
          🗑️
        </button>
      </div>
    `;
        // Add event listeners
        const openBtn = itemDiv.querySelector('[data-url]');
        const deleteBtn = itemDiv.querySelector('.delete-btn');
        openBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: item.url });
        });
        deleteBtn.addEventListener('click', () => {
            this.deleteHistoryItem(item.id);
        });
        return itemDiv;
    }
    async deleteHistoryItem(id) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'deleteHistoryItem',
                id
            });
            if (response.success) {
                await this.loadHistory();
            }
        }
        catch (error) {
            console.error('Failed to delete history item:', error);
        }
    }
    async clearAllHistory() {
        if (!confirm('Are you sure you want to clear all history?')) {
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });
            if (response.success) {
                await this.loadHistory();
            }
        }
        catch (error) {
            console.error('Failed to clear history:', error);
        }
    }
    async exportHistory() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
            if (response.success && response.history) {
                this.downloadCSV(response.history);
            }
        }
        catch (error) {
            console.error('Failed to export history:', error);
        }
    }
    downloadCSV(history) {
        const headers = ['Date', 'Time', 'Title', 'URL', 'Channel'];
        const rows = history.map(item => {
            const date = new Date(item.sharedAt);
            return [
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                item.title,
                item.url,
                item.channel || ''
            ];
        });
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slack-share-history-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    isValidWebhookUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname === 'hooks.slack.com' &&
                parsed.pathname.startsWith('/services/');
        }
        catch {
            return false;
        }
    }
    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        if (type === 'success') {
            setTimeout(() => this.clearStatus(), 3000);
        }
    }
    clearStatus() {
        this.statusMessage.className = 'status-message';
        this.statusMessage.textContent = '';
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});
