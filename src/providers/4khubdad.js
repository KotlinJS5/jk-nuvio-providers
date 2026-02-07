const cheerio = require('cheerio-without-node-native');

const KHUB_API = "https://4khdhub.dad";
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Referer": `${KHUB_API}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1"
};

/**
 * Extract quality from text
 */
function extractQuality(text) {
    if (!text) return 1080;
    const text_lower = text.toLowerCase();
    
    if (text_lower.includes('2160p') || text_lower.includes('4k')) return 2160;
    if (text_lower.includes('1440p')) return 1440;
    if (text_lower.includes('1080p')) return 1080;
    if (text_lower.includes('720p')) return 720;
    if (text_lower.includes('480p')) return 480;
    if (text_lower.includes('360p')) return 360;
    
    return 1080;
}

/**
 * Format quality number to string
 */
function formatQuality(quality) {
    if (quality >= 2160) return '2160p';
    if (quality >= 1440) return '1440p';
    if (quality >= 1080) return '1080p';
    if (quality >= 720) return '720p';
    if (quality >= 480) return '480p';
    if (quality >= 360) return '360p';
    return 'Unknown';
}

/**
 * Get TMDB details
 */
function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    return fetch(url, { headers: HEADERS })
        .then(res => {
            if (!res.ok) throw new Error('TMDB error');
            return res.json();
        })
        .then(data => {
            const title = mediaType === 'tv' ? data.name : data.title;
            const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
            const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
            
            return {
                title: title,
                year: year
            };
        })
        .catch(err => {
            console.error(`[4KHDHub] TMDB error: ${err.message}`);
            throw err;
        });
}

/**
 * Main getStreams function - Promise-based (NO async/await)
 */
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    return Promise.resolve()
        .then(() => getTMDBDetails(tmdbId, mediaType))
        .then(mediaInfo => {
            if (!mediaInfo || !mediaInfo.title) {
                console.error('[4KHDHub] No media info from TMDB');
                return [];
            }
            
            console.log(`[4KHDHub] Searching for: ${mediaInfo.title}`);
            
            // Search on 4khdhub
            const searchUrl = `${KHUB_API}/?s=${encodeURIComponent(mediaInfo.title)}`;
            return fetch(searchUrl, { headers: HEADERS })
                .then(res => {
                    if (!res.ok) throw new Error('Search failed');
                    return res.text();
                })
                .then(html => {
                    if (!html || html.length < 100) throw new Error('Empty search response');
                    
                    const $ = cheerio.load(html);
                    const cards = $('a.movie-card');
                    
                    if (cards.length === 0) throw new Error('No search results');
                    
                    console.log(`[4KHDHub] Found ${cards.length} search results`);
                    
                    // Find best matching content
                    let bestUrl = null;
                    let bestTitle = null;
                    let bestMatch = 999;
                    
                    cards.each((i, el) => {
                        const $card = $(el);
                        const href = $card.attr('href');
                        const cardTitle = $card.find('.movie-card-title').text().toLowerCase();
                        const meta = $card.find('.movie-card-meta').text();
                        
                        // Extract year from meta if available
                        const yearMatch = meta.match(/\b(19|20)\d{2}\b/);
                        const cardYear = yearMatch ? parseInt(yearMatch[0]) : 0;
                        
                        // Check if title matches
                        if (cardTitle.includes(mediaInfo.title.toLowerCase())) {
                            const yearDiff = cardYear && mediaInfo.year ? Math.abs(cardYear - mediaInfo.year) : 0;
                            
                            if (yearDiff < bestMatch) {
                                bestMatch = yearDiff;
                                bestUrl = href.startsWith('http') ? href : `${KHUB_API}${href}`;
                                bestTitle = cardTitle;
                            }
                        }
                    });
                    
                    if (!bestUrl) {
                        console.error(`[4KHDHub] No matching content found for ${mediaInfo.title}`);
                        throw new Error('No matching content');
                    }
                    
                    console.log(`[4KHDHub] Best match: ${bestTitle} (${bestUrl})`);
                    
                    // Fetch content page
                    return fetch(bestUrl, { headers: HEADERS })
                        .then(res => {
                            if (!res.ok) throw new Error('Content page error');
                            return res.text();
                        })
                        .then(pageHtml => {
                            if (!pageHtml || pageHtml.length < 100) throw new Error('Empty content page');
                            
                            const $page = cheerio.load(pageHtml);
                            const collectedUrls = [];
                            
                            // Extract all download/stream links - simpler approach
                            const links = $page('a[href]');
                            console.log(`[4KHDHub] Checking ${links.length} links`);
                            
                            links.each((i, el) => {
                                try {
                                    const $link = $page(el);
                                    const href = $link.attr('href');
                                    const linkText = $link.text().trim();
                                    
                                    // Simple check: if href contains gadgetsweb, it's a download link
                                    if (href && href.includes('gadgetsweb')) {
                                        collectedUrls.push({
                                            url: href,
                                            text: linkText
                                        });
                                    }
                                } catch (e) {
                                    // Skip individual link errors
                                }
                            });
                            
                            console.log(`[4KHDHub] Extracted ${collectedUrls.length} download links`);
                            return collectedUrls;
                        })
                        .then(collectedUrls => {
                            if (!collectedUrls.length) {
                                console.error('[4KHDHub] No download links found');
                                return [];
                            }
                            
                            // Format streams for Nuvio
                            const streams = collectedUrls.map((item, idx) => {
                                const quality = extractQuality(item.text);
                                const qualityStr = formatQuality(quality);
                                
                                let title;
                                if (season && episode) {
                                    title = `${mediaInfo.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
                                } else if (mediaInfo.year) {
                                    title = `${mediaInfo.title} (${mediaInfo.year})`;
                                } else {
                                    title = mediaInfo.title;
                                }
                                
                                return {
                                    name: `4KHDHub - ${qualityStr}`,
                                    title: title,
                                    url: item.url,
                                    quality: quality,
                                    size: 0,
                                    headers: {
                                        'User-Agent': HEADERS['User-Agent'],
                                        'Referer': bestUrl
                                    },
                                    provider: '4khubdad'
                                };
                            });
                            
                            console.log(`[4KHDHub] Returning ${streams.length} streams`);
                            return streams;
                        });
                })
                .catch(err => {
                    console.error(`[4KHDHub] Search error: ${err.message}`);
                    return [];
                });
        })
        .catch(err => {
            console.error(`[4KHDHub] Fatal error: ${err.message}`);
            return [];
        });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
