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
    if (!text) return 'HD';
    const text_lower = text.toLowerCase();
    
    if (text_lower.includes('2160p') || text_lower.includes('4k')) return '2160p';
    if (text_lower.includes('1440p')) return '1440p';
    if (text_lower.includes('1080p')) return '1080p';
    if (text_lower.includes('720p')) return '720p';
    if (text_lower.includes('480p')) return '480p';
    if (text_lower.includes('360p')) return '360p';
    
    return 'HD';
}

/**
 * Extract size from text
 */
function extractSize(text) {
    if (!text) return 'Unknown';
    const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
    return match ? match[0] : 'Unknown';
}

/**
 * Main getStreams function - Promise-based (NO async/await)
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    const isSeries = mediaType === 'tv';
    const endpoint = isSeries ? 'tv' : 'movie';
    
    return fetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`, { headers: HEADERS })
        .then(res => {
            if (!res.ok) throw new Error('TMDB API error');
            return res.json();
        })
        .then(tmdbData => {
            if (!tmdbData) throw new Error('No TMDB data');
            
            const title = isSeries ? tmdbData.name : tmdbData.title;
            const year = isSeries 
                ? (tmdbData.first_air_date ? parseInt(tmdbData.first_air_date.split('-')[0]) : 0)
                : (tmdbData.release_date ? parseInt(tmdbData.release_date.split('-')[0]) : 0);
            
            if (!title) throw new Error('No title found');
            
            // Search on 4khdhub
            const searchUrl = `${KHUB_API}/?s=${encodeURIComponent(title)}`;
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
                            if (text.includes(title.toLowerCase())) {
                                const yearMatch = text.match(/\b(19|20)\d{2}\b/);
                                const itemYear = yearMatch ? parseInt(yearMatch[0]) : 0;
                                const yearDiff = itemYear ? Math.abs(itemYear - year) : 5;
                                
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
                            const streams = [];
                            
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
                                        if (isSeries && seasonNum && episodeNum) {
                                            const seasonStr = `s${seasonNum.toString().padStart(2, '0')}`;
                                            const episodeStr = `e${episodeNum.toString().padStart(2, '0')}`;
                                            if (!text.includes(seasonStr) || !text.includes(episodeStr)) {
                                                return;
                                            }
                                        }
                                        
                                        const quality = extractQuality(text);
                                        const size = extractSize(linkText);
                                        const finalUrl = href.startsWith('http') ? href : `${KHUB_API}${href}`;
                                        
                                        streams.push({
                                            name: `4KHDHub - ${quality}`,
                                            title: `${title} (${year})${size !== 'Unknown' ? ' | ' + size : ''}`,
                                            url: finalUrl,
                                            quality: quality,
                                            size: size,
                                            provider: '4khubdad',
                                            headers: {
                                                'User-Agent': HEADERS['User-Agent'],
                                                'Referer': bestUrl
                                            }
                                        });
                                    }
                                } catch (e) {
                                    // Skip individual link errors
                                }
                            });
                            
                            return streams.length > 0 ? streams : [];
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
    global.getStreams = getStreams;
}
