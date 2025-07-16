// scrapers/lonelyPlanetScraperRaw.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// 🔑 Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Destination list
const destinations = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 📘 External article URLs for planning tools
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
    {
      title: 'Getting Around England',
      url: 'https://www.lonelyplanet.com/articles/getting-around-england',
    },
  ],
};

// 🔗 LP destination link
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}`;
}

// 📄 Extract article content with Puppeteer
async function extractArticleMarkdown({ title, url }) {
  console.log(`🧭 Launching headless browser for: ${title}`);

  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('article', { timeout: 10000 });

    const content = await page.evaluate(() => {
      const article = document.querySelector('article');
      if (!article) return '';
      return Array.from(article.querySelectorAll('h2, h3, p'))
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .join('\n\n');
    });

    await browser.close();
    console.log(`🧾 Loaded article "${title}" (${content.length} chars)`);
    return `\n\n### ${title}\n\n${content}`;
  } catch (err) {
    await browser.close();
    console.warn(`⚠️ Article "${title}" is empty — check selector or page structure\n🔍 URL: ${url}\n🔍 Reason: ${err.message}`);
    return `\n\n### ${title}\n\n`;
  }
}

// 🧭 Scrape 1 destination
async function scrapeOne({ city, country, continent }) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  const url = generateLink(country, city);
  console.log(`🌍 Scraping ${city} (${url})`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const summary = $('meta[name="description"]').attr('content') || '';

    // 🗺️ Attempt to find attractions (from teaser list)
    const attractions = [];
    $('a[href*="/attractions/"] h3').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !attractions.includes(name)) attractions.push(name);
    });

    console.log(`📍 Found ${attractions.length} attractions for ${city}`);

    // 🧰 Planning Tools (Puppeteer scraping of external articles)
    let planning_tools_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        planning_tools_md += await extractArticleMarkdown(article);
      }
    }

    // 📦 Build insert payload
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
      link: url,
      overview_md: '',
      itinerary_md: '',
      planning_tools_md: planning_tools_md.trim(),
      popular_attractions: attractions,
      interests: ['culture', 'exploration'],
      popularity: Math.floor(Math.random() * 100),
      source: 'lp',
      summary,
      description: summary,
    };

    console.log('📦 Final Payload:', JSON.stringify(payload, null, 2));

    const { error } = await supabase
      .from('destinations')
      .upsert([payload], { onConflict: 'slug' });

    if (error) {
      console.error(`❌ Failed inserting ${city}:`, error.message);
    } else {
      console.log(`✅ Inserted ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🏁 Runner
export async function runRawScraper() {
  console.log('🟢 Starting fallback raw scraper...');
  for (const dest of destinations) {
    await scrapeOne(dest);
  }
  console.log('✅ Fallback scraper run complete!');
}
