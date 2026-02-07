const cheerio = require('cheerio-without-node-native');

if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

const KHUB_API = "https://4khdhub.dad";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Referer": `${KHUB_API}/`,
};

function debugSearch(title) {
    console.log(`\n=== Searching for: ${title} ===\n`);
    
    const searchUrl = `${KHUB_API}/?s=${encodeURIComponent(title)}`;
    console.log(`URL: ${searchUrl}\n`);
    
    return fetch(searchUrl, { headers: HEADERS })
        .then(res => res.text())
        .then(html => {
            console.log(`HTML length: ${html.length}`);
            
            const $ = cheerio.load(html);
            
            // Find all movie cards
            const cards = $('a.movie-card');
            console.log(`Found ${cards.length} movie cards\n`);
            
            cards.each((i, el) => {
                const $card = $(el);
                const href = $card.attr('href');
                const title = $card.find('.movie-card-title').text();
                const meta = $card.find('.movie-card-meta').text();
                
                console.log(`[${i}] ${title}`);
                console.log(`    URL: ${href}`);
                console.log(`    Meta: ${meta}`);
                console.log();
            });
            
            // Try to find the best match
            let bestUrl = null;
            let bestTitle = null;
            
            cards.each((i, el) => {
                const $card = $(el);
                const href = $card.attr('href');
                const cardTitle = $card.find('.movie-card-title').text().toLowerCase();
                
                if (cardTitle.includes(title.toLowerCase())) {
                    bestUrl = href.startsWith('http') ? href : `${KHUB_API}${href}`;
                    bestTitle = cardTitle;
                    console.log(`✓ Best match: ${cardTitle}`);
                    console.log(`  URL: ${bestUrl}\n`);
                    return false; // break
                }
            });
            
            if (!bestUrl) {
                console.log('✗ No matching content found\n');
                return;
            }
            
            // Fetch the content page
            console.log(`Fetching content page: ${bestUrl}\n`);
            return fetch(bestUrl, { headers: HEADERS })
                .then(res => res.text())
                .then(pageHtml => {
                    console.log(`Content page HTML length: ${pageHtml.length}\n`);
                    
                    const $page = cheerio.load(pageHtml);
                    
                    // Find all download links
                    const links = $page('a');
                    console.log(`Found ${links.length} total links\n`);
                    
                    let downloadCount = 0;
                    links.each((i, el) => {
                        const $link = $page(el);
                        const href = $link.attr('href');
                        const text = $link.text();
                        
                        if (href && (
                            href.includes('hubcloud') || 
                            href.includes('drive') || 
                            href.includes('download') ||
                            text.toLowerCase().includes('download') || 
                            text.toLowerCase().includes('watch') || 
                            text.toLowerCase().includes('stream')
                        )) {
                            downloadCount++;
                            console.log(`[${downloadCount}] ${text.substring(0, 50)}`);
                            console.log(`    ${href.substring(0, 100)}`);
                        }
                    });
                    
                    console.log(`\n✓ Found ${downloadCount} download/stream links`);
                });
        })
        .catch(err => console.error('Error:', err.message));
}

// Test with Breaking Bad
debugSearch('Breaking Bad')
    .then(() => {
        console.log('\n\n');
        // Test with The Matrix
        return debugSearch('The Matrix');
    })
    .catch(err => console.error('Error:', err));
