const https = require('https');
const http = require('http');
const querystring = require('querystring');

// Daftar User-Agent modern berganti-ganti (Windows, Mac, Android, iOS)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Ekstrak ID musik dari string numerik atau URL TikTok sound.
 */
function extractMusicId(input) {
    if (!input) return '';
    const str = String(input).trim();
    const match = str.match(/(?:music\/[^\s/]+-|\/music\/|music_id=)?(\d{15,25})/i);
    if (match) return match[1];
    const digitsOnly = str.match(/\d{15,25}/);
    if (digitsOnly) return digitsOnly[0];
    return str;
}

/**
 * Scrapes REAL TikTok public video metrics & extended metadata:
 * - Views & Likes
 * - Video ID & Author
 * - createTime (Unix timestamp in seconds)
 * - musicInfo (id, title, authorName, playUrl)
 * 
 * Menggunakan strategi multi-tier:
 * 1. URL resolution/expansion (menangani vt.tiktok.com dsb)
 * 2. TikWM Primary (www.tikwm.com) dengan rotasi User-Agent & realistic headers
 * 3. TikWM Fallback Host (tikwm.com) jika host utama rate limit
 * 4. Direct HTML scraping TikTok (dengan regex universal data)
 * @param {string} videoUrl 
 */
async function fetchTikTokMetrics(videoUrl) {
    try {
        if (!videoUrl || typeof videoUrl !== 'string') {
            return {
                success: false,
                id: '',
                authorUsername: '@unknown',
                views: 0,
                likes: 0,
                createTime: 0,
                musicInfo: { id: '', title: 'Unknown Sound', authorName: '', playUrl: '' },
                engagementScore: 0,
                likeRatePercent: '0.00'
            };
        }

        // Resolusi link pendek terlebih dahulu sebelum query API/HTML
        const cleanUrl = await resolveAllRedirects(videoUrl.trim());

        // 1. Primary Method: TikWM Primary Host
        let metrics = await fetchFromTikWMHost(cleanUrl, 'www.tikwm.com');

        // 2. Secondary Method: TikWM Fallback Host
        if (!metrics || metrics.views === 0) {
            metrics = await fetchFromTikWMHost(cleanUrl, 'tikwm.com');
        }

        // 3. Fallback Method: Direct HTML Scraping
        if (!metrics || metrics.views === 0) {
            metrics = await fetchFromTikTokDirect(cleanUrl);
        }

        if (!metrics) {
            metrics = {
                id: '',
                authorUsername: '@unknown',
                views: 0,
                likes: 0,
                createTime: 0,
                musicInfo: { id: '', title: 'Unknown Sound', authorName: '', playUrl: '' }
            };
        }

        const views = metrics.views || 0;
        const likes = metrics.likes || 0;

        // Calculate Engagement Rate (%) based on 10:1 ratio (10% Like Rate = 100% Score)
        const likeRatePercent = views > 0 ? (likes / views) * 100 : 0;
        const engagementScore = views > 0 ? Math.round((likeRatePercent / 10) * 100) : 0;

        return {
            success: views > 0 || (metrics.createTime && metrics.createTime > 0),
            id: metrics.id || '',
            authorUsername: metrics.authorUsername || '@unknown',
            views,
            likes,
            createTime: metrics.createTime || 0,
            musicInfo: metrics.musicInfo || { id: '', title: 'Unknown Sound', authorName: '', playUrl: '' },
            engagementScore,
            likeRatePercent: likeRatePercent.toFixed(2)
        };
    } catch (error) {
        console.error('[TIKTOK SCRAPER ERROR]:', error.message);
        return {
            success: false,
            id: '',
            authorUsername: '@unknown',
            views: 0,
            likes: 0,
            createTime: 0,
            musicInfo: { id: '', title: 'Unknown Sound', authorName: '', playUrl: '' },
            engagementScore: 0,
            likeRatePercent: '0.00'
        };
    }
}

/**
 * Fetch video metrics via TikWM API dengan Host & User-Agent dinamis
 */
