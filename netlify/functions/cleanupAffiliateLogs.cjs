// netlify/functions/cleanupAffiliateLogs.cjs
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 🧹 Cleans up affiliate_logs entries older than 30 days.
 * Can be run manually or via Netlify Scheduler (e.g., daily/weekly).
 */
exports.handler = async () => {
  try {
    console.log("[cleanupAffiliateLogs] 🚀 Starting cleanup...");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const { error } = await supabase
      .from("affiliate_logs")
      .delete()
      .lt("timestamp", cutoff.toISOString());

    if (error) {
      console.error("[cleanupAffiliateLogs] ❌ Error deleting logs:", error.message);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    console.log("[cleanupAffiliateLogs] ✅ Cleanup completed for logs older than", cutoff.toISOString());

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Affiliate log cleanup completed", cutoff: cutoff.toISOString() }),
    };
  } catch (err) {
    console.error("[cleanupAffiliateLogs] 💥 Fatal error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
