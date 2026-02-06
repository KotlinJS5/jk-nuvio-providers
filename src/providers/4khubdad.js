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
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
        });
}

/**
 * Main getStreams function - Promise-based (NO async/await)
 */
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    return getTMDBDetails(tmdbId, mediaType)
        .then(mediaInfo => {
            if (!mediaInfo || !mediaInfo.title) {
                console.error('[4KHDHub] No media info');
                return [];
            }
            
            // Search on 4khdhub
            const searchUrl = `${KHUB_API}/?s=${encodeURIComponent(mediaInfo.title)}`;
            return fetch(searchUrl, { headers: HEADERS })
                .then(res => {
                    if (!res.ok) throw new Error('Search failed');
                    return res.text();
                })
                .then(html => {
                    if (!html || html.length < 100) throw new Error('Empty search');
                    
                    const $ = cheerio.load(html);
                    let bestUrl = null;
                    let bestMatch = 100;
                    
                    // Find best matching content
                    $('a').each((i, el) => {
                        const href = $(el).attr('href');
                        const text = $(el).text().toLowerCase();
                        
                        if (href && !href.includes('/category/') && !href.includes('/?s=') && text.length > 0) {
                            if (text.includes(mediaInfo.title.toLowerCase())) {
                                const yearMatch = text.match(/\b(19|20)\d{2}\b/);
                                const itemYear = yearMatch ? parseInt(yearMatch[0]) : 0;
                                const yearDiff = itemYear ? Math.abs(itemYear - mediaInfo.year) : 5;
                                
                                if (yearDiff <= 2 && yearDiff < bestMatch) {
                                    bestMatch = yearDiff;
                                    bestUrl = href.startsWith('http') ? href : `${KHUB_API}${href}`;
                                }
                            }
                        }
                    });
                    
                    if (!bestUrl) throw new Error('No matching content');
                    
                    // Fetch content page
                    return fetch(bestUrl, { headers: HEADERS })
                        .then(res => {
                            if (!res.ok) throw new Error('Content page error');
                            return res.text();
                        })
                        .then(pageHtml => {
                            if (!pageHtml || pageHtml.length < 100) throw new Error('Empty page');
                            
                            const $page = cheerio.load(pageHtml);
                            const collectedUrls = [];
                            
                            // Extract all download/stream links
                            $page('a').each((i, el) => {
                                try {
                                    const link = $page(el);
                                    const href = link.attr('href');
                                    const linkText = link.text();
                                    const text = linkText.toLowerCase();
                                    
                                    if (href && (
                                        href.includes('hubcloud') || 
                                        href.includes('drive') || 
                                        href.includes('download') ||
                                        text.includes('download') || 
                                        text.includes('watch') || 
                                        text.includes('stream') ||
                                        text.includes('play')
                                    )) {
                                        // For TV shows, filter by season/episode
                                        if (season && episode) {
                                            const seasonStr = `s${season.toString().padStart(2, '0')}`;
                                            const episodeStr = `e${episode.toString().padStart(2, '0')}`;
                                            if (!text.includes(seasonStr) || !text.includes(episodeStr)) {
                                                return;
                                            }
                                        }
                                        
                                        const finalUrl = href.startsWith('http') ? href : `${KHUB_API}${href}`;
                                        collectedUrls.push({
                                            url: finalUrl,
                                            text: linkText
                                        });
                                    }
                                } catch (e) {
                                    // Skip individual link errors
                                }
                            });
                            
                            return collectedUrls;
                        })
                        .then(collectedUrls => {
                            if (!collectedUrls.length) return [];
                            
                            // Format streams for Nuvio
                            return collectedUrls.map(item => {
                                const quality = extractQuality(item.text);
                                let qualityStr = 'Unknown';
                                
                                if (quality >= 2160) qualityStr = '2160p';
                                else if (quality >= 1440) qualityStr = '1440p';
                                else if (quality >= 1080) qualityStr = '1080p';
                                else if (quality >= 720) qualityStr = '720p';
                                else if (quality >= 480) qualityStr = '480p';
                                else if (quality >= 360) qualityStr = '360p';
                                
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
                        });
                })
                .catch(err => {
                    console.error(`[4KHDHub] Error: ${err.message}`);
                    return [];
                });
        })
        .catch(err => {
            console.error(`[4KHDHub] Error: ${err.message}`);
            return [];
        });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
