const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

(async () => {
  const { error } = await supabase.from('destinations').insert([
    {
      slug: 'test-slug-123',
      name: 'Test Place',
      country: 'Nowhere',
    },
  ]);

  if (error) {
    console.error('❌ Insert failed:', error.message);
  } else {
    console.log('✅ Test insert succeeded');
  }
})();