function fetchFromTikWMHost(videoUrl, hostname) {
    return new Promise((resolve) => {
        const postData = querystring.stringify({
            url: videoUrl,
            count: 12,
            cursor: 0,
            web: 1
        });

        const ua = getRandomUserAgent();
        const options = {
            hostname,
            port: 443,
            path: '/api/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': ua,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': `https://${hostname}`,
                'Referer': `https://${hostname}/`
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (json && json.code === 0 && json.data) {
                        const musicObj = json.data.music_info || json.data.music || {};
                        const rawMusicId = musicObj.id ? String(musicObj.id) : (typeof musicObj === 'string' ? '' : '');

                        resolve({
                            id: String(json.data.id || ''),
                            authorUsername: json.data.author?.unique_id ? `@${json.data.author.unique_id}` : '@unknown',
                            views: parseInt(json.data.play_count || 0, 10),
                            likes: parseInt(json.data.digg_count || 0, 10),
                            createTime: parseInt(json.data.create_time || 0, 10),
                            musicInfo: {
                                id: rawMusicId,
                                title: String(musicObj.title || 'Unknown Sound'),
                                authorName: String(musicObj.author || musicObj.authorName || ''),
                                playUrl: String(musicObj.play || musicObj.playUrl || '')
                            }
                        });
                    } else if (json && json.msg && json.msg.includes('Free Api Limit')) {
                        // Rate limit terdeteksi — tunggu 3 detik lalu retry sekali
                        setTimeout(() => {
                            fetchFromTikWMHost(videoUrl, hostname).then(resolve);
                        }, 3000);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
        req.write(postData);
        req.end();
    });
}

/**
 * Fallback Method: Resolve redirects and scrape directly from HTML
 */
async function fetchFromTikTokDirect(videoUrl) {
    try {
        const resolvedUrl = await resolveAllRedirects(videoUrl);
        const html = await fetchHtml(resolvedUrl);

        if (!html) return null;

        let videoId = '';
        let views = 0;
        let likes = 0;
        let createTime = 0;
        let authorUsername = '@unknown';
        let musicInfo = {
            id: '',
            title: 'Unknown Sound',
            authorName: '',
            playUrl: ''
        };

        // Extract from JSON script tags
        const rehydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
        if (rehydrationMatch && rehydrationMatch[1]) {
            try {
                const jsonData = JSON.parse(rehydrationMatch[1]);
                const defaultScope = jsonData.__DEFAULT_SCOPE__ || {};
                const videoDetail = defaultScope['webapp.video-detail'] || {};
                const itemInfo = videoDetail.itemInfo?.itemStruct;

                if (itemInfo) {
                    videoId = itemInfo.id ? String(itemInfo.id) : '';
                    views = parseInt(itemInfo.stats?.playCount || 0, 10);
                    likes = parseInt(itemInfo.stats?.diggCount || 0, 10);
                    createTime = parseInt(itemInfo.createTime || 0, 10);
                    authorUsername = itemInfo.author?.uniqueId ? `@${itemInfo.author.uniqueId}` : authorUsername;

                    if (itemInfo.music) {
                        musicInfo = {
                            id: String(itemInfo.music.id || ''),
                            title: String(itemInfo.music.title || 'Unknown Sound'),
                            authorName: String(itemInfo.music.authorName || ''),
                            playUrl: String(itemInfo.music.playUrl || '')
                        };
                    }
                }
            } catch (e) {}
        }

        // Regex Fallback
        if (views === 0) {
            const playMatch = html.match(/"playCount":\s*(\d+)/) || html.match(/"play_count":\s*(\d+)/);
            if (playMatch) views = parseInt(playMatch[1], 10);

            const diggMatch = html.match(/"diggCount":\s*(\d+)/) || html.match(/"digg_count":\s*(\d+)/);
            if (diggMatch) likes = parseInt(diggMatch[1], 10);

            const authorMatch = html.match(/"uniqueId":\s*"([^"]+)"/);
            if (authorMatch) authorUsername = `@${authorMatch[1]}`;

            const idMatch = html.match(/"id":\s*"(\d{15,25})"/);
            if (idMatch) videoId = idMatch[1];
        }

        if (createTime === 0) {
            const createMatch = html.match(/"createTime":\s*"?(\d+)"?/) || html.match(/"create_time":\s*"?(\d+)"?/);
            if (createMatch) createTime = parseInt(createMatch[1], 10);
        }

        if (!musicInfo.id) {
            const musicMatch = html.match(/"music":\s*\{[^}]*"id":\s*"?(\d+)"?[^}]*"title":\s*"([^"]+)"/);
            if (musicMatch) {
                musicInfo.id = musicMatch[1];
                musicInfo.title = musicMatch[2];
            }
        }

        return {
            id: videoId,
            authorUsername,
            views,
            likes,
            createTime,
            musicInfo
        };
    } catch (e) {
        return null;
    }
}

function resolveAllRedirects(url, maxRedirects = 5) {
    return new Promise((resolve) => {
        let currentUrl = url;
        let count = 0;

        function step(targetUrl) {
            if (count >= maxRedirects || (!targetUrl.includes('vt.tiktok.com') && !targetUrl.includes('vm.tiktok.com') && !targetUrl.includes('/t/'))) {
                return resolve(targetUrl);
            }
            count++;

            const ua = getRandomUserAgent();
            const client = targetUrl.startsWith('https') ? https : http;
            const req = client.get(targetUrl, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            }, (res) => {
                if (res.headers.location) {
                    let loc = res.headers.location;
                    if (loc.startsWith('/')) {
                        try {
                            const parsed = new URL(targetUrl);
                            loc = `${parsed.protocol}//${parsed.host}${loc}`;
                        } catch (e) {}
                    }
                    step(loc);
                } else {
                    resolve(targetUrl);
                }
            });

            req.on('error', () => resolve(targetUrl));
            req.setTimeout(5000, () => {
                req.destroy();
                resolve(targetUrl);
            });
        }

        step(currentUrl);
    });
}

function fetchHtml(url) {
    return new Promise((resolve) => {
        const ua = getRandomUserAgent();
        const options = {
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.tiktok.com/'
            }
        };

        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', () => resolve(''));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve('');
        });
    });
}

module.exports = { 
    fetchTikTokMetrics,
    extractMusicId,
    resolveAllRedirects
};
