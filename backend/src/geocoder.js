// Maps location keywords to [latitude, longitude]
const LOCATIONS = {
  // Countries
  'afghanistan': [33.93, 67.71], 'albania': [41.15, 20.17], 'algeria': [28.03, 1.66],
  'argentina': [-38.42, -63.62], 'australia': [-25.27, 133.78], 'austria': [47.52, 14.55],
  'bangladesh': [23.68, 90.36], 'belgium': [50.50, 4.47], 'bolivia': [-16.29, -63.59],
  'brazil': [-14.24, -51.93], 'cambodia': [12.57, 104.99], 'cameroon': [7.37, 12.35],
  'canada': [56.13, -106.35], 'chile': [-35.68, -71.54], 'china': [35.86, 104.20],
  'colombia': [4.57, -74.30], 'congo': [-0.23, 15.83], 'costa rica': [9.75, -83.75],
  'cuba': [21.52, -77.78], 'denmark': [56.26, 9.50], 'ecuador': [-1.83, -78.18],
  'egypt': [26.82, 30.80], 'ethiopia': [9.15, 40.49], 'finland': [61.92, 25.75],
  'france': [46.23, 2.21], 'gabon': [-0.80, 11.61], 'ghana': [7.95, -1.02],
  'germany': [51.17, 10.45], 'greece': [39.07, 21.82], 'guatemala': [15.78, -90.23],
  'honduras': [15.20, -86.24], 'india': [20.59, 78.96], 'indonesia': [-0.79, 113.92],
  'iran': [32.43, 53.69], 'iraq': [33.22, 43.68], 'ireland': [53.41, -8.24],
  'israel': [31.05, 34.85], 'italy': [41.87, 12.57], 'japan': [36.20, 138.25],
  'jordan': [30.59, 36.24], 'kenya': [-0.02, 37.91], 'laos': [19.86, 102.50],
  'madagascar': [-18.77, 46.87], 'malaysia': [4.21, 108.96], 'mali': [17.57, -3.99],
  'mexico': [23.63, -102.55], 'mongolia': [46.86, 103.85], 'morocco': [31.79, -7.09],
  'mozambique': [-18.67, 35.53], 'myanmar': [21.91, 95.96], 'namibia': [-22.96, 18.49],
  'nepal': [28.39, 84.12], 'netherlands': [52.13, 5.29], 'new zealand': [-40.90, 174.89],
  'nigeria': [9.08, 8.68], 'norway': [60.47, 8.47], 'pakistan': [30.38, 69.35],
  'panama': [8.54, -80.78], 'paraguay': [-23.44, -58.44], 'peru': [-9.19, -75.02],
  'philippines': [12.88, 121.77], 'poland': [51.92, 19.15], 'portugal': [39.40, -8.22],
  'russia': [61.52, 105.32], 'rwanda': [-1.94, 29.87], 'senegal': [14.50, -14.45],
  'south africa': [-30.56, 22.94], 'south korea': [35.91, 127.77], 'spain': [40.46, -3.75],
  'sri lanka': [7.87, 80.77], 'sudan': [12.86, 30.22], 'sweden': [60.13, 18.64],
  'switzerland': [46.82, 8.23], 'taiwan': [23.70, 120.96], 'tanzania': [-6.37, 34.89],
  'thailand': [15.87, 100.99], 'turkey': [38.96, 35.24], 'uganda': [1.37, 32.29],
  'ukraine': [48.38, 31.17], 'united kingdom': [55.38, -3.44], 'uk': [55.38, -3.44],
  'united states': [37.09, -95.71], 'usa': [37.09, -95.71], 'us': [37.09, -95.71],
  'uruguay': [-32.52, -55.77], 'venezuela': [6.42, -66.59], 'vietnam': [14.06, 108.28],
  'zambia': [-13.13, 27.85], 'zimbabwe': [-19.02, 29.15],

  // Regions & biomes
  'amazon': [-3.47, -62.21], 'amazon rainforest': [-3.47, -62.21],
  'arctic': [85.0, 0.0], 'antarctica': [-82.0, 0.0], 'antarctic': [-75.0, 0.0],
  'sahara': [23.42, 12.39], 'serengeti': [-2.33, 34.83],
  'himalaya': [27.99, 86.93], 'himalayas': [27.99, 86.93],
  'patagonia': [-50.0, -72.0], 'borneo': [1.0, 114.0],
  'siberia': [60.0, 100.0], 'sahel': [15.0, 15.0],
  'appalachian': [37.5, -82.0], 'yellowstone': [44.43, -110.59],
  'galápagos': [-0.95, -90.96], 'galapagos': [-0.95, -90.96],
  'congo basin': [-2.0, 24.0], 'pantanal': [-17.0, -57.0],

  // Oceans & seas
  'pacific ocean': [0.0, -160.0], 'pacific': [0.0, -160.0],
  'atlantic ocean': [0.0, -30.0], 'atlantic': [0.0, -30.0],
  'indian ocean': [-20.0, 80.0], 'arctic ocean': [85.0, 0.0],
  'southern ocean': [-65.0, 0.0], 'mediterranean': [35.0, 18.0],
  'north sea': [56.0, 3.0], 'great barrier reef': [-18.29, 147.70],
  'caribbean': [15.0, -75.0], 'coral sea': [-15.0, 152.0],
  'bering sea': [57.0, -175.0], 'red sea': [20.0, 38.0],
  'gulf of mexico': [25.0, -90.0], 'chesapeake bay': [37.5, -76.1],

  // US States (common in environmental news)
  'california': [36.78, -119.42], 'florida': [27.99, -81.76],
  'alaska': [64.20, -153.37], 'hawaii': [19.90, -155.58],
  'colorado': [39.55, -105.78], 'oregon': [44.50, -122.07],
  'washington state': [47.75, -120.74], 'montana': [46.88, -110.36],
  'yellowstone': [44.43, -110.59], 'appalachia': [37.5, -82.0],

  // Cities with notable environmental stories
  'amazon river': [-3.47, -60.0], 'nile': [26.82, 30.80],
  'mekong': [15.0, 105.0], 'ganges': [25.0, 85.0], 'yangtze': [30.0, 112.0],
  'great lakes': [45.0, -84.0], 'lake victoria': [-1.0, 33.0],
  'dead sea': [31.5, 35.5], 'caspian sea': [42.0, 51.0],
};

