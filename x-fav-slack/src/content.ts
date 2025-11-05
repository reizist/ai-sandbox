interface PageData {
  title: string;
  url: string;
  description?: string;
}

type ButtonPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

class SlackShareButton {
  private buttonClass = 'slack-share-extension-btn';
  private floatingButton: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      await this.setup();
    }
  }

  private async setup(): Promise<void> {
    // Get position setting
    const settings = await this.getSettings();
    const position = settings.position || 'bottom-right';
    
    // Add floating button immediately
    this.addFloatingButton(position);

    // Listen for storage changes to update position
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.buttonPosition) {
        this.updateButtonPosition(changes.buttonPosition.newValue || 'bottom-right');
      }
    });
  }

  private addFloatingButton(position: ButtonPosition): void {
    if (this.floatingButton) return;

    const floatingButton = document.createElement('div');
    floatingButton.className = `${this.buttonClass} floating-slack-share ${position}`;
    const iconUrl = chrome.runtime.getURL('icons/slack_icon.png');
    floatingButton.innerHTML = `
      <img src="${iconUrl}" width="28" height="28" alt="Share to Slack">
    `;
    floatingButton.title = 'Share to Slack';

    floatingButton.addEventListener('click', () => {
      this.handleShare();
    });

    document.body.appendChild(floatingButton);
    this.floatingButton = floatingButton;
  }

  private updateButtonPosition(position: ButtonPosition): void {
    if (!this.floatingButton) return;
    
    // Remove all position classes
    this.floatingButton.classList.remove('bottom-right', 'bottom-left', 'top-right', 'top-left');
    
    // Add new position class
    this.floatingButton.classList.add(position);
  }

  private extractPageData(): PageData {
    // Get Open Graph data first (most accurate)
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
    const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content');

    // Fallback to Twitter Card data
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]')?.getAttribute('content');

    // Final fallback to basic page data
    const pageTitle = ogTitle || twitterTitle || document.title;
    const pageUrl = ogUrl || window.location.href;
    const pageDescription = ogDescription || twitterDescription || 
      document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    return {
      title: pageTitle,
      url: pageUrl,
      description: pageDescription
    };
  }

  private async handleShare(): Promise<void> {
    const pageData = this.extractPageData();

    const settings = await this.getSettings();
    if (!settings.webhookUrl) {
      alert('Please configure your Slack webhook URL in the extension settings');
      chrome.runtime.sendMessage({ action: 'openPopup' });
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'shareToSlack',
        data: {
          pageData,
          webhookUrl: settings.webhookUrl,
          channel: settings.channel
        }
      });

      if (response.success) {
        this.showNotification('Successfully shared to Slack!', 'success');
      } else {
        this.showNotification('Failed to share to Slack', 'error');
      }
    } catch (error) {
      console.error('Error sharing to Slack:', error);
      this.showNotification('Error sharing to Slack', 'error');
    }
  }

  private async getSettings(): Promise<{ webhookUrl: string; channel?: string; position?: ButtonPosition }> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['webhookUrl', 'channel', 'buttonPosition'], (result) => {
        resolve({
          webhookUrl: result.webhookUrl || '',
          channel: result.channel,
          position: result.buttonPosition || 'bottom-right'
        });
      });
    });
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.className = `slack-share-notification ${type}`;
    notification.textContent = message;
    
    // Position notification near the button
    const settings = this.getSettings();
    settings.then(s => {
      const position = s.position || 'bottom-right';
      if (position.includes('top')) {
        notification.style.top = '80px';
        notification.style.bottom = 'auto';
      }
      if (position.includes('left')) {
        notification.style.left = '20px';
        notification.style.right = 'auto';
      }
    });

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
}

// Initialize only on actual web pages
if (window.location.protocol.startsWith('http')) {
  new SlackShareButton();
}