const { createClient } = require("@supabase/supabase-js");

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
    booking: { name: "Booking.com", baseUrl: "https://tp.media/r", campaign_id: "84", partner_id: "2076", logo_url: "https://content.skyscnr.com/m/78f2269827c54383/original/bookingcom-logo.png" },
    expedia: { name: "Expedia", baseUrl: "https://tp.media/r", campaign_id: "594", partner_id: "8645", logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/89/Expedia_Logo.svg" },
    getyourguide: { name: "GetYourGuide", baseUrl: "https://tp.media/r", campaign_id: "108", partner_id: "3965", logo_url: "https://upload.wikimedia.org/wikipedia/commons/f/f2/GetYourGuide_logo.svg" },
    tripadvisor: { name: "Tripadvisor", baseUrl: "https://tp.media/r", campaign_id: "149", partner_id: "4456", logo_url: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Tripadvisor_Logo.svg" },
    klook: { name: "Klook", baseUrl: "https://tp.media/r", campaign_id: "137", partner_id: "4110", logo_url: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Klook_logo.svg" },
    localrent: { name: "Localrent", baseUrl: "https://tp.media/r", campaign_id: "87", partner_id: "2043", logo_url: "https://www.localrent.com/images/logo.svg" },
    welcomepickups: { name: "Welcome Pickups", baseUrl: "https://tp.media/r", campaign_id: "627", partner_id: "8919", logo_url: "https://upload.wikimedia.org/wikipedia/commons/5/5f/Welcome_Pickups_logo.svg" },
    tiqets: { name: "Tiqets", baseUrl: "https://tp.media/r", campaign_id: "89", partner_id: "2074", logo_url: "https://upload.wikimedia.org/wikipedia/commons/d/db/Tiqets_logo.svg" },
    omio: { name: "Omio", baseUrl: "https://tp.media/r", campaign_id: "91", partner_id: "2078", logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/46/Omio_logo.svg" },
    rentalcars: { name: "Rentalcars", baseUrl: "https://tp.media/r", campaign_id: "130", partner_id: "3814", logo_url: "https://upload.wikimedia.org/wikipedia/commons/0/0e/Rentalcars.com_logo.svg" },
    visitorscoverage: { name: "VisitorsCoverage", baseUrl: "https://tp.media/r", campaign_id: "153", partner_id: "4552", logo_url: "https://upload.wikimedia.org/wikipedia/commons/3/3a/VisitorsCoverage_logo.svg" },
    ektatraveling: { name: "EktaTraveling", baseUrl: "https://tp.media/r", campaign_id: "225", partner_id: "5869", logo_url: "https://ektatraveling.com/logo.svg" },
    kiwitaxi: { name: "Kiwitaxi", baseUrl: "https://tp.media/r", campaign_id: "1", partner_id: "647", logo_url: "https://upload.wikimedia.org/wikipedia/commons/9/9d/Kiwitaxi_logo.svg" },
    go12: { name: "12Go", baseUrl: "https://tp.media/r", campaign_id: "44", partner_id: "1764", logo_url: "https://upload.wikimedia.org/wikipedia/commons/7/75/12Go_Asia_logo.svg" },
    gettransfer: { name: "GetTransfer", baseUrl: "https://tp.media/r", campaign_id: "147", partner_id: "4439", logo_url: "https://upload.wikimedia.org/wikipedia/commons/e/ed/GetTransfer_logo.svg" },
    cheapoair: { name: "CheapOair", baseUrl: "https://tp.media/r", campaign_id: "146", partner_id: "4426", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/CheapOair_logo.svg" },
    airalo: { name: "Airalo", baseUrl: "https://tp.media/r", campaign_id: "541", partner_id: "8310", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1d/Airalo_logo.svg" },
    drimsim: { name: "Drimsim", baseUrl: "https://tp.media/r", campaign_id: "102", partner_id: "2762", logo_url: "https://upload.wikimedia.org/wikipedia/commons/b/b3/Drimsim_logo.svg" },
    hostelworld: { name: "Hostelworld", baseUrl: "https://tp.media/r", campaign_id: "93", partner_id: "3518", logo_url: "https://upload.wikimedia.org/wikipedia/commons/7/70/Hostelworld_logo.svg" },
    airhelp: { name: "AirHelp", baseUrl: "https://tp.media/r", campaign_id: "120", partner_id: "4197", logo_url: "https://upload.wikimedia.org/wikipedia/commons/2/26/AirHelp_logo.svg" },
    gocity: { name: "GoCity", baseUrl: "https://tp.media/r", campaign_id: "62", partner_id: "1942", logo_url: "https://upload.wikimedia.org/wikipedia/commons/3/35/GoCity_logo.svg" },
    economybookings: { name: "EconomyBookings", baseUrl: "https://tp.media/r", campaign_id: "10", partner_id: "2018", logo_url: "https://upload.wikimedia.org/wikipedia/commons/e/e2/EconomyBookings_logo.svg" },
    busbud: { name: "Busbud", baseUrl: "https://tp.media/r", campaign_id: "138", partner_id: "4109", logo_url: "https://upload.wikimedia.org/wikipedia/commons/9/99/Busbud_logo.svg" },
    bikesbooking: { name: "BikesBooking", baseUrl: "https://tp.media/r", campaign_id: "57", partner_id: "1767", logo_url: "https://upload.wikimedia.org/wikipedia/commons/3/38/BikesBooking_logo.svg" },
    eatwith: { name: "EatWith", baseUrl: "https://tp.media/r", campaign_id: "164", partner_id: "4696", logo_url: "https://upload.wikimedia.org/wikipedia/commons/5/55/Eatwith_logo.svg" },
    qeeq: { name: "QEEQ", baseUrl: "https://tp.media/r", campaign_id: "172", partner_id: "4845", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Qeeq_logo.svg" },
    wayaway: { name: "WayAway", baseUrl: "https://tp.media/r", campaign_id: "200", partner_id: "5976", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1a/WayAway_logo.svg" },
    wegotrip: { name: "WeGoTrip", baseUrl: "https://tp.media/r", campaign_id: "150", partner_id: "4487", logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/83/WeGoTrip_logo.svg" },
    raileurope: { name: "RailEurope", baseUrl: "https://tp.media/r", campaign_id: "69", partner_id: "1935", logo_url: "https://upload.wikimedia.org/wikipedia/commons/7/74/RailEurope_logo.svg" },
    bigbustours: { name: "BigBusTours", baseUrl: "https://tp.media/r", campaign_id: "133", partner_id: "4036", logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Big_Bus_Tours_logo.svg" },
    autoeurope: { name: "AutoEurope", baseUrl: "https://tp.media/r", campaign_id: "90", partner_id: "2075", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1e/AutoEurope_logo.svg" },
    getrentacar: { name: "GetRentacar", baseUrl: "https://tp.media/r", campaign_id: "222", partner_id: "5996", logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/GetRentacar_logo.svg" },
    searadar: { name: "Searadar", baseUrl: "https://tp.media/r", campaign_id: "258", partner_id: "5907", logo_url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Searadar_logo.svg" },
    radicalstorage: { name: "RadicalStorage", baseUrl: "https://tp.media/r", campaign_id: "209", partner_id: "5867", logo_url: "https://upload.wikimedia.org/wikipedia/commons/b/bd/Radical_Storage_logo.svg" },
    ticketnetwork: { name: "TicketNetwork", baseUrl: "https://tp.media/r", campaign_id: "72", partner_id: "1948", logo_url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/TicketNetwork_logo.svg" },
    aviasales: { name: "Aviasales", baseUrl: "https://tp.media/r", campaign_id: "100", partner_id: "4114", logo_url: "https://upload.wikimedia.org/wikipedia/commons/6/6e/Aviasales_logo.svg" },
    intuitravel: { name: "IntuiTravel", baseUrl: "https://tp.media/r", campaign_id: "22", partner_id: "657", logo_url: "https://upload.wikimedia.org/wikipedia/commons/5/59/IntuiTravel_logo.svg" },
    compensair: { name: "Compensair", baseUrl: "https://tp.media/r", campaign_id: "86", partner_id: "4129", logo_url: "https://upload.wikimedia.org/wikipedia/commons/b/bb/Compensair_logo.svg" },

    // Lonely Planet stays separate (not Travelpayouts)
    lonelyplanet: {
      name: "Lonely Planet",
      baseUrl: "https://shop.lonelyplanet.com/products/{slug}",
      logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Lonely_Planet_Logo.svg",
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
exports.handler = async (event) => {
  try {
    const { slug, name, country, city } = event.queryStringParameters || {};

    if (!slug || !name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required parameters: slug, name" }),
      };
    }

    console.log("[generateAffiliateLinks] 🚀 Start:", { slug, name, country, city });

    const travelBase = AFFILIATE_CONFIG;
    const { marker, trs } = travelBase;

    // --- Build partner link data
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

    console.log("[generateAffiliateLinks] Built partner link array:", partners);

    // --- Prepare link insert array
    const linksToInsert = [];

    for (const partner of partners) {
      const { data: existing } = await supabase
        .from("affiliates")
        .select("id")
        .eq("partner_code", partner.partner_code)
        .maybeSingle();

      let affiliate_id = existing?.id;

      if (!affiliate_id) {
        console.log(`[generateAffiliateLinks] ➕ Creating new affiliate entry for ${partner.partner_name}`);
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
        partner_code: partner.partner_code, // ✅ added this
        deep_link: partner.deep_link,
        metadata: { city, country },
      });
    }

    console.log("[generateAffiliateLinks] Attempting Supabase upsert:", linksToInsert);

    const { error: upsertErr } = await supabase
      .from("partner_affiliate_links")
      .upsert(linksToInsert, { onConflict: "destination_slug,affiliate_id" });

    if (upsertErr) {
      console.error("[generateAffiliateLinks] ❌ Supabase upsert error:", upsertErr);
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
    console.error("[generateAffiliateLinks] 💥 Fatal error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