// Source-based defaults when no location is found in the content
const SOURCE_LOCATIONS = {
  'bbc': [51.5, -0.1],
  'guardian': [51.5, -0.1],
  'reuters': [40.7, -74.0],
  'nasa': [38.9, -77.0],
  'mongabay': [37.8, -122.4],
  'positive.news': [51.5, -0.1],
  'earth.com': [37.8, -122.4],
  'treehugger': [40.7, -74.0],
  'ecowatch': [40.7, -74.0],
  'goodnewsnetwork': [37.5, -79.0],
  'worldwildlife': [38.9, -77.0],
  'conservation': [40.7, -74.0],
  'nationalgeographic': [38.9, -77.0],
};

export function geocodeArticle(title = '', description = '', sourceUrl = '') {
  const text = `${title} ${description}`.toLowerCase();

  // Try to find a location match in the text
  // Sort by length descending so longer phrases match first (e.g. "great barrier reef" before "reef")
  const sortedKeys = Object.keys(LOCATIONS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (text.includes(key)) {
      const [lat, lng] = LOCATIONS[key];
      // Add slight jitter to prevent exact overlap
      return {
        latitude: lat + (Math.random() - 0.5) * 2,
        longitude: lng + (Math.random() - 0.5) * 2,
      };
    }
  }

  // Fall back to source-based location
  const sourceLower = sourceUrl.toLowerCase();
  for (const [key, coords] of Object.entries(SOURCE_LOCATIONS)) {
    if (sourceLower.includes(key)) {
      const [lat, lng] = coords;
      return {
        latitude: lat + (Math.random() - 0.5) * 8,
        longitude: lng + (Math.random() - 0.5) * 8,
      };
    }
  }

  // Random world location (weighted towards land / story hotspots)
  const fallbacks = [
    [20, 0], [-10, 30], [5, 20], [50, 10], [-25, 130],
    [45, -100], [-15, -60], [60, 30], [25, 80], [-5, 120],
  ];
  const [lat, lng] = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  return {
    latitude: lat + (Math.random() - 0.5) * 10,
    longitude: lng + (Math.random() - 0.5) * 10,
  };
}
