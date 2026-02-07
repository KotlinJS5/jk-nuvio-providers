const cheerio = require('cheerio-without-node-native');

const XDMOVIES_API = "https://xdmovies.site";

// TMDB API Configuration
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const XDMOVIES_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Referer": `${XDMOVIES_API}/`,
    "x-requested-with": "XMLHttpRequest"
};

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Referer": `${XDMOVIES_API}/`,
};

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function cleanTitle(title) {
    const parts = title.split(/[.\-_]/);
    const qualityTags = ["WEBRip", "WEB-DL", "WEB", "BluRay", "HDRip", "DVDRip", "HDTV", "CAM", "TS", "R5", "DVDScr", "BRRip", "BDRip", "DVD", "PDTV", "HD"];
    const audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD5", "EAC3", "Atmos"];
    const subTags = ["ESub", "ESubs", "Subs", "MultiSub", "NoSub", "EnglishSub", "HindiSub"];
    const codecTags = ["x264", "x265", "H264", "HEVC", "AVC"];

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
    const hostname = new URL(src).hostname;
    return hostname.replace(/^www\./, '').split(/[.\s]/)[0];
}

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

function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    return getTMDBDetails(tmdbId, mediaType)
        .then(mediaInfo => {
            if (!mediaInfo?.title) return [];

            // Search XDMovies
            return fetch(
                `${XDMOVIES_API}/php/search_api.php?query=${encodeURIComponent(mediaInfo.title)}&fuzzy=true`,
                { headers: XDMOVIES_HEADERS }
            )
                .then(r => r.ok ? r.json() : [])
                .then(searchData => {
                    if (!Array.isArray(searchData)) return [];

                    const matched = searchData.find(
                        x => Number(x.tmdb_id) === Number(tmdbId)
                    );
                    if (!matched?.path) return [];

                    // Fetch details page
                    return fetch(XDMOVIES_API + matched.path, {
                        headers: XDMOVIES_HEADERS
                    })
                        .then(r => r.text())
                        .then(html => {
                            const $ = cheerio.load(html);
                            const collectedUrls = [];

                            const resolveRedirect = (url) =>
                                fetch(url, {
                                    headers: XDMOVIES_HEADERS,
                                    redirect: 'manual'
                                })
                                    .then(res => {
                                        if (res.status >= 300 && res.status < 400) {
                                            const loc = res.headers.get('location');
                                            return loc ? new URL(loc, url).toString() : null;
                                        }
                                        return url;
                                    })
                                    .catch(() => null);

                            // MOVIE
                            if (!season) {
                                const rawLinks = $('div.download-item a[href]')
                                    .map((_, a) => $(a).attr('href'))
                                    .get();

                                return Promise.all(
                                    rawLinks.map(raw =>
                                        resolveRedirect(raw).then(finalUrl => {
                                            if (finalUrl) collectedUrls.push(finalUrl);
                                        })
                                    )
                                ).then(() => collectedUrls);
                            }

                            // TV
                            const epRegex = new RegExp(
                                `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`,
                                'i'
                            );

                            const jobs = [];

                            $('div.episode-card').each((_, card) => {
                                const $card = $(card);
                                const title = $card.find('.episode-title').text() || '';
                                if (!epRegex.test(title)) return;

                                $card.find('a[href]').each((_, a) => {
                                    const raw = $(a).attr('href');
                                    if (!raw) return;

                                    jobs.push(
                                        resolveRedirect(raw).then(finalUrl => {
                                            if (finalUrl) collectedUrls.push(finalUrl);
                                        })
                                    );
                                });
                            });

                            return Promise.all(jobs).then(() => collectedUrls);
                        })
                        .then(collectedUrls => {
                            if (!collectedUrls.length) return [];

                            // Extract streams
                            return Promise.all(
                                collectedUrls.map(url => {
                                    const hostname = new URL(url).hostname;

                                    if (hostname.includes('pixeldrain')) {
                                        return Promise.resolve([{ source: 'Pixeldrain', quality: 'Unknown', url }]);
                                    }
                                    if (hostname.includes('streamtape')) {
                                        return Promise.resolve([{ source: 'StreamTape', quality: 'Stream', url }]);
                                    }
                                    if (hostname.includes('hubcloud') || hostname.includes('hubdrive') || hostname.includes('hubcdn')) {
                                        return Promise.resolve([{ source: hostname, quality: 'Unknown', url }]);
                                    }

                                    const sourceName = hostname.replace(/^www\./, '');
                                    return Promise.resolve([{ source: sourceName, quality: 'Unknown', url }]);
                                })
                            ).then(results => {
                                const flat = results.flat();
                                const seen = new Set();

                                return flat.filter(link => {
                                    if (!link || !link.url) return false;
                                    if (seen.has(link.url)) return false;
                                    seen.add(link.url);
                                    return true;
                                }).map(link => {
                                    let title;
                                    if (mediaType === 'tv') {
                                        title =
                                            `${mediaInfo.title} ` +
                                            `S${String(season).padStart(2, '0')}` +
                                            `E${String(episode).padStart(2, '0')}`;
                                    } else if (mediaInfo.year) {
                                        title = `${mediaInfo.title} (${mediaInfo.year})`;
                                    } else {
                                        title = mediaInfo.title;
                                    }

                                    let quality = 'Unknown';
                                    if (link.quality >= 2160) quality = '2160p';
                                    else if (link.quality >= 1440) quality = '1440p';
                                    else if (link.quality >= 1080) quality = '1080p';
                                    else if (link.quality >= 720) quality = '720p';
                                    else if (link.quality >= 480) quality = '480p';
                                    else if (link.quality >= 360) quality = '360p';

                                    return {
                                        name: `XDMovies ${extractServerName(link.source)}`,
                                        title,
                                        url: link.url,
                                        quality,
                                        size: formatBytes(link.size),
                                        headers: link.headers,
                                        provider: 'xdmovies'
                                    };
                                });
                            });
                        });
                });
        })
        .catch(err => {
            console.error('[XDMovies] getStreams failed:', err.message);
            return [];
        });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
