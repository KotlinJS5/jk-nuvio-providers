// TwoEmbed Scraper for Nuvio Local Scrapers
// React Native compatible version with full original functionality

const cheerio = require('cheerio');
//-without-node-native

// TMDB API Configuration
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// TwoEmbed Configuration
let twoEmbedAPI = "https://www.2embed.cc";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Referer": `${twoEmbedAPI}/`,
};

// =================================================================================
// UTILITY FUNCTIONS (from Utils.kt)
// =================================================================================

// Format bytes to human readable size
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Extract server name from source string
function extractServerName(source) {
    if (!source) return 'Unknown';

    const src = source.trim();

    if (/HubCloud/i.test(src)) {
        if (/FSL/i.test(src)) return 'HubCloud FSL Server';
        if (/FSL V2/i.test(src)) return 'HubCloud FSL V2 Server';
        if (/S3/i.test(src)) return 'HubCloud S3 Server';
        if (/Buzz/i.test(src)) return 'HubCloud BuzzServer';
        if (/10\s*Gbps/i.test(src)) return 'HubCloud 10Gbps';
        return 'HubCloud';
    }

    if (/Pixeldrain/i.test(src)) return 'Pixeldrain';
    if (/StreamTape/i.test(src)) return 'StreamTape';
    if (/HubCdn/i.test(src)) return 'HubCdn';
    if (/HbLinks/i.test(src)) return 'HbLinks';
    if (/Hubstream/i.test(src)) return 'Hubstream';

    // Fallback: hostname
    return src.replace(/^www\./i, '').split(/[.\s]/)[0];
}

/**
 * Applies a ROT13 cipher to a string.
 * Replicates the `pen()` function from Utils.kt.
 * @param {string} value The input string.
 * @returns {string} The ROT13'd string.
 */
function rot13(value) {
    return value.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

// React Native-safe Base64 polyfill (no Buffer dependency)
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function atob(value) {
    if (!value) return '';
    let input = String(value).replace(/=+$/, '');
    let output = '';
    let bc = 0, bs, buffer, idx = 0;
    while ((buffer = input.charAt(idx++))) {
        buffer = BASE64_CHARS.indexOf(buffer);
        if (~buffer) {
            bs = bc % 4 ? bs * 64 + buffer : buffer;
            if (bc++ % 4) {
                output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
            }
        }
    }
    return output;
}

function btoa(value) {
    if (value == null) return '';
    let str = String(value);
    let output = '';
    let i = 0;
    while (i < str.length) {
        const chr1 = str.charCodeAt(i++);
        const chr2 = str.charCodeAt(i++);
        const chr3 = str.charCodeAt(i++);

        const enc1 = chr1 >> 2;
        const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        let enc4 = chr3 & 63;

        if (isNaN(chr2)) {
            enc3 = 64;
            enc4 = 64;
        } else if (isNaN(chr3)) {
            enc4 = 64;
        }

        output +=
            BASE64_CHARS.charAt(enc1) +
            BASE64_CHARS.charAt(enc2) +
            BASE64_CHARS.charAt(enc3) +
            BASE64_CHARS.charAt(enc4);
    }
    return output;
}

/**
 * Cleans title by extracting quality and codec information.
 * Replicates the `cleanTitle` function from Utils.kt.
 * @param {string} title The title string to clean.
 * @returns {string} The cleaned title with quality/codec info.
 */
function cleanTitle(title) {
    const parts = title.split(/[.\-_]/);

    const qualityTags = [
        "WEBRip", "WEB-DL", "WEB", "BluRay", "HDRip", "DVDRip", "HDTV",
        "CAM", "TS", "R5", "DVDScr", "BRRip", "BDRip", "DVD", "PDTV", "HD"
    ];

    const audioTags = [
        "AAC", "AC3", "DTS", "MP3", "FLAC", "DD5", "EAC3", "Atmos"
    ];

    const subTags = [
        "ESub", "ESubs", "Subs", "MultiSub", "NoSub", "EnglishSub", "HindiSub"
    ];

    const codecTags = [
        "x264", "x265", "H264", "HEVC", "AVC"
    ];

    const startIndex = parts.findIndex(part =>
        qualityTags.some(tag => part.toLowerCase().includes(tag.toLowerCase()))
    );

    const endIndex = parts.findLastIndex(part =>
        subTags.some(tag => part.toLowerCase().includes(tag.toLowerCase())) ||
        audioTags.some(tag => part.toLowerCase().includes(tag.toLowerCase())) ||
        codecTags.some(tag => part.toLowerCase().includes(tag.toLowerCase()))
    );

    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
        return parts.slice(startIndex, endIndex + 1).join(".");
    } else if (startIndex !== -1) {
        return parts.slice(startIndex).join(".");
    } else {
        return parts.slice(-3).join(".");
    }
}

