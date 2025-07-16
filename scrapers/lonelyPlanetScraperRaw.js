// scrapers/lonelyPlanetScraperRaw.js
import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Destination list
const destinations = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 🧭 Planning article links
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

// 🔗 Affiliate link generator
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}`;
}

// 📄 Extract full article content with Puppeteer
async function extractArticleMarkdown({ title, url }) {
  console.log(`🧭 Launching headless browser for: ${title}`);
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const content = await page.evaluate(() => {
      const article = document.querySelector('article');
      if (!article) return '';
      return Array.from(article.querySelectorAll('p'))
        .map(p => p.innerText.trim())
        .filter(Boolean)
        .join('\n\n');
    });

    await browser.close();

    if (!content) {
      console.warn(`⚠️ Article "${title}" is empty — check selector or page structure`);
    }

    return `\n\n### ${title}\n\n${content}`;
  } catch (err) {
    console.error(`🔍 URL: ${url}`);
    console.error(`🔍 Reason: ${err.message}`);
    return '';
  }
}

// 🚀 Scrape a single destination
async function scrapeOne({ city, country, continent }) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  const url = `https://www.lonelyplanet.com/destinations/${slug}`;
  console.log(`🌍 Scraping ${city} (${url})`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const summary = $('meta[name="description"]').attr('content') || '';

    const attractions = [];
    $('a[href*="/attractions/"] h3').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !attractions.includes(name)) attractions.push(name);
    });
    console.log(`📍 Found ${attractions.length} attractions for ${city}`);

    // 📚 Planning articles markdown
    let planning_tools_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        planning_tools_md += await extractArticleMarkdown(article);
      }
    }

    // 📦 Final payload
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

    const { error } = await supabase.from('destinations').upsert([payload], {
      onConflict: 'slug',
    });

    if (error) {
      console.error(`❌ Failed inserting ${city}:`, error.message);
    } else {
      console.log(`✅ Inserted ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🔁 Main runner
export async function runRawScraper() {
  console.log('🟢 Starting fallback raw scraper...');
  for (const dest of destinations) {
    await scrapeOne(dest);
  }
}
