"use strict";
class PopupManager {
    constructor() {
        this.webhookUrlInput = document.getElementById('webhook-url');
        this.channelInput = document.getElementById('channel');
        this.saveBtn = document.getElementById('save-btn');
        this.testBtn = document.getElementById('test-btn');
        this.statusMessage = document.getElementById('status-message');
        this.init();
    }
    async init() {
        await this.loadSettings();
        this.attachEventListeners();
    }
    async loadSettings() {
        chrome.storage.sync.get(['webhookUrl', 'channel'], (result) => {
            if (result.webhookUrl) {
                this.webhookUrlInput.value = result.webhookUrl;
            }
            if (result.channel) {
                this.channelInput.value = result.channel;
            }
        });
    }
    attachEventListeners() {
        this.saveBtn.addEventListener('click', () => this.saveSettings());
        this.testBtn.addEventListener('click', () => this.testConnection());
        this.webhookUrlInput.addEventListener('input', () => {
            this.clearStatus();
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
        chrome.storage.sync.set({
            webhookUrl,
            channel
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
}
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});