/**
 * Fetches the latest domain for Moviesdrive.
 * Replicates the `getDomains` function from the provider.
 */
function fetchAndUpdateDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
        return Promise.resolve();
    }

    console.log('[Moviesdrive] Fetching latest domain...');
    return fetch(DOMAINS_URL, {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }).then(function (response) {
        if (response.ok) {
            return response.json().then(function (data) {
                if (data && data.Moviesdrive) {
                    const newDomain = data.Moviesdrive;
                    if (newDomain !== MAIN_URL) {
                        console.log(`[Moviesdrive] Updating domain from ${MAIN_URL} to ${newDomain}`);
                        MAIN_URL = newDomain;
                        HEADERS.Referer = `${MAIN_URL}/`;
                        domainCacheTimestamp = now;
                    }
                }
            });
        }
    }).catch(function (error) {
        console.error(`[Moviesdrive] Failed to fetch latest domains: ${error.message}`);
    });
}

/**
 * Gets the current domain, ensuring it's always up to date.
 * Should be called before any main site requests.
 */
function getCurrentDomain() {
    return fetchAndUpdateDomain().then(function () {
        return MAIN_URL;
    });
}

/**
 * Resolves obfuscated redirector links (e.g., hubdrive.fit/?id=...).
 * This is a direct translation of the `getRedirectLinks` function from `Utils.kt`.
 * @param {string} url The obfuscated URL.
 * @returns {Promise<string>} The resolved direct link.
 */
function getRedirectLinks(url) {
    return fetch(url, { headers: HEADERS })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.text();
        })
        .then(doc => {
            const regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
            let combinedString = '';
            let match;
            while ((match = regex.exec(doc)) !== null) {
                const extractedValue = match[1] || match[2];
                if (extractedValue) {
                    combinedString += extractedValue;
                }
            }

            if (!combinedString) {
                console.error("[getRedirectLinks] Could not find encoded strings in page.");
                return url;
            }

            const decodedString = atob(rot13(atob(atob(combinedString))));
            const jsonObject = JSON.parse(decodedString);

            const encodedUrl = atob(jsonObject.o || '').trim();
            if (encodedUrl) {
                return encodedUrl;
            }

            const data = btoa(jsonObject.data || '').trim();
            const wpHttp = (jsonObject.blog_url || '').trim();
            if (wpHttp && data) {
                return fetch(`${wpHttp}?re=${data}`, { headers: HEADERS })
                    .then(directLinkResponse => directLinkResponse.text())
                    .then(text => text.trim());
            }

            return url; // Return original url if logic fails
        })
        .catch(e => {
            console.error(`[getRedirectLinks] Error processing link ${url}:`, e.message);
            return url; // Fallback to original URL
        });
}

// =================================================================================
// EXTRACTORS (from Extractors.kt)
// =================================================================================

/**
 * Extract direct download link from Pixeldrain.
 * Pixeldrain direct link format: https://pixeldrain.com/api/file/{id}?download
 */
