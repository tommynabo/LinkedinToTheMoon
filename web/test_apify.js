require('dotenv').config();
const token = process.env.APIFY_API_TOKEN;
async function test() {
  const url = `https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items?token=${token}`;
  console.log("Fetching...");
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchQuery: "SEO", maxPosts: 5 })
  });
  if (!res.ok) {
    console.log("Error:", res.status, await res.text());
    return;
  }
  const data = await res.json();
  console.log("Items:", data.length);
  if (data.length > 0) console.log(JSON.stringify(data[0]).substring(0, 500));
}
test();
