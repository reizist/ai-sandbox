interface ShareHistory {
  id: string;
  url: string;
  title: string;
  description?: string;
  sharedAt: string;
  channel?: string;
}

class PopupManager {
  private webhookUrlInput: HTMLInputElement;
  private channelInput: HTMLInputElement;
  private buttonPositionSelect: HTMLSelectElement;
  private saveBtn: HTMLButtonElement;
  private testBtn: HTMLButtonElement;
  private statusMessage: HTMLDivElement;
  
  // History elements
  private historyList: HTMLDivElement;
  private emptyHistory: HTMLDivElement;
  private exportBtn: HTMLButtonElement;
  private clearHistoryBtn: HTMLButtonElement;
  
  // Tab elements
  private tabButtons: NodeListOf<HTMLButtonElement>;
  private tabContents: NodeListOf<HTMLDivElement>;

  constructor() {
    // Settings elements
    this.webhookUrlInput = document.getElementById('webhook-url') as HTMLInputElement;
    this.channelInput = document.getElementById('channel') as HTMLInputElement;
    this.buttonPositionSelect = document.getElementById('button-position') as HTMLSelectElement;
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.testBtn = document.getElementById('test-btn') as HTMLButtonElement;
    this.statusMessage = document.getElementById('status-message') as HTMLDivElement;
    
    // History elements
    this.historyList = document.getElementById('history-list') as HTMLDivElement;
    this.emptyHistory = document.getElementById('empty-history') as HTMLDivElement;
    this.exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
    this.clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;
    
    // Tab elements
    this.tabButtons = document.querySelectorAll('.tab-button');
    this.tabContents = document.querySelectorAll('.tab-content');

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadSettings();
    this.attachEventListeners();
    await this.loadHistory();
  }

  private attachEventListeners(): void {
    // Settings events
    this.saveBtn.addEventListener('click', () => this.saveSettings());
    this.testBtn.addEventListener('click', () => this.testConnection());
    this.webhookUrlInput.addEventListener('input', () => {
      this.clearStatus();
    });
    
    // Tab events
    this.tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab!;
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

  private switchTab(tabName: string): void {
    // Update tab buttons
    this.tabButtons.forEach(button => {
      if (button.dataset.tab === tabName) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Update tab contents
    this.tabContents.forEach(content => {
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  private async loadSettings(): Promise<void> {
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
    const buttonPosition = this.buttonPositionSelect.value;

    chrome.storage.sync.set(
      {
        webhookUrl,
        channel,
        buttonPosition
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

  private async loadHistory(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
      
      if (response.success && response.history) {
        this.displayHistory(response.history);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  private displayHistory(history: ShareHistory[]): void {
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

  private createHistoryItem(item: ShareHistory): HTMLElement {
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
    const openBtn = itemDiv.querySelector('[data-url]') as HTMLButtonElement;
    const deleteBtn = itemDiv.querySelector('.delete-btn') as HTMLButtonElement;
    
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: item.url });
    });
    
    deleteBtn.addEventListener('click', () => {
      this.deleteHistoryItem(item.id);
    });

    return itemDiv;
  }

  private async deleteHistoryItem(id: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'deleteHistoryItem',
        id 
      });
      
      if (response.success) {
        await this.loadHistory();
      }
    } catch (error) {
      console.error('Failed to delete history item:', error);
    }
  }

  private async clearAllHistory(): Promise<void> {
    if (!confirm('Are you sure you want to clear all history?')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });
      
      if (response.success) {
        await this.loadHistory();
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }

  private async exportHistory(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
      
      if (response.success && response.history) {
        this.downloadCSV(response.history);
      }
    } catch (error) {
      console.error('Failed to export history:', error);
    }
  }

  private downloadCSV(history: ShareHistory[]): void {
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

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});