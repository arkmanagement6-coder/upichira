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
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    try {
        const urlObj = new URL(req.url, 'http://localhost');
        const orderId = urlObj.searchParams.get('orderId');

        if (!orderId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, message: 'Missing required query parameter: orderId' }));
            return;
        }

        console.log(`[UPI Status] Returning mock success for order ${orderId}`);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            success: true,
            state: 'COMPLETED',
            status: 'SUCCESS',
            code: 'PAYMENT_SUCCESS',
            message: 'UPI payment verified successfully',
            data: {
                transactionId: orderId,
                providerReferenceId: 'UPI-MOCK-' + Math.floor(100000 + Math.random() * 900000)
            }
        }));

    } catch (err) {
        console.error('[UPI Status] Error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, message: 'Internal server error: ' + err.message }));
    }
};
