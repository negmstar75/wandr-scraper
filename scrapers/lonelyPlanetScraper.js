// scrapers/lonelyPlanetScraper.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Destinations to scrape
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// LP articles per city
const planningArticles = {
  London: [
    { title: 'Best Things to Do', url: 'https://www.lonelyplanet.com/articles/top-things-to-do-in-london' },
    { title: 'Things to Know', url: 'https://www.lonelyplanet.com/articles/things-to-know-before-traveling-to-london' },
    { title: 'Best Neighborhoods', url: 'https://www.lonelyplanet.com/articles/best-neighborhoods-in-london' },
    { title: 'London on a Budget', url: 'https://www.lonelyplanet.com/articles/london-on-a-budget' },
    { title: 'London with Kids', url: 'https://www.lonelyplanet.com/articles/london-with-kids' },
  ],
};

// Helpers
function generateSlug(country, city) {
  return `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
}

function generateLink(country, city) {
  const slug = generateSlug(country, city);
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D`;
}

async function extractArticleMarkdown({ title, url }) {
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const content = $('article p, article li')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n\n');

    console.log(`🧾 Loaded article "${title}" (${content.length} chars)`);

    return `\n\n### ${title}\n\n${content}`;
  } catch (err) {
    console.warn(`⚠️ Could not extract article "${title}" — ${url}`);
    return '';
  }
}

async function scrapeAttractions(country, city) {
  const url = `https://www.lonelyplanet.com/${generateSlug(country, city)}/attractions`;
  const attractions = [];

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    $('.Card h3, a[data-testid*="attraction-card"] h3').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !attractions.includes(name)) attractions.push(name);
    });

    console.log(`📍 Found ${attractions.length} attractions for ${city}`);
  } catch {
    console.warn(`⚠️ Could not fetch attractions for ${city}`);
  }

  return attractions;
}

async function generateOverview(city, country, intro, attractions) {
  try {
    const prompt = `You are a travel writer. Write a rich, detailed 3–5 paragraph guide for ${city}, ${country}. Mention these key attractions: ${attractions.join(', ')}`;
    const res = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: intro },
      ],
    });
    return res.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return 'Overview unavailable due to API limits.';
  }
}

async function generateItinerary(city) {
  try {
    const prompt = `Write a 3-day sample travel itinerary for ${city}, with markdown headers: Day 1, Day 2, etc. Use travel guide tone.`;
    const res = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return 'Itinerary unavailable due to API limits.';
  }
}

async function scrapeDestination({ city, country, continent }) {
  const slug = generateSlug(country, city);
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;
  console.log(`🌍 Scraping ${city} (${url})`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const intro = $('meta[name="description"]').attr('content') || '';

    const attractions = await scrapeAttractions(country, city);

    let planning_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        planning_md += await extractArticleMarkdown(article);
      }
    }

    const overview_md = await generateOverview(city, country, intro, attractions);
    const itinerary_md = await generateItinerary(city);

    const payload = {
      slug,
      title: city,
      name: city,
      city,
      country,
      region: country,
      continent,
      image: `https://source.unsplash.com/featured/?${city},${country}`,
      images: [`https://source.unsplash.com/featured/?${city},${country}`],
      link: generateLink(country, city),
      overview_md,
      itinerary_md,
      planning_tools_md: planning_md.trim(),
      popular_attractions: attractions,
      interests: ['culture', 'exploration'],
      popularity: Math.floor(Math.random() * 100),
      source: 'lp',
      summary: intro,
      description: overview_md,
    };

    console.log('📦 Final Payload:', JSON.stringify(payload, null, 2));

    const { error } = await supabase.from('destinations').upsert([payload], {
      onConflict: 'slug',
    });

    if (error) {
      console.error(`❌ Supabase insert failed:`, error.message);
    } else {
      console.log(`✅ Inserted ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Runner
export async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const dest of destinationList) {
    await scrapeDestination(dest);
  }
  console.log('🎉 Scraping complete!');
}
