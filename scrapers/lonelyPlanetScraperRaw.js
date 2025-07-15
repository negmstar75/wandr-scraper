import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Init Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Target cities
const destinations = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// Planning tool articles
const planningArticles = {
  London: [
    { title: 'Best Things to Do', url: 'https://www.lonelyplanet.com/articles/top-things-to-do-in-london' },
    { title: 'Things to Know', url: 'https://www.lonelyplanet.com/articles/things-to-know-before-traveling-to-london' },
    { title: 'Best Neighborhoods', url: 'https://www.lonelyplanet.com/articles/best-neighborhoods-in-london' },
    { title: 'London on a Budget', url: 'https://www.lonelyplanet.com/articles/london-on-a-budget' },
    { title: 'London with Kids', url: 'https://www.lonelyplanet.com/articles/london-with-kids' },
  ],
};

// Article scraper
async function extractMarkdown({ title, url }) {
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const content = $('article p')
      .map((_, el) => $(el).text().trim())
      .get()
      .join('\n\n');

    console.log(`🧾 Loaded article "${title}" (${content.length} chars)`);
    return `\n\n### ${title}\n\n${content}`;
  } catch (err) {
    console.warn(`⚠️ Failed to load ${title}: ${url}`);
    return '';
  }
}

// Attractions fallback (external page)
async function getAttractions(city) {
  const url = `https://www.lonelyplanet.com/${slugify(city, { lower: true })}/attractions`;
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const names = [];

    $('a.card').each((_, el) => {
      const name = $(el).find('h3').text().trim();
      if (name) names.push(name);
    });

    console.log(`📍 Found ${names.length} attractions for ${city}`);
    return names;
  } catch (err) {
    console.warn(`⚠️ Attractions page failed for ${city}`);
    return [];
  }
}

async function scrapeOne(dest) {
  const { city, country, continent } = dest;
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;

  console.log(`🌍 Scraping ${city} (${url})`);

  const planningList = planningArticles[city] || [];
  let planning_tools_md = '';
  for (const article of planningList) {
    planning_tools_md += await extractMarkdown(article);
  }

  const attractions = await getAttractions(city);

  const summary = 'Summary not included in raw scraper.';
  const destinationPayload = {
    slug,
    title: city,
    name: city,
    city,
    country,
    region: country,
    continent,
    image: `https://source.unsplash.com/featured/?${city},${country}`,
    images: [`https://source.unsplash.com/featured/?${city},${country}`],
    link: `https://www.lonelyplanet.com/destinations/${slug}`,
    overview_md: '',
    itinerary_md: '',
    planning_tools_md,
    popular_attractions: attractions,
    interests: ['culture', 'exploration'],
    popularity: Math.floor(Math.random() * 100),
    source: 'lp',
    summary,
    description: '',
  };

  console.log('📦 Final Payload:', JSON.stringify(destinationPayload, null, 2));

  const { error } = await supabase.from('destinations').upsert([destinationPayload], {
    onConflict: 'slug',
  });

  if (error) {
    console.error(`❌ Insert failed for ${city}:`, error.message);
  } else {
    console.log(`✅ Inserted ${city}`);
  }
}

(async () => {
  console.log('🟢 Starting fallback raw scraper...');
  for (const dest of destinations) {
    await scrapeOne(dest);
  }
  console.log('✅ Done.');
})();
