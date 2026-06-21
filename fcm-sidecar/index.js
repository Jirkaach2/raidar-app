const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const AndroidFCM = require('@liamcottle/push-receiver/src/android/fcm');
const PushReceiverClient = require('@liamcottle/push-receiver/src/client');

const appDataDir = process.argv[2] || process.cwd();
const CONFIG_PATH = path.join(appDataDir, 'rustplus.config.json');

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        return null;
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

async function getExpoPushToken(fcmToken) {
    const response = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
        type: 'fcm',
        deviceId: uuidv4(),
        development: false,
        appId: 'com.facepunch.rust.companion',
        deviceToken: fcmToken,
        projectId: '49451aca-a822-41e6-ad59-955718d0ff9c',
    });
    return response.data.data.expoPushToken;
}

async function registerWithRustPlus(authToken, expoPushToken) {
    return axios.post('https://companion-rust.facepunch.com:443/api/push/register', {
        AuthToken: authToken,
        DeviceId: 'rustplus.js',
        PushKind: 3,
        PushToken: expoPushToken,
    });
}

function getPairHtml(port) {
    return `
<!DOCTYPE html>
<html>
<body>
    <h1>Pairing RustOverlay...</h1>
    <p>Please log in with Steam to continue.</p>
    <a href="https://companion-rust.facepunch.com/login?returnUrl=http%3A%2F%2Flocalhost%3A${port}%2Fcallback">Log in with Steam</a>
    <script>
        window.location.href = "https://companion-rust.facepunch.com/login?returnUrl=http%3A%2F%2Flocalhost%3A${port}%2Fcallback";
    </script>
</body>
</html>`;
}

async function linkSteamWithRustPlus() {
    return new Promise((resolve, reject) => {
        const app = express();
        let server;

        app.get('/', (req, res) => {
            res.send(getPairHtml(3000));
        });

        app.get('/callback', async (req, res) => {
            const authToken = req.query.token;
            if (authToken) {
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head><style>body{background:#1a1a1a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
                    <body><h2>Success! You can close this window.</h2></body>
                    </html>
                `);
                console.log(JSON.stringify({ type: "login_success" }));
                resolve(authToken);
            } else {
                res.status(400).send('Missing token');
                reject(new Error('Missing token'));
            }
            if (server) server.close();
        });

        const port = 3000;
        server = app.listen(port, () => {
            console.log(JSON.stringify({ 
                type: "open_login", 
                url: `http://localhost:${port}` 
            }));
        });
    });
}

async function register() {
    console.log(JSON.stringify({ status: "Registering with FCM..." }));
    const apiKey = "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY";
    const projectId = "rust-companion-app";
    const gcmSenderId = "976529667804";
    const gmsAppId = "1:976529667804:android:d6f1ddeb4403b338fea619";
    const androidPackageName = "com.facepunch.rust.companion";
    const androidPackageCert = "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD";
    
    const fcmCredentials = await AndroidFCM.register(apiKey, projectId, gcmSenderId, gmsAppId, androidPackageName, androidPackageCert);

    console.log(JSON.stringify({ status: "Waiting for Steam Login..." }));
    const expoPushToken = await getExpoPushToken(fcmCredentials.fcm.token);
    const rustplusAuthToken = await linkSteamWithRustPlus();

    console.log(JSON.stringify({ status: "Registering with Facepunch..." }));
    await registerWithRustPlus(rustplusAuthToken, expoPushToken);

    const config = {
        fcm_credentials: fcmCredentials,
        expo_push_token: expoPushToken,
        rustplus_auth_token: rustplusAuthToken,
    };
    saveConfig(config);
    return config;
}

async function listen() {
    let config = readConfig();
    if (!config) {
        config = await register();
    }

    const androidId = config.fcm_credentials.gcm.androidId;
    const securityToken = config.fcm_credentials.gcm.securityToken;
    const client = new PushReceiverClient(androidId, securityToken, []);

    client.on('ON_DATA_RECEIVED', (data) => {
        console.log(JSON.stringify({ status: "Received RAW FCM Push", raw: data }));
        
        let bodyString = "{}";
        if (data.appData && Array.isArray(data.appData)) {
            const bodyObj = data.appData.find(x => x.key === 'body');
            if (bodyObj) bodyString = bodyObj.value;
        } else if (data.message && data.message.data) {
            bodyString = data.message.data.body || "{}";
        }

        try {
            const parsed = JSON.parse(bodyString);
            if (parsed.type === 'server') {
                console.log(JSON.stringify({
                    type: "pairing",
                    ip: parsed.ip,
                    port: parseInt(parsed.port),
                    playerId: parsed.playerId,
                    playerToken: parseInt(parsed.playerToken)
                }));
            } else if (parsed.type === 'entity') {
                console.log(JSON.stringify({
                    type: "entity_pairing",
                    entityId: parsed.entityId,
                    entityType: parsed.entityType,
                    entityName: parsed.entityName,
                    // Server identity so devices can be grouped per-server and
                    // distinguished from the currently-connected server.
                    serverName: parsed.name || '',
                    ip: parsed.ip || '',
                    port: parsed.port ? parseInt(parsed.port) : null,
                    playerId: parsed.playerId || '',
                }));
            } else if (parsed.type === 'alarm') {
                // Smart Alarm trigger push. The notification title/message live
                // in the FCM appData (not the JSON body), so pass them through.
                let title = 'Alarm';
                let message = 'Your base is under attack!';
                if (data.appData && Array.isArray(data.appData)) {
                    const t = data.appData.find(x => x.key === 'title');
                    const m = data.appData.find(x => x.key === 'message');
                    if (t && t.value) title = t.value;
                    if (m && m.value) message = m.value;
                }
                console.log(JSON.stringify({
                    type: "alarm",
                    title,
                    message,
                    serverName: parsed.name || '',
                    ip: parsed.ip || '',
                    port: parsed.port ? parseInt(parsed.port) : null,
                }));
            }
        } catch (e) {
            console.log(JSON.stringify({ status: "Failed to parse JSON body", body: bodyString }));
        }
    });

    client.on('ON_DISCONNECT', () => console.log(JSON.stringify({ status: "FCM Disconnected" })));
    client.on('ON_CONNECT', () => console.log(JSON.stringify({ status: "FCM Connected" })));

    console.log(JSON.stringify({ status: "Listening for Pairing Requests..." }));
    await client.connect();
}

listen().catch(console.error);
