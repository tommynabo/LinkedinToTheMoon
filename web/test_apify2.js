require('dotenv').config();
const token = process.env.APIFY_API_TOKEN;
async function test(body) {
  const url = `https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log("Body:", JSON.stringify(body), "-> Items:", data.length);
}
(async () => {
  await test({ searchQueries: ["SEO"], maxPosts: 2 });
  await test({ query: "SEO", maxPosts: 2 });
  await test({ keyword: "SEO", maxPosts: 2 });
})();