function pixelDrainExtractor(link) {
    return Promise.resolve().then(() => {
        let fileId;
        // link can be pixeldrain.com/u/{id} or pixeldrain.dev/... or pixeldrain.xyz/...
        const match = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
        if (match) {
            fileId = match[1];
        } else {
            fileId = link.split('/').pop();
        }
        if (!fileId) {
            return [{ source: 'Pixeldrain', quality: 'Unknown', url: link }];
        }

        // Fetch file info to get the name, size, and determine quality
        const infoUrl = `https://pixeldrain.com/api/file/${fileId}/info`;
        let fileInfo = { name: '', quality: 'Unknown', size: 0 };

        return fetch(infoUrl, { headers: HEADERS })
            .then(response => response.json())
            .then(info => {
                if (info && info.name) {
                    fileInfo.name = info.name;
                    fileInfo.size = info.size || 0;

                    // Infer quality from filename
                    const qualityMatch = info.name.match(/(\d{3,4})p/);
                    if (qualityMatch) {
                        fileInfo.quality = qualityMatch[0];
                    }
                }
                const directUrl = `https://pixeldrain.com/api/file/${fileId}?download`;
                return [{
                    source: 'Pixeldrain',
                    quality: fileInfo.quality,
                    url: directUrl,
                    name: fileInfo.name,
                    size: fileInfo.size,
                }];
            })
            .catch(e => {
                console.warn(`[Pixeldrain] Could not fetch file info for ${fileId}:`, e.message);
                const directUrl = `https://pixeldrain.com/api/file/${fileId}?download`;
                return [{
                    source: 'Pixeldrain',
                    quality: fileInfo.quality,
                    url: directUrl,
                    name: fileInfo.name,
                    size: fileInfo.size,
                }];
            });
    }).catch(e => {
        console.error('[Pixeldrain] extraction failed', e.message);
        return [{ source: 'Pixeldrain', quality: 'Unknown', url: link }];
    });
}

/**
 * Extract streamable URL from StreamTape.
 * This function normalizes the URL to streamtape.com and tries to find the direct video link.
 */
function streamTapeExtractor(link) {
    // Streamtape has many domains, but .com is usually the most reliable for video pages.
    const url = new URL(link);
    url.hostname = 'streamtape.com';
    const normalizedLink = url.toString();

    return fetch(normalizedLink, { headers: HEADERS })
        .then(res => res.text())
        .then(data => {
            // Regex to find something like: document.getElementById('videolink').innerHTML = ...
            const match = data.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/);

            if (match && match[1]) {
                const scriptContent = match[1];
                // The script might contain a direct URL part or a function call to build it. We look for the direct part.
                const urlPartMatch = scriptContent.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);

                if (urlPartMatch && urlPartMatch[1]) {
                    const videoSrc = 'https:' + urlPartMatch[1];
                    return [{ source: 'StreamTape', quality: 'Stream', url: videoSrc }];
                }
            }

            // A simpler, secondary regex if the above fails (e.g., the script is not complex).
            const simpleMatch = data.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
            if (simpleMatch && simpleMatch[0]) {
                const videoSrc = 'https:' + simpleMatch[0].slice(1, -1); // remove quotes
                return [{ source: 'StreamTape', quality: 'Stream', url: videoSrc }];
            }

            // If we reach here, the link is likely dead or protected. Return nothing.
            return [];
        })
        .catch(e => {
            // A 404 error just means the link is dead. We can ignore it and return nothing.
            if (!e.response || e.response.status !== 404) {
                console.error(`[StreamTape] An unexpected error occurred for ${normalizedLink}:`, e.message);
            }
            return []; // Return empty array on any failure
        });
}

function hubStreamExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(response => {
            // For now, return the URL as-is since VidStack extraction is complex
            return [{ source: 'Hubstream', quality: 'Unknown', url }];
        })
        .catch(e => {
            console.error(`[Hubstream] Failed to extract from ${url}:`, e.message);
            return [];
        });
}

function hbLinksExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(response => response.text())
        .then(data => {
            const $ = cheerio.load(data);
            const links = $('h3 a, div.entry-content p a').map((i, el) => $(el).attr('href')).get();

            const finalLinks = [];
            const promises = links.map(link => loadExtractor(link, url));

            return Promise.all(promises)
                .then(results => {
                    results.forEach(extracted => finalLinks.push(...extracted));
                    return finalLinks;
                });
        });
}

function hubCdnExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(response => response.text())
        .then(data => {
            const encodedMatch = data.match(/r=([A-Za-z0-9+/=]+)/);
            if (encodedMatch && encodedMatch[1]) {
                const m3u8Data = atob(encodedMatch[1]);
                const m3u8Link = m3u8Data.substring(m3u8Data.lastIndexOf('link=') + 5);
                return [{
                    source: 'HubCdn',
                    quality: 'M3U8',
                    url: m3u8Link,
                }];
            }
            return [];
        })
        .catch(() => []);
}

function hubDriveExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(response => response.text())
        .then(data => {
            const $ = cheerio.load(data);
            const href = $('.btn.btn-primary.btn-user.btn-success1.m-1').attr('href');
            if (href) {
                return loadExtractor(href, url);
            }
            return [];
        })
        .catch(() => []);
}


