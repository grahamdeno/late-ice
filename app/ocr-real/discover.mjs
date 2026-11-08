// Prints the layout of one league box score page with every letter masked (x/X), digits and tags kept.
const url = process.argv[2];
const html = await (await fetch(url, { headers: { "User-Agent": "late-ice-eval" } })).text();
const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
const masked = body.replace(/>([^<]+)</g, (_, t) => ">" + t.replace(/[a-z]/g, "x").replace(/[A-Z]/g, "X") + "<")
  .replace(/\s+/g, " ").replace(/></g, ">\n<");
console.log(masked.split("\n").filter((l) => !/^<(meta|link|br)/i.test(l)).slice(0, 700).join("\n"));
