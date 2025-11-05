interface SlackMessage {
  text?: string;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    elements?: Array<{
      type: string;
      text?: string;
      url?: string;
    }>;
  }>;
  channel?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

interface ShareHistory {
  id: string;
  url: string;
  title: string;
  description?: string;
  sharedAt: string;
  channel?: string;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'shareToSlack') {
    handleShareToSlack(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'testSlackConnection') {
    testSlackConnection(request.webhookUrl, request.channel)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'getHistory') {
    getShareHistory()
      .then(history => sendResponse({ success: true, history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'clearHistory') {
    clearShareHistory()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'deleteHistoryItem') {
    deleteHistoryItem(request.id)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleShareToSlack(data: {
  pageData?: { title: string; url: string; description?: string };
  tweetData?: { text: string; author: string; url: string; sharedLinks: string[] };
  webhookUrl: string;
  channel?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { pageData, tweetData, webhookUrl, channel } = data;

  let message: SlackMessage;

  if (pageData) {
    // New format for general web pages
    let messageText = `📚 *記事を共有しました*\n\n${pageData.url}\n`;
    
    if (pageData.description) {
      messageText += `\n_${pageData.description.substring(0, 200)}${pageData.description.length > 200 ? '...' : ''}_`;
    }

    message = {
      text: messageText,
      unfurl_links: true,
      unfurl_media: true
    };
  } else if (tweetData) {
    // Legacy format for tweets (kept for backward compatibility)
    let messageText = '';
    if (tweetData.sharedLinks && tweetData.sharedLinks.length > 0) {
      messageText = `📚 *${tweetData.author}* がXで共有した記事\n\n`;
      tweetData.sharedLinks.forEach((link) => {
        messageText += `${link}\n`;
      });
      if (tweetData.text) {
        const cleanText = tweetData.text.replace(/https?:\/\/[^\s]+/g, '').trim();
        if (cleanText) {
          messageText += `\n💬 _${cleanText}_\n`;
        }
      }
      messageText += `\n<${tweetData.url}|元のXポストを見る>`;
    } else {
      messageText = `*${tweetData.author}* shared on X:\n${tweetData.text || '_[Tweet contains media only]_'}\n<${tweetData.url}|View on X>`;
    }

    message = {
      text: messageText,
      unfurl_links: true,
      unfurl_media: true
    };
  } else {
    return {
      success: false,
      error: 'No data to share'
    };
  }

  if (channel) {
    message.channel = channel;
  }

  try {
    console.log('Sending message to Slack webhook:', webhookUrl);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });

    const responseText = await response.text();
    console.log('Slack response:', response.status, responseText);

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error(`Invalid webhook URL or message format. Response: ${responseText}`);
      } else if (response.status === 404) {
        throw new Error('Webhook URL not found. Please check your webhook URL.');
      } else {
        throw new Error(`Slack API error (${response.status}): ${responseText}`);
      }
    }

    // Slack webhooks return "ok" on success
    if (responseText !== 'ok') {
      throw new Error(`Unexpected response: ${responseText}`);
    }

    // Save to history if successful
    if (pageData) {
      await saveToHistory({
        url: pageData.url,
        title: pageData.title,
        description: pageData.description,
        channel: channel
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending to Slack:', error);
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'Network error. Please check your internet connection and webhook URL.'
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testSlackConnection(
  webhookUrl: string,
  channel?: string
): Promise<{ success: boolean; error?: string }> {
  const message: SlackMessage = {
    text: '✅ X to Slack Share extension is connected successfully!',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *X to Slack Share* extension is connected successfully!'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'You can now share posts from X directly to this channel.'
          }
        ]
      }
    ]
  };

  if (channel) {
    message.channel = channel;
  }

  try {
    console.log('Testing Slack connection:', webhookUrl);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });

    const responseText = await response.text();
    console.log('Slack test response:', response.status, responseText);

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error(`Invalid webhook URL or message format. Response: ${responseText}`);
      } else if (response.status === 404) {
        throw new Error('Webhook URL not found. Please check your webhook URL.');
      } else {
        throw new Error(`Slack API error (${response.status}): ${responseText}`);
      }
    }

    // Slack webhooks return "ok" on success
    if (responseText !== 'ok') {
      throw new Error(`Unexpected response: ${responseText}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error testing Slack connection:', error);
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'Network error. Please check your internet connection and webhook URL.'
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function saveToHistory(data: {
  url: string;
  title: string;
  description?: string;
  channel?: string;
}): Promise<void> {
  const history = await getShareHistory();
  const newEntry: ShareHistory = {
    id: Date.now().toString(),
    url: data.url,
    title: data.title,
    description: data.description,
    sharedAt: new Date().toISOString(),
    channel: data.channel
  };

  // Add to beginning of array and limit to 100 items
  history.unshift(newEntry);
  if (history.length > 100) {
    history.pop();
  }

  await chrome.storage.local.set({ shareHistory: history });
}

async function getShareHistory(): Promise<ShareHistory[]> {
  const result = await chrome.storage.local.get('shareHistory');
  return result.shareHistory || [];
}

async function clearShareHistory(): Promise<void> {
  await chrome.storage.local.set({ shareHistory: [] });
}

async function deleteHistoryItem(id: string): Promise<void> {
  const history = await getShareHistory();
  const filteredHistory = history.filter(item => item.id !== id);
  await chrome.storage.local.set({ shareHistory: filteredHistory });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Slack Share Button extension installed');
});