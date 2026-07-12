const https = require('https');
const crypto = require('crypto');

// Helper to hash data using SHA-256
function hashData(data) {
    if (!data) return null;
    const cleanData = String(data).trim().toLowerCase();
    if (!cleanData) return null;
    return crypto.createHash('sha256').update(cleanData).digest('hex');
}

// Helper to make HTTPS requests
function makeRequest(url, method, headers, postData = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, message: 'Method Not Allowed' }));
        return;
    }

    async function processTracking(bodyData) {
        try {
            const order = bodyData.order;
            if (!order || !order.id) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: 'Missing order object or order ID' }));
                return;
            }

            console.log(`[CAPI] Received tracking request for order: ${order.id}`);

            // 1. Prepare User Data (Hash PII for Meta Compliance)
            const userData = {};

            // Clean & format Phone
            if (order.customer && order.customer.phone) {
                let cleanPhone = String(order.customer.phone).replace(/[^\d]/g, '');
                if (cleanPhone.length === 10) {
                    cleanPhone = '91' + cleanPhone; // India country code
                }
                const hashedPhone = hashData(cleanPhone);
                if (hashedPhone) userData.ph = [hashedPhone];
            }

            // Parse Name
            if (order.customer && order.customer.name) {
                const fullName = String(order.customer.name).trim();
                const parts = fullName.split(/\s+/);
                const firstName = parts[0];
                const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
                
                const hashedFn = hashData(firstName);
                if (hashedFn) userData.fn = [hashedFn];
                
                if (lastName) {
                    const hashedLn = hashData(lastName);
                    if (hashedLn) userData.ln = [hashedLn];
                }
            }

            // City, State, Zip, Country
            if (order.customer) {
                if (order.customer.city) {
                    const hashedCity = hashData(order.customer.city);
                    if (hashedCity) userData.ct = [hashedCity];
                }
                if (order.customer.state) {
                    const hashedState = hashData(order.customer.state);
                    if (hashedState) userData.st = [hashedState];
                }
                if (order.customer.pin) {
                    const hashedZip = hashData(order.customer.pin);
                    if (hashedZip) userData.zp = [hashedZip];
                }
            }
            
            // Hardcode country as India (Hashed 'in')
            userData.country = [hashData('in')];

            // 2. Prepare Custom Data (Value & Items)
            let totalVal = 999;
            if (order.total) {
                const cleaned = String(order.total).replace(/[^\d.]/g, '');
                const parsed = parseFloat(cleaned);
                if (!isNaN(parsed)) totalVal = parsed;
            }

            const contents = [];
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    contents.push({
                        id: String(item.id),
                        quantity: item.qty || 1
                    });
                });
            }

            const customData = {
                value: totalVal,
                currency: 'INR',
                content_type: 'product',
                contents: contents
            };

            // 3. Prepare Payload for Meta CAPI
            const payload = {
                data: [
                    {
                        event_name: 'Purchase',
                        event_time: Math.floor(Date.now() / 1000),
                        event_id: order.id, // CRITICAL: Must match the browser eventID for deduplication
                        user_data: userData,
                        custom_data: customData,
                        event_source_url: `https://upichira.vercel.app/order-confirmation.html?orderId=${encodeURIComponent(order.id)}`,
                        action_source: 'website'
                    }
                ]
            };

            const pixelId = '947390424330740';
            const accessToken = 'EAAcaJ3AdJekBR2I4g4AzXTcXuYBTZBI82ZBZBb5lYJ5fFc1D0GZC9ckn71R9wkdZCKicB2FXrfYYcE1YKiQ4mnYhtrpu7bAY0gpw7kyGcuO9DXWHMilXhLmBofZBGYuDzrgVZCEZBXtxLRBaU3ZCimrdpqLuxARnoSQTvssTk84ly1NzjwV0jOkMm7eduqlpCbpQrNwZDZD';
            const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

            console.log(`[CAPI] Dispatching server event for order: ${order.id} with value: Rs. ${totalVal}`);

            const response = await makeRequest(
                url,
                'POST',
                { 'Content-Type': 'application/json' },
                JSON.stringify(payload)
            );

            console.log(`[CAPI] Response code: ${response.statusCode}, Body: ${response.body}`);

            if (response.statusCode === 200) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: 'Purchase event tracked via Conversions API' }));
            } else {
                res.statusCode = response.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: 'Meta CAPI rejected event', detail: response.body }));
            }

        } catch (err) {
            console.error('[CAPI] Internal server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: 'Internal server error: ' + err.message }));
        }
    }

    if (req.body) {
        await processTracking(req.body);
    } else {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                await processTracking(data);
            } catch (e) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON body' }));
            }
        });
    }
};
