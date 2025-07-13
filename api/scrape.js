const { createClient } = require('@supabase/supabase-js');
const { getMockDestinations, generateSlug } = require('../../scrapers/mockLonelyPlanet');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const slugParam = event.queryStringParameters?.slug || '';
  const mockData = getMockDestinations();
  let inserted = 0;

  for (const dest of mockData) {
    const slug = generateSlug({ city: dest.city, country: dest.country, name: dest.title });
    if (!slug.includes(slugParam)) continue;

    const { data: existing } = await supabase
      .from('destinations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('destinations').insert([
        { ...dest, slug, name: dest.title, images: [dest.image] },
      ]);
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      inserted++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', inserted }),
  };
};
