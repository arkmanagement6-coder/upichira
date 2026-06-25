const https = require('https');
const path = require('path');
const fs = require('fs');

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

    // Read request body
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', async () => {
        try {
            const data = req.body || JSON.parse(body || '{}');
            const orderId = data.orderId;
            const amount = data.amount;
            const redirectUrl = data.redirectUrl;
            const method = data.method || 'phonepe'; // default method

            if (!orderId || !amount || !redirectUrl) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, message: 'Missing required parameters: orderId, amount, redirectUrl' }));
                return;
            }

            // Read settings from settings.json to get custom UPI config if stored there
            let settings = {};
            try {
                const settingsPath = path.join(process.cwd(), 'settings.json');
                if (fs.existsSync(settingsPath)) {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                }
            } catch (err) {
                console.error('Error reading settings.json:', err);
            }

            // We repurpose phonepeMerchantId as UPI ID and phonepeClientId as Payee Name
            const upiId = settings.phonepeMerchantId || '9300241235@slc';
            const payeeName = settings.phonepeClientId || 'Lucky Jat';

            console.log(`[UPI Checkout] Initiating checkout for order ${orderId}, amount: ${amount}, method: ${method}`);
            
            // Generate redirect URL to our premium local payment page
            const customRedirectUrl = `/payment.html?orderId=${encodeURIComponent(orderId)}&method=${encodeURIComponent(method)}&upi=${encodeURIComponent(upiId)}&name=${encodeURIComponent(payeeName)}`;

            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, redirectUrl: customRedirectUrl }));

        } catch (err) {
            console.error('[UPI Checkout] Internal server error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, message: 'Internal server error: ' + err.message }));
        }
    });
};

