const http = require('http');
const { exec } = require('child_process');

const PORT = 3001; // Port khusus untuk webhook github
const SECRET = 'raka'; // Bebas ganti password ini

http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            console.log('[AUTO-DEPLOY] Push event received! Updating codebase...');

            // Jalankan git pull dan restart PM2
            exec('git pull && pm2 restart bot-clipping --update-env', (error, stdout, stderr) => {
                if (error) {
                    console.error(`[AUTO-DEPLOY ERROR]: ${error.message}`);
                    res.writeHead(500);
                    return res.end('Deploy failed');
                }
                console.log(`[AUTO-DEPLOY SUCCESS]:\n${stdout}`);
                res.writeHead(200);
                res.end('Deployed successfully!');
            });
        });
    } else {
        res.writeHead(404);
        res.end();
    }
}).listen(PORT, () => {
    console.log(`🚀 Webhook listener running on port ${PORT}`);
});
