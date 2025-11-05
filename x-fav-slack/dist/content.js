"use strict";
class XToSlackShare {
    constructor() {
        this.buttonClass = 'x-to-slack-share-btn';
        this.init();
    }
    init() {
        this.observeTweets();
        this.addShareButtons();
    }
    observeTweets() {
        const observer = new MutationObserver(() => {
            this.addShareButtons();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    addShareButtons() {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        tweets.forEach((tweet) => {
            if (tweet.querySelector(`.${this.buttonClass}`)) {
                return;
            }
            const actionBar = tweet.querySelector('[role="group"]');
            if (!actionBar)
                return;
            const shareButton = this.createShareButton();
            shareButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleShare(tweet);
            });
            const lastButton = actionBar.lastElementChild;
            if (lastButton) {
                actionBar.insertBefore(shareButton, lastButton);
            }
        });
    }
    createShareButton() {
        const button = document.createElement('div');
        button.className = this.buttonClass;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.innerHTML = `
      <div class="x-to-slack-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="currentColor"/>
        </svg>
      </div>
    `;
        return button;
    }
    extractTweetData(tweetElement) {
        try {
            const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
            const text = tweetTextElement?.textContent || '';
            const timeElement = tweetElement.querySelector('time');
            const linkElement = timeElement?.closest('a');
            const url = linkElement ? `https://x.com${linkElement.pathname}` : window.location.href;
            const authorElement = tweetElement.querySelector('[data-testid="User-Name"] a');
            const author = authorElement?.textContent?.split('@')[0]?.trim() || 'Unknown';
            // Extract URLs from tweet
            const sharedLinks = [];
            const seenUrls = new Set();
            console.log('=== Starting link extraction ===');
            console.log('Tweet element:', tweetElement);
            // Method 1: Get all anchor tags in the entire tweet (not just tweetText)
            const allLinks = tweetElement.querySelectorAll('a');
            console.log(`Found ${allLinks.length} anchor tags in tweet`);
            allLinks.forEach((link, index) => {
                const anchor = link;
                console.log(`Link ${index}:`, {
                    href: anchor.href,
                    textContent: anchor.textContent,
                    title: anchor.title,
                    ariaLabel: anchor.getAttribute('aria-label'),
                    innerHTML: anchor.innerHTML.substring(0, 100)
                });
                let targetUrl = '';
                // Skip internal X/Twitter links but check everything else
                if (anchor.href.includes('twitter.com/') || anchor.href.includes('x.com/')) {
                    // Check if it's a status link (tweet link) or user link - skip those
                    if (anchor.href.match(/\/(status|[^\/]+)\/\d+/) ||
                        anchor.href.match(/\/[^\/]+$/) && !anchor.href.includes('http')) {
                        console.log('  -> Skipping internal X/Twitter link');
                        return;
                    }
                }
                // For t.co links, we need to find the real URL
                if (anchor.href.includes('t.co')) {
                    console.log('  -> Found t.co link, looking for real URL');
                    // Check if the real URL is in a child span
                    const spans = anchor.querySelectorAll('span');
                    spans.forEach(span => {
                        const spanText = span.textContent || '';
                        console.log('    Span text:', spanText);
                        if (spanText.startsWith('http') && !spanText.includes('t.co')) {
                            targetUrl = spanText;
                            // Handle truncated URLs (ending with …)
                            if (targetUrl.endsWith('…')) {
                                // Try to get full URL from parent card if available
                                const card = anchor.closest('[data-testid="card.wrapper"]');
                                if (card) {
                                    const cardLink = card.querySelector('a[href^="http"]:not([href*="t.co"])');
                                    if (cardLink) {
                                        targetUrl = cardLink.href;
                                    }
                                }
                            }
                        }
                    });
                    // If still no URL, check the anchor's text content
                    if (!targetUrl) {
                        const linkText = anchor.textContent || '';
                        if (linkText.startsWith('http') && !linkText.includes('t.co')) {
                            targetUrl = linkText;
                        }
                    }
                }
                else if (anchor.href.startsWith('http')) {
                    // Direct HTTP link
                    targetUrl = anchor.href;
                }
                if (targetUrl && !targetUrl.includes('t.co')) {
                    const cleanUrl = targetUrl.split('?')[0].replace(/[…,.)]+$/, '').replace(/\/$/, '');
                    if (cleanUrl && cleanUrl.startsWith('http') && !seenUrls.has(cleanUrl)) {
                        console.log('  -> Adding URL:', cleanUrl);
                        seenUrls.add(cleanUrl);
                        sharedLinks.push(cleanUrl);
                    }
                }
            });
            // Method 2: Check card.wrapper specifically
            const cardWrapper = tweetElement.querySelector('[data-testid="card.wrapper"]');
            if (cardWrapper) {
                console.log('Found card wrapper');
                // Look for any element that contains a URL in the card
                const allCardElements = cardWrapper.querySelectorAll('*');
                allCardElements.forEach(element => {
                    const elementText = element.textContent || '';
                    // Look for URLs in text content
                    if (elementText.startsWith('http') && !elementText.includes('t.co') && element.children.length === 0) {
                        const cleanUrl = elementText.split('?')[0].replace(/[…,.)]+$/, '').replace(/\/$/, '');
                        if (cleanUrl && !seenUrls.has(cleanUrl)) {
                            console.log('Found URL in card text:', cleanUrl);
                            seenUrls.add(cleanUrl);
                            sharedLinks.push(cleanUrl);
                        }
                    }
                });
            }
            // Method 3: Look for tweetPhoto elements which might have links
            const tweetPhotos = tweetElement.querySelectorAll('[data-testid="tweetPhoto"]');
            tweetPhotos.forEach(photo => {
                const photoLink = photo.closest('a');
                if (photoLink) {
                    const href = photoLink.href;
                    if (href && !href.includes('photo') && !href.includes('t.co') && href.startsWith('http')) {
                        const cleanUrl = href.split('?')[0].replace(/\/$/, '');
                        if (!seenUrls.has(cleanUrl)) {
                            console.log('Found URL in photo link:', cleanUrl);
                            seenUrls.add(cleanUrl);
                            sharedLinks.push(cleanUrl);
                        }
                    }
                }
            });
            console.log('=== Final extracted links ===');
            console.log('Extracted links from tweet:', sharedLinks);
            return {
                text,
                author,
                url,
                sharedLinks
            };
        }
        catch (error) {
            console.error('Error extracting tweet data:', error);
            return null;
        }
    }
    async handleShare(tweetElement) {
        const tweetData = this.extractTweetData(tweetElement);
        if (!tweetData) {
            alert('Failed to extract tweet data');
            return;
        }
        // Check if there are any shared links in the tweet
        if (tweetData.sharedLinks.length === 0) {
            this.showNotification('No external links found in this post', 'error');
            return;
        }
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
                    tweetData,
                    webhookUrl: settings.webhookUrl,
                    channel: settings.channel
                }
            });
            if (response.success) {
                this.showNotification('Successfully shared to Slack!', 'success');
            }
            else {
                this.showNotification('Failed to share to Slack', 'error');
            }
        }
        catch (error) {
            console.error('Error sharing to Slack:', error);
            this.showNotification('Error sharing to Slack', 'error');
        }
    }
    async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['webhookUrl', 'channel'], (result) => {
                resolve({
                    webhookUrl: result.webhookUrl || '',
                    channel: result.channel
                });
            });
        });
    }
    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `x-to-slack-notification ${type}`;
        notification.textContent = message;
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
new XToSlackShare();
