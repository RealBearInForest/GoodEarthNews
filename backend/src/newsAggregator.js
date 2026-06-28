import Parser from 'rss-parser';
import { analyzeArticle } from './sentimentAnalyzer.js';
import { geocodeArticle } from './geocoder.js';
import {
  insertArticle, hasArticle, deleteDemoArticles, countLibrary, countAll, LIBRARY_TARGET, DAILY_MAX,
} from './db.js';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoodEarthNewsBot/1.0)' },
  customFields: {
    item: [['media:content', 'mediaContent'], ['media:thumbnail', 'mediaThumbnail']],
  },
});

const RSS_FEEDS = [
  // Confirmed working
  { url: 'https://www.positive.news/category/environment/feed/', source: 'Positive News' },
  { url: 'https://www.goodnewsnetwork.org/category/earth/feed/', source: 'Good News Network' },
  { url: 'https://news.mongabay.com/feed/', source: 'Mongabay' },
  { url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', source: 'BBC Science' },
  { url: 'https://www.theguardian.com/environment/rss', source: 'The Guardian' },
  { url: 'https://oceanconservancy.org/feed/', source: 'Ocean Conservancy' },
  { url: 'https://e360.yale.edu/feed.xml', source: 'Yale E360' },
  { url: 'https://www.sciencedaily.com/rss/earth_climate.xml', source: 'Science Daily' },
  { url: 'https://insideclimatenews.org/feed', source: 'Inside Climate News' },
  { url: 'https://www.carbonbrief.org/feed', source: 'Carbon Brief' },
  { url: 'https://grist.org/feed/', source: 'Grist' },
  { url: 'https://www.earthday.org/feed/', source: 'Earth Day' },
  { url: 'https://www.ecowatch.com/rss', source: 'EcoWatch' },
  // Attempt — may work depending on server/CDN rules
  { url: 'https://www.treehugger.com/feeds/all', source: 'Treehugger' },
  { url: 'https://www.earth.com/feed/', source: 'Earth.com' },
  { url: 'https://www.nationalgeographic.com/environment/topic/environment-rss', source: 'National Geographic' },
  { url: 'https://www.worldwildlife.org/stories.rss', source: 'WWF' },
  { url: 'https://www.conservation.org/blog/feed', source: 'Conservation International' },
];

function extractImageUrl(item) {
  if (item.mediaContent?.['$']?.url) return item.mediaContent['$'].url;
  if (item.mediaThumbnail?.['$']?.url) return item.mediaThumbnail['$'].url;
  if (item.enclosure?.url) return item.enclosure.url;
  // Try to find image in content
  const imgMatch = (item.content || item['content:encoded'] || '').match(/src="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
  if (imgMatch) return imgMatch[1];
  return null;
}

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function fetchFeed(feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    return feed.items.map(item => ({
      title: item.title || '',
      description: stripHtml(item.contentSnippet || item.content || item.summary || ''),
      url: item.link || item.guid || '',
      source: feedConfig.source,
      image_url: extractImageUrl(item),
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    console.warn(`Failed to fetch ${feedConfig.source}: ${err.message}`);
    return [];
  }
}

// Builds the curated library toward LIBRARY_TARGET. Each verified article is a
// permanent keeper, so once the library is full this becomes a no-op — the daily
// job just re-features a random handful instead of scraping again.
export async function fetchAndStoreArticles() {
  if (countLibrary() >= LIBRARY_TARGET) {
    console.log(`Library full (${countLibrary()}/${LIBRARY_TARGET}) — skipping scrape.`);
    return { skipped: true, library: countLibrary(), totalFetched: 0, totalStored: 0 };
  }

  console.log(`Fetching news articles (library ${countLibrary()}/${LIBRARY_TARGET})…`);
  const feedResults = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
  const allItems = feedResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const totalFetched = allItems.length;

  let library = countLibrary();
  let analyzed = 0, skipped = 0, totalStored = 0;

  // Process articles with rate limiting (avoid hitting API too fast)
  for (const item of allItems) {
    if (library >= LIBRARY_TARGET) break;        // curated target reached
    if (!item.title || !item.url) continue;

    // Skip articles we've already processed — avoids paying for a Claude call
    // on every story, every run.
    if (hasArticle(item.url)) { skipped++; continue; }

    try {
      // Analyze with Claude AI (also returns the story's location)
      const analysis = await analyzeArticle(item.title, item.description);
      analyzed++;
      if (!analysis) continue;

      // Prefer Claude's coordinates; fall back to keyword geocoding.
      let { latitude, longitude } = analysis;
      if (latitude == null || longitude == null) {
        ({ latitude, longitude } = geocodeArticle(item.title, item.description, item.url));
      } else {
        // Slight jitter so multiple stories at the same place don't overlap exactly.
        latitude += (Math.random() - 0.5) * 1.5;
        longitude += (Math.random() - 0.5) * 1.5;
      }

      const result = insertArticle({
        ...item,
        sentiment_score: analysis.score,
        latitude,
        longitude,
        category: analysis.category,
      });

      if (result.changes > 0) { totalStored++; library++; }

      // Small delay to avoid rate limiting Claude API
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.warn(`Error processing article "${item.title}": ${err.message}`);
    }
  }

  // Once the library can stand on its own, drop the demo seeds.
  let demoRemoved = 0;
  if (countLibrary() >= DAILY_MAX) demoRemoved = deleteDemoArticles();

  console.log(
    `News fetch complete: ${totalFetched} fetched, ${analyzed} analyzed, ` +
    `${skipped} already known, ${totalStored} new stored, library ${countLibrary()}/${LIBRARY_TARGET}` +
    (demoRemoved ? `, ${demoRemoved} demo removed` : '')
  );
  return { totalFetched, analyzed, skipped, totalStored, library: countLibrary() };
}

// Seed mock articles only into a fresh, empty database so the globe has content
// before the real library is built. Tagged is_demo=1 and removed automatically
// once the verified library is large enough to feature on its own.
export async function seedDemoArticles() {
  // Only seed a completely empty database — these are a cold-start fallback that
  // gets replaced as the real library fills in.
  if (countAll() > 0) return;

  console.log('Seeding demo articles...');
  const demoArticles = [
    { title: 'Humpback Whale Population Surges to Record Highs in Pacific Ocean', description: 'Scientists celebrate as humpback whale numbers reach their highest levels in over 50 years, a testament to decades of conservation efforts and international protection agreements.', url: 'https://www.worldwildlife.org/species/humpback-whale', source: 'Ocean News', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.8, latitude: -15, longitude: -150, category: 'ocean' },
    { title: 'Amazon Reforestation Project Plants 10 Million Trees in Record Time', description: 'A landmark reforestation initiative has successfully planted 10 million native trees across degraded Amazon land, restoring critical habitat for thousands of species.', url: 'https://www.mongabay.com/topics/amazon/', source: 'Green Earth', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.9, latitude: -3, longitude: -62, category: 'forest' },
    { title: 'Rare Mountain Gorilla Population Continues to Grow', description: 'Conservation groups announce that mountain gorilla populations have increased by 25% over the past decade, offering hope for the critically endangered species.', url: 'https://www.worldwildlife.org/species/mountain-gorilla', source: 'Wildlife Watch', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.7, latitude: -1.5, longitude: 29.5, category: 'animals' },
    { title: 'Great Barrier Reef Shows Signs of Recovery After Coral Restoration', description: 'Marine scientists report remarkable coral regrowth across sections of the Great Barrier Reef following innovative restoration techniques using laboratory-grown coral fragments.', url: 'https://www.barrierreef.org/news', source: 'Marine Science', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.6, latitude: -18, longitude: 147, category: 'ocean' },
    { title: 'Scotland Welcomes First Wild Beaver Kits in 400 Years', description: 'Rewilding success story unfolds as beaver families expand across Scottish river systems for the first time since the 17th century, transforming wetland ecosystems.', url: 'https://www.scotlandsbigpicture.com/beavers', source: 'BBC Nature', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.8, latitude: 56.5, longitude: -4.2, category: 'animals' },
    { title: 'Solar Energy Now Powers 30% of Global Electricity', description: 'A landmark moment for clean energy as solar installations worldwide now generate enough electricity to power billions of homes, driving down carbon emissions globally.', url: 'https://www.iea.org/energy-system/renewables/solar-pv', source: 'Energy Future', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.5, latitude: 35, longitude: 105, category: 'climate' },
    { title: 'New Marine Reserve Protects Pristine Ocean Ecosystem in Pacific', description: 'A vast new marine protected area spanning thousands of square kilometers has been established in the central Pacific, safeguarding one of the last untouched ocean ecosystems.', url: 'https://oceanconservancy.org/protecting-the-ocean/', source: 'Conservation Weekly', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.7, latitude: 5, longitude: -160, category: 'ocean' },
    { title: 'India\'s Tiger Population Doubles in Two Decades of Conservation', description: 'India celebrates a conservation triumph as wild tiger numbers have doubled since 2006, with new survey data confirming over 3,000 tigers roaming national parks and reserves.', url: 'https://www.worldwildlife.org/species/tiger', source: 'Wildlife News', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.9, latitude: 20, longitude: 78, category: 'animals' },
    { title: 'New Species of Deep Sea Fish Discovered Near Mariana Trench', description: 'Marine biologists announce the discovery of a remarkable new species of snailfish living at extreme depths in the Pacific Ocean, shedding light on life in Earth\'s deepest environments.', url: 'https://www.mbari.org/research/deep-sea/', source: 'Deep Sea Research', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.5, latitude: 11, longitude: 142, category: 'discovery' },
    { title: 'Kenya\'s Elephant Population Increases 30% Thanks to Anti-Poaching Efforts', description: 'Coordinated conservation efforts and community-led anti-poaching initiatives have led to a dramatic increase in Kenya\'s elephant population over the past decade.', url: 'https://www.savetheelephants.org', source: 'African Conservation', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.8, latitude: 0, longitude: 38, category: 'animals' },
    { title: 'European Forests Expanding for First Time in Centuries', description: 'New satellite data reveals that European forest cover has been steadily growing for several decades, with millions of hectares of new woodland providing critical carbon storage.', url: 'https://www.eea.europa.eu/themes/forests', source: 'European Green', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.6, latitude: 48, longitude: 10, category: 'forest' },
    { title: 'California Condor Soars Back from Brink of Extinction', description: 'Decades of dedicated conservation work have resulted in the California condor population growing from just 27 birds to over 500, with wild populations thriving across the American Southwest.', url: 'https://www.peregrinefund.org/projects/california-condor', source: 'US Wildlife', image_url: null, published_at: new Date().toISOString(), sentiment_score: 5.0, latitude: 36, longitude: -117, category: 'animals' },
    { title: 'New Zealand Declares Major Victory Over Invasive Species', description: 'Island-wide pest eradication programs have dramatically reduced invasive predator populations across New Zealand, allowing native birds to flourish in predator-free zones.', url: 'https://www.doc.govt.nz/nature/pests-and-threats/', source: 'Pacific Wildlife', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.7, latitude: -41, longitude: 174, category: 'conservation' },
    { title: 'Ocean Plastic Cleanup Removes Over 100,000 Tonnes from Pacific', description: 'Innovative ocean cleanup technologies have achieved a milestone breakthrough, removing over 100,000 tonnes of plastic debris from the Great Pacific Garbage Patch.', url: 'https://theoceancleanup.com/updates/', source: 'Ocean Clean', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.5, latitude: 38, longitude: -145, category: 'ocean' },
    { title: 'Bald Eagle Population Reaches Historic High Across North America', description: 'The symbol of American wildlife has made a stunning comeback, with bald eagle populations now exceeding 300,000 birds — a recovery that demonstrates the power of environmental protection laws.', url: 'https://www.eagles.org/what-we-do/educate/bald-eagle-info/', source: 'American Wildlife', image_url: null, published_at: new Date().toISOString(), sentiment_score: 4.8, latitude: 47, longitude: -100, category: 'animals' },
  ];

  for (const article of demoArticles) {
    insertArticle({ ...article, is_demo: 1 });
  }
  console.log(`Seeded ${demoArticles.length} demo articles`);
}