function hubCloudExtractor(url, referer) {
    let currentUrl = url;

    // Replicate domain change logic from HubCloud extractor
    if (currentUrl.includes("hubcloud.ink")) {
        currentUrl = currentUrl.replace("hubcloud.ink", "hubcloud.dad");
    }

    if (/\/(video|drive)\//i.test(currentUrl)) {
        return fetch(currentUrl, {
            headers: { ...HEADERS, Referer: referer }
        })
            .then(r => r.text())
            .then(html => {
                const $ = cheerio.load(html);

                // Extract "Generate Direct Download Link"
                const hubPhp = $('a[href*="hubcloud.php"]').attr('href');
                if (!hubPhp) return [];

                // Consume hubcloud.php internally
                return hubCloudExtractor(hubPhp, currentUrl);
            })
            .catch(() => []);
    }


    const initialFetch = currentUrl.includes("hubcloud.php")
        ? fetch(currentUrl, {
            headers: { ...HEADERS, Referer: referer },
            redirect: "follow"
        }).then(response =>
            response.text().then(html => ({
                pageData: html,
                finalUrl: response.url || currentUrl
            }))
        )
        : fetch(currentUrl, {
            headers: { ...HEADERS, Referer: referer }
        })
            .then(r => r.text())
            .then(pageData => {
                let finalUrl = currentUrl;
                const scriptUrlMatch = pageData.match(/var url = '([^']*)'/);
                if (scriptUrlMatch && scriptUrlMatch[1]) {
                    finalUrl = scriptUrlMatch[1];
                    return fetch(finalUrl, {
                        headers: { ...HEADERS, Referer: currentUrl }
                    })
                        .then(r => r.text())
                        .then(secondData => ({
                            pageData: secondData,
                            finalUrl
                        }));
                }
                return { pageData, finalUrl };
            });

    return initialFetch
        .then(({ pageData, finalUrl }) => {
            const $ = cheerio.load(pageData);

            const size = $('i#size').text().trim();
            const header = $('div.card-header').text().trim();

            const getIndexQuality = (str) => {
                const match = (str || '').match(/(\d{3,4})[pP]/);
                return match ? parseInt(match[1]) : 2160;
            };

            const quality = getIndexQuality(header);
            const headerDetails = cleanTitle(header);

            const labelExtras = (() => {
                let extras = '';
                if (headerDetails) extras += `[${headerDetails}]`;
                if (size) extras += `[${size}]`;
                return extras;
            })();

            const sizeInBytes = (() => {
                if (!size) return 0;
                const m = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
                if (!m) return 0;
                const v = parseFloat(m[1]);
                if (m[2].toUpperCase() === 'GB') return v * 1024 ** 3;
                if (m[2].toUpperCase() === 'MB') return v * 1024 ** 2;
                if (m[2].toUpperCase() === 'KB') return v * 1024;
                return 0;
            })();

            const links = [];
            const elements = $('a.btn[href]').get();

            const processElements = elements.map(el => {
                const link = $(el).attr('href');
                const text = $(el).text();

                if (/telegram/i.test(text) || /telegram/i.test(link)) {
                    return Promise.resolve();
                }

                console.log(`[HubCloud] Found ${text} link ${link}`);

                const fileName = header || headerDetails || 'Unknown';

                if (text.includes("Download File")) {
                    links.push({
                        source: `HubCloud ${labelExtras}`,
                        quality,
                        url: link,
                        size: sizeInBytes,
                        fileName
                    });
                    return Promise.resolve();
                }

                if (text.includes("FSL V2")) {
                    links.push({
                        source: `HubCloud - FSL V2 Server ${labelExtras}`,
                        quality,
                        url: link,
                        size: sizeInBytes,
                        fileName
                    });
                    return Promise.resolve();
                }

                if (text.includes("FSL")) {
                    links.push({
                        source: `HubCloud - FSL Server ${labelExtras}`,
                        quality,
                        url: link,
                        size: sizeInBytes,
                        fileName
                    });
                    return Promise.resolve();
                }

                if (text.includes("S3 Server")) {
                    links.push({
                        source: `HubCloud - S3 Server ${labelExtras}`,
                        quality,
                        url: link,
                        size: sizeInBytes,
                        fileName
                    });
                    return Promise.resolve();
                }

                if (text.includes("BuzzServer")) {
                    return fetch(`${link}/download`, {
                        method: 'GET',
                        headers: { ...HEADERS, Referer: link },
                        redirect: 'manual'
                    })
                        .then(resp => {
                            if (resp.status >= 300 && resp.status < 400) {
                                const loc = resp.headers.get('location');
                                const m = loc?.match(/hx-redirect=([^&]+)/);
                                if (m) {
                                    links.push({
                                        source: `HubCloud - BuzzServer ${labelExtras}`,
                                        quality,
                                        url: decodeURIComponent(m[1]),
                                        size: sizeInBytes,
                                        fileName
                                    });
                                }
                            }
                        })
                        .catch(() => { });
                }

                if (link.includes("pixeldra")) {
                    return pixelDrainExtractor(link)
                        .then(extracted => {
                            links.push(...extracted.map(l => ({
                                ...l,
                                quality: typeof l.quality === 'number' ? l.quality : quality,
                                size: l.size || sizeInBytes,
                                fileName
                            })));
                        })
                        .catch(() => { });
                }

                if (text.includes("10Gbps")) {
                    let redirectUrl = link;
                    let finalLink = null;

                    const walk = (i) => {
                        if (i >= 5) return Promise.resolve(finalLink);
                        return fetch(redirectUrl, { redirect: 'manual' })
                            .then(r => {
                                if (r.status >= 300 && r.status < 400) {
                                    const loc = r.headers.get('location');
                                    if (loc?.includes("link=")) {
                                        finalLink = loc.split("link=")[1];
                                        return finalLink;
                                    }
                                    if (loc) redirectUrl = new URL(loc, redirectUrl).toString();
                                    return walk(i + 1);
                                }
                                return finalLink;
                            })
                            .catch(() => finalLink);
                    };

                    return walk(0).then(dlink => {
                        if (dlink) {
                            links.push({
                                source: `HubCloud - 10Gbps ${labelExtras}`,
                                quality,
                                url: dlink,
                                size: sizeInBytes,
                                fileName
                            });
                        }
                    });
                }

                return loadExtractor(link, finalUrl).then(r => links.push(...r));
            });

            return Promise.all(processElements).then(() => links);
        })
        .catch(() => []);
}



