const { createClient } = require('@supabase/supabase-js');
const { getEnrichedDestinations, generateSlug } = require('../../scrapers/lonelyPlanetScraper.js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let mockData;
  try {
    mockData = await getEnrichedDestinations(); // ✅ fixed function name
  } catch (err) {
    console.error('❌ Failed to load enriched destinations', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get mock destinations', details: err.message }),
    };
  }

  const slugParam = event.queryStringParameters?.slug || '';
  console.log('Slug param:', slugParam);
  console.log('Destinations to insert:', mockData.length);

  let inserted = 0;

  for (const dest of mockData) {
    const slug = generateSlug({ city: dest.city, country: dest.country, name: dest.title });

    const { data: existing } = await supabase
      .from('destinations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('destinations').insert([
        {
          ...dest,
          slug,
          name: dest.title,
          images: [dest.image],
        },
      ]);

      if (error) {
        console.error(`❌ Failed to insert ${slug}:`, error.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }

      inserted++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', inserted, source: 'lonelyplanet' }),
  };
};
