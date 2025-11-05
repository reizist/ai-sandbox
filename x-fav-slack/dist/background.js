"use strict";
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
});
async function handleShareToSlack(data) {
    const { tweetData, webhookUrl, channel } = data;
    // Build message for shared links
    let messageText = '';
    const blocks = [];
    // Add header if there are shared links
    if (tweetData.sharedLinks && tweetData.sharedLinks.length > 0) {
        // Create simple message with links that Slack will unfurl
        messageText = `📚 *${tweetData.author}* がXで共有した記事\n\n`;
        // Add links (Slack will automatically unfurl them)
        tweetData.sharedLinks.forEach((link, index) => {
            messageText += `${link}\n`;
        });
        // Add tweet comment if exists
        if (tweetData.text) {
            const cleanText = tweetData.text.replace(/https?:\/\/[^\s]+/g, '').trim();
            if (cleanText) {
                messageText += `\n💬 _${cleanText}_\n`;
            }
        }
        // Add source link
        messageText += `\n<${tweetData.url}|元のXポストを見る>`;
        // Alternative block format (if unfurling doesn't work)
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: messageText
            }
        });
    }
    else {
        // Fallback to original format if no links found
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${tweetData.author}* shared on X:`
            }
        }, {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: tweetData.text || '_[Tweet contains media only]_'
            }
        }, {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `<${tweetData.url}|View on X>`
                }
            ]
        });
    }
    const message = {
        text: messageText || 'Shared from X',
        unfurl_links: true,
        unfurl_media: true
    };
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
            }
            else if (response.status === 404) {
                throw new Error('Webhook URL not found. Please check your webhook URL.');
            }
            else {
                throw new Error(`Slack API error (${response.status}): ${responseText}`);
            }
        }
        // Slack webhooks return "ok" on success
        if (responseText !== 'ok') {
            throw new Error(`Unexpected response: ${responseText}`);
        }
        return { success: true };
    }
    catch (error) {
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
async function testSlackConnection(webhookUrl, channel) {
    const message = {
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
            }
            else if (response.status === 404) {
                throw new Error('Webhook URL not found. Please check your webhook URL.');
            }
            else {
                throw new Error(`Slack API error (${response.status}): ${responseText}`);
            }
        }
        // Slack webhooks return "ok" on success
        if (responseText !== 'ok') {
            throw new Error(`Unexpected response: ${responseText}`);
        }
        return { success: true };
    }
    catch (error) {
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
chrome.runtime.onInstalled.addListener(() => {
    console.log('X to Slack Share extension installed');
});