async function gdFlixExtractor(url, referer = null) {
    const links = [];

    const getIndexQuality = (name) => {
        const m = (name || '').match(/(\d{3,4})[pP]/);
        return m ? parseInt(m[1]) : 2160;
    };

    const toBytes = (size) => {
        if (!size) return 0;
        const m = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
        if (!m) return 0;
        const v = parseFloat(m[1]);
        return m[2].toUpperCase() === 'GB' ? v * 1024 ** 3 :
            m[2].toUpperCase() === 'MB' ? v * 1024 ** 2 :
                v * 1024;
    };

    try {
        /* meta refresh redirect */
        let res = await fetch(url, { headers: HEADERS });
        let html = await res.text();
        let refresh = html.match(/url=([^"]+)/i);
        let finalUrl = refresh ? refresh[1] : url;

        const page = await fetch(finalUrl, { headers: HEADERS }).then(r => r.text());
        const $ = cheerio.load(page);

        const fileName = $('li:contains("Name")').text().replace('Name :', '').trim();
        const fileSizeText = $('li:contains("Size")').text().replace('Size :', '').trim();
        const quality = getIndexQuality(fileName);
        const sizeBytes = toBytes(fileSizeText);

        const anchors = $('div.text-center a[href]').get();

        for (const a of anchors) {
            const el = $(a);
            const text = el.text().toLowerCase();
            const href = el.attr('href');

            /* DIRECT */
            if (text.includes('direct')) {
                links.push({
                    source: 'GDFlix [Direct]',
                    quality,
                    url: href,
                    size: sizeBytes,
                    fileName
                });
            }

            /* INDEX LINKS */
            else if (text.includes('index')) {
                const indexPage = await fetch(`https://new6.gdflix.dad${href}`).then(r => r.text());
                const $$ = cheerio.load(indexPage);

                const btns = $$('a.btn-outline-info').get();
                for (const b of btns) {
                    const serverUrl = 'https://new6.gdflix.dad' + $$(b).attr('href');
                    const serverPage = await fetch(serverUrl).then(r => r.text());
                    const $$$ = cheerio.load(serverPage);

                    $$$('div.mb-4 > a[href]').each((_, x) => {
                        links.push({
                            source: 'GDFlix [Index]',
                            quality,
                            url: $$(x).attr('href'),
                            size: sizeBytes,
                            fileName
                        });
                    });
                }
            }

            /* DRIVEBOT */
            else if (text.includes('drivebot')) {
                const id = href.match(/id=([^&]+)/)?.[1];
                const doId = href.match(/do=([^=]+)/)?.[1];
                if (!id || !doId) continue;

                const bases = ['https://drivebot.sbs', 'https://drivebot.cfd'];

                for (const base of bases) {
                    try {
                        const bot = await fetch(`${base}/download?id=${id}&do=${doId}`);
                        const cookie = bot.headers.get('set-cookie') || '';
                        const html = await bot.text();

                        const token = html.match(/token', '([a-f0-9]+)/)?.[1];
                        const postId = html.match(/download\?id=([^']+)/)?.[1];
                        if (!token || !postId) continue;

                        const dl = await fetch(`${base}/download?id=${postId}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': `${base}/download?id=${id}&do=${doId}`,
                                'Cookie': cookie
                            },
                            body: `token=${token}`
                        }).then(r => r.text());

                        const final = dl.match(/url":"(.*?)"/)?.[1]?.replace(/\\/g, '');
                        if (final) {
                            links.push({
                                source: 'GDFlix [DriveBot]',
                                quality,
                                url: final,
                                size: sizeBytes,
                                fileName
                            });
                        }
                    } catch { }
                }
            }

            /* INSTANT DL */
            else if (text.includes('instant')) {
                const r = await fetch(href, { redirect: 'manual' });
                const loc = r.headers.get('location');
                if (loc) {
                    links.push({
                        source: 'GDFlix [Instant]',
                        quality,
                        url: loc.replace('url=', ''),
                        size: sizeBytes,
                        fileName
                    });
                }
            }

            /* GOFILE */
            else if (text.includes('gofile')) {
                const extracted = await goFileExtractor(href);
                extracted.forEach(l => links.push({
                    ...l,
                    quality,
                    size: l.size || sizeBytes,
                    fileName
                }));
            }

            /* PIXELDRAIN */
            else if (text.includes('pixel')) {
                return pixelDrainExtractor(link)
                    .then(extracted => {
                        links.push(...extracted.map(l => ({
                            ...l,
                            quality: typeof l.quality === 'number' ? l.quality : quality,
                            size: l.size || sizeInBytes,
                            fileName
                        })));
                    }).catch(() => { });
            }
        }
    } catch { }

    return links;
}

async function goFileExtractor(url) {
    const links = [];
    try {
        const id = url.match(/(?:\?c=|\/d\/)([a-zA-Z0-9-]+)/)?.[1];
        if (!id) return [];

        const acc = await fetch('https://api.gofile.io/accounts', { method: 'POST' }).then(r => r.json());
        const token = acc?.data?.token;
        if (!token) return [];

        const js = await fetch('https://gofile.io/dist/js/global.js').then(r => r.text());
        const wt = js.match(/appdata\.wt\s*=\s*["']([^"']+)/)?.[1];
        if (!wt) return [];

        const data = await fetch(`https://api.gofile.io/contents/${id}?wt=${wt}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json());

        const files = Object.values(data.data.children);
        const file = files[0];
        if (!file) return [];

        const size = file.size;
        const sizeFormatted =
            size < 1024 ** 3
                ? `${(size / 1024 ** 2).toFixed(2)} MB`
                : `${(size / 1024 ** 3).toFixed(2)} GB`;

        links.push({
            source: 'GoFile',
            quality: getIndexQuality(file.name),
            url: file.link,
            size,
            fileName: file.name,
            headers: { Cookie: `accountToken=${token}` },
            label: `GoFile [${sizeFormatted}]`
        });
    } catch { }

    return links;
}


/**
 * Main extractor dispatcher. Determines which specific extractor to use based on the URL.
 * Replicates the `loadExtractor` logic flow.
 * @param {string} url The URL of the hoster page.
 * @param {string} referer The referer URL.
 * @returns {Promise<Array<{quality: string, url: string, source: string}>>} A list of final links.
 */
function loadExtractor(url, referer = MAIN_URL) {
    const hostname = new URL(url).hostname;

    if (hostname.includes('gdflix')) {
        return gdFlixExtractor(url, referer);
    }

    if (hostname.includes('gofile')) {
        return goFileExtractor(url);
    }

    if (hostname.includes('hubcloud')) {
        return hubCloudExtractor(url, referer);
    }
    if (hostname.includes('hubdrive')) {
        return hubDriveExtractor(url, referer);
    }
    if (hostname.includes('hubcdn')) {
        return hubCdnExtractor(url, referer);
    }
    if (hostname.includes('hblinks')) {
        return hbLinksExtractor(url, referer);
    }
    if (hostname.includes('hubstream')) {
        return hubStreamExtractor(url, referer);
    }
    if (hostname.includes('pixeldrain')) {
        return pixelDrainExtractor(url);
    }
    if (hostname.includes('streamtape')) {
        return streamTapeExtractor(url);
    }
    if (hostname.includes('hdstream4u')) {
        // This is VidHidePro, often a simple redirect. For this script, we assume it's a direct link.
        return Promise.resolve([{ source: 'HdStream4u', quality: 'Unknown', url }]);
    }

    // Skip unsupported hosts like linkrit.com
    if (hostname.includes('linkrit')) {
        return Promise.resolve([]);
    }
    if (
        hostname.includes('google.') ||
        hostname.includes('ampproject.org') ||
        hostname.includes('gstatic.') ||
        hostname.includes('doubleclick.') ||
        hostname.includes('ddl2')
    ) {
        console.warn('[Moviesdrive] Blocked redirect host:', hostname);
        return Promise.resolve([]);
    }


    // Default case for unknown extractors, use the hostname as the source.
    const sourceName = hostname.replace(/^www\./, '');
    return Promise.resolve([{ source: sourceName, quality: 'Unknown', url }]);
}

async function fetchTwoEmbed(imdbId, season = null, episode = null) {
   const url =
    season == null
        ? `${twoEmbedAPI}/embed/${imdbId}`
        : `${twoEmbedAPI}/embedtv/${imdbId}&s=${season}&e=${episode}`;

console.log(`[TwoEmbed] Fetching URL: ${url}`);

    const html = await fetch(url, {
        headers: { ...HEADERS }
    });

    const $ = cheerio.load(html);

    const frameSrc = $('iframe#iframesrc').attr('data-src');
    if (!frameSrc) return null;

    const ref = new URL(frameSrc).origin + '/';
    const id = frameSrc.split('id=')[1]?.split('&')[0];

    if (!id) return null;

    return {
        ref,
        id,
        extractorUrl: `https://uqloads.xyz/e/${id}`
    };
}


// =================================================================================
/**
 * Get movie/TV show details from TMDB
 * @param {string} tmdbId TMDB ID
 * @param {string} mediaType "movie" or "tv"
 * @returns {Promise<Object>} Media details
 */
function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

    return fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }).then(function (response) {
        console.error('[TMDB] HTTP status:', response.status);
        if (!response.ok) {
            throw new Error(`TMDB API error: ${response.status}`);
        }
        return response.json();
    }).then(function (data) {
        const title = mediaType === 'tv' ? data.name : data.title;
        const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
        const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
        return {
            title: title,
            year: year,
            imdbId: data.external_ids?.imdb_id || null
        };
    });
}

/**
 * Main function for Nuvio integration
 * @param {string} tmdbId TMDB ID
 * @param {string} mediaType "movie" or "tv"
 * @param {number} season Season number (TV only)
 * @param {number} episode Episode number (TV only)
 * @returns {Promise<Array>} Array of stream objects
 */
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[TwoEmbed] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${mediaType === 'tv' ? `, S:${season}E:${episode}` : ''}`);

    // First, get movie/TV show details from TMDB
    return getTMDBDetails(tmdbId, mediaType).then(async function (mediaInfo) {
    if (!mediaInfo.imdbId) throw new Error('Missing IMDb ID');

    const twoEmbedData = await fetchTwoEmbed(
        mediaInfo.imdbId,
        mediaType === 'tv' ? season : null,
        mediaType === 'tv' ? episode : null
    );

    if (!twoEmbedData) {
        console.log('[TwoEmbed] iframe not found');
        return [];
    }

    const { extractorUrl, ref } = twoEmbedData;

    return loadExtractor(
        extractorUrl,
        ref
    );
    }).catch(function (error) {
        console.error(`[TwoEmbed] Scraping error: ${error.message}`);
        return [];
    });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.getStreams = { getStreams };
}