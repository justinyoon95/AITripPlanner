import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// Explicit offline import: never executed during installation, tests or build.
const [citiesZip, regionFile, airportFile, licenseFile, airportRevision] =
  process.argv.slice(2);
if (!licenseFile || !/^[a-f0-9]{40}$/.test(airportRevision ?? ""))
  throw new Error(
    "Usage: node scripts/import-geography.mjs cities.zip regions.txt airports.json LICENSE airport-git-sha",
  );
const regions = new Map(
  readFileSync(regionFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const [code, name] = line.split("\t");
      return [code, name];
    }),
);
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const validZone = (zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};
const text = execFileSync("unzip", ["-p", citiesZip, "cities500.txt"], {
  maxBuffer: 100 * 1024 * 1024,
  encoding: "utf8",
});
const cities = text
  .trim()
  .split("\n")
  .map((line) => {
    const c = line.split("\t");
    return {
      id: c[0],
      name: c[1],
      region: regions.get(`${c[8]}.${c[10]}`) ?? "",
      countryCode: c[8],
      country: countryNames.of(c[8]),
      latitude: Number(c[4]),
      longitude: Number(c[5]),
      timezone: c[17],
      aliases: [...new Set([c[2], ...c[3].split(",")])].filter(Boolean),
      population: Number(c[14]),
    };
  })
  .filter((city) => validZone(city.timezone));
const airports = Object.values(JSON.parse(readFileSync(airportFile, "utf8")))
  .filter((a) => /^[A-Z]{3}$/.test(a.iata) && validZone(a.tz))
  .map((a) => ({
    code: a.iata,
    name: a.name,
    countryCode: a.country,
    timezone: a.tz,
  }));
mkdirSync("data/geography", { recursive: true });
const sources = {
  importedAt: new Date().toISOString(),
  geoNames: "https://download.geonames.org/export/dump/cities500.zip",
  airportRevision,
  hashes: Object.fromEntries(
    [citiesZip, regionFile, airportFile].map((path) => [
      path.split("/").at(-1),
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  ),
  cities: cities.length,
  airports: airports.length,
};
writeFileSync(
  "data/geography/cities.json.gz",
  gzipSync(JSON.stringify(cities)),
);
writeFileSync(
  "data/geography/airports.json.gz",
  gzipSync(JSON.stringify(airports)),
);
writeFileSync(
  "data/geography/provenance.json",
  JSON.stringify(sources, null, 2) + "\n",
);
writeFileSync(
  "data/geography/AIRPORTS-LICENSE.txt",
  readFileSync(licenseFile, "utf8").trimEnd() + "\n",
);
console.log({ cities: cities.length, airports: airports.length });
