import axios from 'axios';
import cheerio from 'cheerio';
import slugify from 'slugify';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const destinations = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

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

function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}`;
}

// 🧭 Scrape full article text via Puppeteer
async function extractArticleMarkdown({ title, url }) {
  console.log(`🧭 Launching headless browser for: ${title}`);
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('article', { timeout: 10000 });

    const content = await page.evaluate(() => {
      const article = document.querySelector('article');
      if (!article) return '';
      const paras = Array.from(article.querySelectorAll('p, h2, h3'))
        .map(el => el.innerText.trim())
        .filter(text =>
          text.length > 50 &&
          !text.includes('USD') &&
          !text.includes('Subscribe') &&
          !text.includes('Lonely Planet Shop')
        );
      return paras.join('\n\n');
    });

    await browser.close();

    if (!content) {
      console.warn(`⚠️ Article "${title}" is empty — check selector or structure`);
    }

    return `\n\n### ${title}\n\n${content}`;
  } catch (err) {
    console.error(`🔍 URL: ${url}`);
    console.error(`🔍 Error: ${err.message}`);
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
    $('section a[href*="/attractions/"] h3').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !attractions.includes(name)) attractions.push(name);
    });

    console.log(`📍 Found ${attractions.length} attractions for ${city}`);

    // 🧾 Planning tools
    let planning_tools_md = '';
    if (planningArticles[city]) {
      for (const article of planningArticles[city]) {
        const markdown = await extractArticleMarkdown(article);
        planning_tools_md += markdown;
      }
    }

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
