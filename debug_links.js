const cheerio = require('cheerio-without-node-native');

if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
};

fetch("https://4khdhub.dad/breaking-bad-series-1385/", { headers: HEADERS })
    .then(res => res.text())
    .then(html => {
        const $ = cheerio.load(html);
        const links = $('a');
        
        console.log(`Total links: ${links.length}\n`);
        
        let count = 0;
        links.each((i, el) => {
            const $link = $(el);
            const href = $link.attr('href');
            const text = $link.text().trim();
            
            if (href && href.includes('gadgetsweb')) {
                count++;
                console.log(`[${count}] ${text.substring(0, 50)}`);
                console.log(`    href: ${href.substring(0, 80)}...`);
                
                // Check what we're looking for
                const text_lower = text.toLowerCase();
                console.log(`    includes "download": ${text_lower.includes('download')}`);
                console.log(`    includes "hubcloud": ${text_lower.includes('hubcloud')}`);
                console.log(`    includes "hubdrive": ${text_lower.includes('hubdrive')}`);
                console.log();
                
                if (count >= 5) return false; // break
            }
        });
        
        console.log(`\nTotal gadgetsweb links: ${count}`);
    })
    .catch(err => console.error('Error:', err.message));
