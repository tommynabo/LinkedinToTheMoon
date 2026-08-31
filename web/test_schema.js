require('dotenv').config();
const token = process.env.APIFY_API_TOKEN;
async function test() {
  const url = `https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchQueries: ["SEO"], maxPosts: 1 })
  });
  const data = await res.json();
  if (data.length > 0) console.log(JSON.stringify(data[0], null, 2));
}
test();
