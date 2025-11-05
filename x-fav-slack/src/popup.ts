class PopupManager {
  private webhookUrlInput: HTMLInputElement;
  private channelInput: HTMLInputElement;
  private saveBtn: HTMLButtonElement;
  private testBtn: HTMLButtonElement;
  private statusMessage: HTMLDivElement;

  constructor() {
    this.webhookUrlInput = document.getElementById('webhook-url') as HTMLInputElement;
    this.channelInput = document.getElementById('channel') as HTMLInputElement;
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.testBtn = document.getElementById('test-btn') as HTMLButtonElement;
    this.statusMessage = document.getElementById('status-message') as HTMLDivElement;

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadSettings();
    this.attachEventListeners();
  }

  private async loadSettings(): Promise<void> {
    chrome.storage.sync.get(['webhookUrl', 'channel'], (result) => {
      if (result.webhookUrl) {
        this.webhookUrlInput.value = result.webhookUrl;
      }
      if (result.channel) {
        this.channelInput.value = result.channel;
      }
    });
  }

  private attachEventListeners(): void {
    this.saveBtn.addEventListener('click', () => this.saveSettings());
    this.testBtn.addEventListener('click', () => this.testConnection());

    this.webhookUrlInput.addEventListener('input', () => {
      this.clearStatus();
    });
  }

  private async saveSettings(): Promise<void> {
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

    chrome.storage.sync.set(
      {
        webhookUrl,
        channel
      },
      () => {
        this.showStatus('Settings saved successfully!', 'success');
      }
    );
  }

  private async testConnection(): Promise<void> {
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
      } else {
        this.showStatus(`Connection failed: ${response.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      this.showStatus('Failed to test connection', 'error');
    } finally {
      this.testBtn.disabled = false;
      this.testBtn.textContent = 'Test Connection';
    }
  }

  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'hooks.slack.com' && 
             parsed.pathname.startsWith('/services/');
    } catch {
      return false;
    }
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type}`;
    
    if (type === 'success') {
      setTimeout(() => this.clearStatus(), 3000);
    }
  }

  private clearStatus(): void {
    this.statusMessage.className = 'status-message';
    this.statusMessage.textContent = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});