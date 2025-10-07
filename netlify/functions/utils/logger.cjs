// netlify/functions/utils/logger.cjs
const { createClient } = require("@supabase/supabase-js");

let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
} catch (err) {
  console.error("[logger] Failed to initialize Supabase client:", err.message);
}

/**
 * Logs info/warn/error to both console and Supabase affiliate_logs.
 * Non-breaking — if Supabase insert fails, it’s silently ignored.
 */
async function logToSupabase(level, message, context = {}, function_name = "generateAffiliateLinks") {
  try {
    // Always print to console
    const prefix = `[${function_name}] ${level.toUpperCase()}`;
    console[level] ? console[level](`${prefix}: ${message}`, context)
                   : console.log(`${prefix}: ${message}`, context);

    if (!supabase || !process.env.SUPABASE_URL) return;

    // Insert log entry (non-blocking)
    await supabase
      .from("affiliate_logs")
      .insert([{ function_name, level, message, context }]);
  } catch (err) {
    console.error(`[${function_name}] Logging error (ignored):`, err.message);
  }
}

module.exports = { logToSupabase };
