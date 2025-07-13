const axios = require('axios');
const cheerio = require('cheerio');
const slugify = require('slugify');
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 🔑 API keys
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 🌍 Destinations to scrape
const destinationList = [
  { city: 'London', country: 'England', continent: 'Europe' },
  { city: 'Tokyo', country: 'Japan', continent: 'Asia' },
];

// 🔗 Build affiliate link
function generateLink(country, city) {
  const slug = `${slugify(country, { lower: true })}/${slugify(city, { lower: true })}`;
  return `https://www.lonelyplanet.com/destinations/${slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program`;
}

// 🧠 AI: Overview + Summary
async function generateOverview(city, country, introText, attractionsList) {
  const systemPrompt = `You're a seasoned travel editor. Write a concise, vivid introduction (2-3 paragraphs max) for a travel destination, suitable for an inspiration app. Follow the style of Lonely Planet: immersive, practical, and emotionally engaging. Use real attraction names and highlight what's unique.`;

  const userPrompt = `Destination: ${city}, ${country}
Overview: ${introText}
Must-see attractions: ${attractionsList.join(', ')}

Write a summary.`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 🧠 AI: Digest Summary
async function generateDigest(markdown) {
  const systemPrompt = `You're a travel editor. Create a 2–3 paragraph summary (engaging tone) from the following destination content. Do NOT list items. Summarize the experience and what a traveler would love.`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: markdown },
    ],
  });

  return res.choices?.[0]?.message?.content?.trim() || '';
}

// 🔧 Main scraper
async function scrapeDestination({ city, country, continent }) {
  const citySlug = slugify(city, { lower: true });
  const countrySlug = slugify(country, { lower: true });
  const slug = `${countrySlug}/${citySlug}`;
  const url = `https://www.lonelyplanet.com/destinations/${countrySlug}/${citySlug}`;

  console.log(`🌍 Scraping: ${city}, ${country}`);
  console.log(`🔗 URL: ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const introText = $('meta[name="description"]').attr('content') || '';

    // 🏛 Must-see attractions - Full text blocks
    let attractions = '';
    const attractionSection = $('h2:contains("Must-see attractions")').parent().next();
    attractionSection.find('div').each((_, el) => {
      const title = $(el).find('h3, h4').first().text().trim();
      const desc = $(el).find('p').first().text().trim();
      if (title && desc) {
        attractions += `\n\n### ${title}\n${desc}`;
      }
    });

    // 🧭 Planning Tools
    let planning_md = '';
    $('h2:contains("Planning Tools")').parent().nextUntil('h2').each((_, el) => {
      const tag = el.tagName;
      const text = $(el).text().trim();
      if (tag === 'h3') planning_md += `\n\n### ${text}\n`;
      else if (tag === 'p') planning_md += `${text}\n`;
    });

    // 📍 Things to Do
    let things_md = '';
    $('h2:contains("Things to do")').parent().nextUntil('h2').each((_, el) => {
      const tag = el.tagName;
      const text = $(el).text().trim();
      if (tag === 'h3') things_md += `\n\n### ${text}\n`;
      else if (tag === 'p') things_md += `${text}\n`;
    });

    // 🧠 Overview
    const overview_md = await generateOverview(city, country, introText, attractions.split('###').map(x => x.trim().split('\n')[0]));

    // 🧠 Digest Summary
    const digest_input = `## Overview\n${overview_md}\n\n## Attractions\n${attractions}\n\n## Planning\n${planning_md}\n\n## Things to Do\n${things_md}`;
    const ai_markdown = await generateDigest(digest_input);

    // 📝 Insert into Supabase
    const { error } = await supabase.from('destinations').upsert([
      {
        slug,
        title: city,
        name: city,
        country,
        city,
        region: country,
        continent,
        link: generateLink(country, city),
        image: `https://source.unsplash.com/featured/?${city},${country}`,
        overview_md,
        itinerary_md: '', // filled later
        planning_tools_md: planning_md.trim(),
        things_to_do_md: things_md.trim(),
        popular_attractions: attractions.trim(),
        interests: ['culture', 'exploration'],
        source: 'lp',
        popularity: Math.floor(Math.random() * 100),
        ai_markdown,
      },
    ]);

    if (error) {
      console.error(`❌ Supabase insert failed for ${city}:`, error.message);
    } else {
      console.log(`✅ Saved: ${city}`);
    }
  } catch (err) {
    console.error(`❌ Failed to scrape ${city}: ${err.message}`);
  }
}

// 🚀 Main runner
async function runLonelyPlanetScraper() {
  console.log('🚀 Starting Lonely Planet scraper...');
  for (const dest of destinationList) {
    await scrapeDestination(dest);
  }
  console.log('🎉 LP scraping completed');
}

module.exports = { runLonelyPlanetScraper };
