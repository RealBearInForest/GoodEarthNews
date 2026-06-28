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
];

function isEnvironmentallyRelevant(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  return ENV_KEYWORDS.some(kw => text.includes(kw));
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

export async function analyzeArticle(title = '', description = '') {
  // Quick pre-filter to save API calls
  if (!isEnvironmentallyRelevant(title, description)) {
    return null;
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
  "isGoodNews": true/false (is the overall tone positive/hopeful? conservation successes, new species discoveries, recoveries, clean energy wins, wildlife returns count as good news. disasters, extinctions, pollution crises count as bad news),
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

    if (!result.isEnvironmental || !result.isGoodNews) return null;
    if (result.sentimentScore < 2.0) return null;

    return {
      score: result.sentimentScore,
      category: result.category || 'environment',
      isGoodNews: true,
      // Coordinates are optional — newsAggregator falls back to keyword geocoding.
      latitude: clampCoord(result.latitude, 90),
      longitude: clampCoord(result.longitude, 180),
      location: typeof result.location === 'string' ? result.location : null,
    };
  } catch (err) {
    // Fallback to keyword-based scoring if API/parse fails
    const text = `${title} ${description}`.toLowerCase();
    const positiveWords = ['recovered', 'restored', 'thriving', 'milestone', 'success',
      'discovered', 'saved', 'rescued', 'protected', 'growing', 'record', 'breakthrough'];
    const score = positiveWords.filter(w => text.includes(w)).length;
    if (score < 2) return null;
    return {
      score: Math.min(5, 2.5 + score * 0.3),
      category: 'environment',
      isGoodNews: true,
      latitude: null,
      longitude: null,
      location: null,
    };
  }
}
