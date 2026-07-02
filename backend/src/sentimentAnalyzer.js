import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fast keyword pre-filter to avoid API calls for clearly irrelevant articles
const ENV_KEYWORDS = [
  'environment', 'wildlife', 'animal', 'ocean', 'marine', 'forest', 'nature',
  'conservation', 'ecosystem', 'habitat', 'biodiversity', 'climate', 'species',
  'whale', 'dolphin', 'shark', 'turtle', 'bird', 'fish', 'coral', 'reef',
  'elephant', 'tiger', 'lion', 'gorilla', 'orangutan', 'panda', 'penguin',
  'butterfly', 'bee', 'pollinator', 'wetland', 'river', 'glacier', 'rainforest',
  'renewable', 'solar', 'clean energy', 'sustainability', 'rewilding',
  'restoration', 'sanctuary', 'reserve', 'national park', 'earth', 'planet',
  'amphibian', 'reptile', 'mammal', 'insect', 'plant', 'seagrass', 'mangrove',
  'kelp', 'soil', 'carbon', 'emission', 'pollution', 'green', 'ecology',
  'reforestation', 'afforestation', 'tree', 'renewables',
];

// Whole-word matching — plain substring matching once let 'bee' match "been",
// which waved a tragedy past this gate.
const ENV_REGEX = new RegExp(
  `\\b(?:${ENV_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})s?\\b`,
  'i',
);

export function isEnvironmentallyRelevant(title = '', description = '') {
  return ENV_REGEX.test(`${title} ${description}`);
}

// Claude occasionally wraps JSON in ```json fences or adds a sentence around it.
// Extract the first balanced-looking object and parse that.
function parseJsonLoose(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function clampCoord(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

// Analyze one article with Claude. Returns a verdict object:
//   { verdict: 'approved', score, category, latitude, longitude, location }
//   { verdict: 'rejected' }   — Claude judged it not environmental / not uplifting
//   { verdict: 'error' }      — could not get a trustworthy judgement
//
// FAIL CLOSED: an 'error' must never be treated as approval. There is no
// keyword fallback — Claude's judgement is the entire quality gate, and a
// failure path that guesses is how a drowning story ends up on a
// feel-good site ("recovered" + "record" once scored as positive words).
//
// `prefilter: false` skips the keyword gate and always asks Claude — used by
// the library audit, where articles already earned a full check and a keyword
// miss must not count as a rejection.
export async function analyzeArticle(title = '', description = '', { prefilter = true } = {}) {
  // Quick pre-filter to save API calls — a miss here is a rejection, not an error.
  if (prefilter && !isEnvironmentallyRelevant(title, description)) {
    return { verdict: 'rejected' };
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Analyze this news article and respond with ONLY valid JSON (no markdown, no prose):

Title: ${title}
Description: ${description || '(no description)'}

Respond with this exact JSON structure:
{
  "isEnvironmental": true/false (is it about environment/nature/animals/oceans/earth/wildlife/conservation?),
  "isGoodNews": true/false (is the overall tone positive/hopeful AND the underlying event itself a good thing? conservation successes, new species discoveries, recoveries of ecosystems or wildlife, clean energy wins count as good news. disasters, extinctions, pollution crises, and any story involving human death, injury, drowning, accident or crime are NOT good news — regardless of wording),
  "sentimentScore": 0-5 (0=very negative, 2.5=neutral, 5=extremely positive/uplifting),
  "category": "animals"|"ocean"|"forest"|"climate"|"conservation"|"discovery"|"environment",
  "location": "the most specific place the story is about (country, region, city, or body of water), or null if it is global/unspecified",
  "latitude": number between -90 and 90 for that location, or null if unknown,
  "longitude": number between -180 and 180 for that location, or null if unknown
}`
      }]
    });

    const text = response.content[0].text.trim();
    const result = parseJsonLoose(text);

    if (!result.isEnvironmental || !result.isGoodNews) return { verdict: 'rejected' };
    if (result.sentimentScore < 2.0) return { verdict: 'rejected' };

    return {
      verdict: 'approved',
      score: result.sentimentScore,
      category: result.category || 'environment',
      // Coordinates are optional — newsAggregator falls back to keyword geocoding.
      latitude: clampCoord(result.latitude, 90),
      longitude: clampCoord(result.longitude, 180),
      location: typeof result.location === 'string' ? result.location : null,
    };
  } catch (err) {
    // Loud and fail-closed: the caller must treat this as "unverified", never
    // as approval (for ingestion: skip) and never as rejection (for audits:
    // keep — don't delete what we couldn't check).
    console.error(`Claude analysis failed for "${title.slice(0, 60)}": ${err.status || ''} ${err.message}`);
    return { verdict: 'error' };
  }
}
