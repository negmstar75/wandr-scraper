// scrapers/lonelyPlanetScraper.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// 🔑 Initialize clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Destination list
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 📚 External article sources for planning tools
const planningArticles = {
  London: [
    {
      title: 'Best Things to Do',
      url: 'https://www.lonelyplanet.com/articles/top-things-to-do-in-london',
    },
    {
      title: 'Things to Know',
      url: 'https://www.lonelyplanet.com/articles/things-to-know-before-traveling-to-london',
    },
    {
      title: 'Best Neighborhoods',
      url: 'https://www.lonelyplanet.com/articles/best-neighborhoods-in-london',
    },
    {
      title: 'London on a Budget',
      url: 'https://www.lonelyplanet.com/articles/london-on-a-budget',
    },
    {
      title: 'London with Kids',
      url: 'https://www.lonelyplanet.com/articles/london-with-kids',
    },
  ],
};

// 🔗 Affiliate link builder
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program`;
}

// 📄 Scrape markdown from a Lonely Planet article
async function extractArticleMarkdown({ title, url }) {
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const content = $('article p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n\n');
    return `\n\n### ${title}\n\n${content}`;
  } catch (err) {
    console.warn(`⚠️ Failed to load article: ${title} - ${url}`);
    return '';
  }
}

// 🤖 Generate destination overview
async function generateOverview(city, country, intro, attractions) {
  const prompt = `You are a travel writer. Write a vivid and informative 3–5 paragraph summary about visiting ${city}, ${country}. Include cultural insights, tips, and mention these key attractions: ${attractions.join(', ')}`;
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: intro },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 📅 3-Day Itinerary
async function generateItinerary(city) {
  const prompt = `Generate a sample 3-day itinerary for visiting ${city}. Use markdown headers like "Day 1", "Day 2", etc., and write in a travel guide tone.`;
  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'system', content: prompt }],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 🚀 Scrape 1 Destination
async function scrapeDestination({ city, country, continent }) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;

  console.log(`🌍 Scraping: ${city}, ${country}`);
  console.log(`🔗 URL: ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const introText = $('meta[name="description"]').attr('content') || '';

    const attractions = [];
    $('h2:contains("Must-see attractions")')
      .next()
      .find('a')
      .each((_, el) => {
        const text = $(el).text().trim();
        if (text && !attractions.includes(text)) attractions.push(text);
      });

    let planning_tools_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        planning_tools_md += await extractArticleMarkdown(article);
      }
    }

    const overview_md = await generateOverview(city, country, introText, attractions);
    const itinerary_md = await generateItinerary(city);

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
      link: generateLink(country, city),
      overview_md,
      itinerary_md,
      planning_tools_md: planning_tools_md.trim(),
      popular_attractions: attractions.length ? attractions : [],
      interests: ['culture', 'exploration'],
      popularity: Math.floor(Math.random() * 100),
      source: 'lp',
      summary: introText,
      description: overview_md,
    };

    console.log('🚀 Final Insert Object:', JSON.stringify(destinationPayload, null, 2));

    const { error } = await supabase
      .from('destinations')
      .upsert([destinationPayload], { onConflict: 'slug' });

    if (error) {
      console.error(`❌ Supabase insert failed for ${city}: ${error.message}`);
    } else {
      console.log(`✅ Saved: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Main Runner
export async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const destination of destinationList) {
    await scrapeDestination(destination);
  }
  console.log('🎉 LP scraping completed');
}
