export async function handler() {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      message: 'Netlify Functions are working ✅',
      timestamp: new Date().toISOString(),
    }),
  };
}

