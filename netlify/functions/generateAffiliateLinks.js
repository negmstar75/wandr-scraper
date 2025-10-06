import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------------------------------
// 🔗 Affiliate configuration
// --------------------------------------------
const AFFILIATE_CONFIG = {
  marker: "466615",
  trs: "252990",
  lp_ref: "5103006.jxkDNNdC6D",

  partners: {
    booking: {
      name: "Booking.com",
      baseUrl: "https://tp.media/r",
      campaign_id: "84",
      partner_id: "2076",
      logo_url:
        "https://content.skyscnr.com/m/78f2269827c54383/original/bookingcom-logo.png",
    },
    expedia: {
      name: "Expedia",
      baseUrl: "https://tp.media/r",
      campaign_id: "594",
      partner_id: "8645",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/8/89/Expedia_Logo.svg",
    },
    getyourguide: {
      name: "GetYourGuide",
      baseUrl: "https://tp.media/r",
      campaign_id: "137",
      partner_id: "6789",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/f/f2/GetYourGuide_logo.svg",
    },
    tripadvisor: {
      name: "Tripadvisor",
      baseUrl: "https://tp.media/r",
      campaign_id: "138",
      partner_id: "6781",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/6/6f/Tripadvisor_Logo.svg",
    },
    lonelyplanet: {
      name: "Lonely Planet",
      baseUrl: "https://www.lonelyplanet.com/articles",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/4/4b/Lonely_Planet_Logo.svg",
      deep_link_template:
        "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
    },
  },
};

// --------------------------------------------
// Helper: Build a Travelpayouts deep link
// --------------------------------------------
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  const encoded = encodeURIComponent(targetUrl);
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

// --------------------------------------------
// Handler: Create affiliate links for a destination
// --------------------------------------------
exports.handler = async function (event) {
  try {
    const { slug, name, country, city } = event.queryStringParameters || {};

    if (!slug || !name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required parameters: slug, name" }),
      };
    }

    console.log("[generateAffiliateLinks] Start:", { slug, name, country, city });

    const travelBase = AFFILIATE_CONFIG;
    const { marker, trs } = travelBase;

    const partners = Object.values(travelBase.partners).map((p) => {
      let targetUrl;

      if (p.name === "Lonely Planet") {
        targetUrl = p.deep_link_template.replace("{slug}", slug.split("/").pop());
      } else {
        targetUrl = `https://${p.name.toLowerCase().replace(/\s+/g, "")}.com/search?query=${encodeURIComponent(
          name || city || country
        )}`;
      }

      const deep_link =
        p.name === "Lonely Planet"
          ? targetUrl
          : buildTpLink({
              baseUrl: p.baseUrl,
              marker,
              trs,
              partner_id: p.partner_id,
              campaign_id: p.campaign_id,
              targetUrl,
            });

      return {
        partner_name: p.name,
        partner_code: p.name.toLowerCase().replace(/\s+/g, "_"),
        deep_link,
        logo_url: p.logo_url,
      };
    });

    const linksToInsert = [];

    for (const partner of partners) {
      const { data: existing } = await supabase
        .from("affiliates")
        .select("id")
        .eq("partner_code", partner.partner_code)
        .maybeSingle();

      let affiliate_id = existing?.id;

      if (!affiliate_id) {
        const { data: aff, error: insertErr } = await supabase
          .from("affiliates")
          .insert([
            {
              partner_name: partner.partner_name,
              partner_code: partner.partner_code,
              logo_url: partner.logo_url,
              base_url: partner.deep_link,
              active: true,
            },
          ])
          .select()
          .single();

        if (insertErr) throw insertErr;
        affiliate_id = aff.id;
      }

      linksToInsert.push({
        destination_slug: slug,
        affiliate_id,
        deep_link: partner.deep_link,
        metadata: { city, country },
      });
    }

    console.log("Attempting to insert affiliate links:", linksToInsert);

    const { error: upsertErr } = await supabase
      .from("partner_affiliate_links")
      .upsert(linksToInsert, { onConflict: "destination_slug,affiliate_id" });

    if (upsertErr) {
      console.error("Supabase insert error:", upsertErr);
      throw upsertErr;
    }

    console.log(`[generateAffiliateLinks] ✅ Successfully inserted ${linksToInsert.length} links`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners: linksToInsert.length,
      }),
    };
  } catch (err) {
    console.error("[generateAffiliateLinks] ❌ Fatal error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
