const path = require('path');
const fs = require('fs');

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

    async function processSave(data) {
        try {
            const settingsPath = path.join(process.cwd(), 'settings.json');
            
            // Read existing settings first to preserve any unspecified keys if needed
            let existingSettings = {};
            if (fs.existsSync(settingsPath)) {
                try {
                    existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (e) {
                    console.error('Error parsing existing settings:', e);
                }
            }

            // Merge new settings
            const updatedSettings = {
                ...existingSettings,
                ...data
            };

            // Write back to settings.json
            fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2), 'utf8');
            console.log('[Settings API] Updated settings.json successfully.');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, message: 'Settings saved successfully' }));
        } catch (err) {
            console.error('[Settings API] Internal server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: 'Internal server error: ' + err.message }));
        }
    }

    if (req.body) {
        await processSave(req.body);
    } else {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                await processSave(data);
            } catch (e) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON body' }));
            }
        });
    }
};
