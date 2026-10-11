# Geographic reference snapshot

## Cities

Contains a transformed [GeoNames cities500 export](https://download.geonames.org/export/dump/) and administrative region names from `admin1CodesASCII.txt`. GeoNames supplies its data under [Creative Commons Attribution 4.0](https://download.geonames.org/export/dump/readme.txt). Attribution: **GeoNames, https://www.geonames.org/**. Our transformation retains geographic IDs, coordinates, timezones, names, aliases, population and region labels, and compresses JSON. Country labels come from Node's English `Intl.DisplayNames`.

The snapshot has 236,012 records. Coverage includes cities/towns above the export's population threshold and administrative seats, not every village, island, resort or travel destination. Records without a supported IANA timezone are omitted. Names, population and boundaries can be incomplete or outdated; membership in this dataset is not independent verification of current conditions. Duplicate names require selection/disambiguation. Aliases help alternate spellings; primary-name matches take priority over incidental aliases.

## Airports

Contains 7,917 three-letter IATA references with supported timezones, transformed from [mwgg/Airports](https://github.com/mwgg/Airports) at revision `a89e4e0dda9d9878337e2da190ebe1ef1d6af705`. Its MIT notice is preserved in `AIRPORTS-LICENSE.txt`. References identify airports and local timezones, not live operational status, flight schedules, bookings or transfer routes. Some airports without IATA codes are deliberately unsupported.

## Reproducibility and updates

`provenance.json` records import time, upstream revision, input SHA-256 digests and record counts. Gzip files are application reference data, not secrets, and should accompany the source in Git. Runtime requests read these bundled snapshots; they do not contact GeoNames or another geographic API. Missing/corrupt data fails closed with a retryable error rather than accepting arbitrary text.

Updates are explicit, never part of installation/build/testing. Download the city archive, administrative labels, and the airport JSON/license from the same chosen airport revision; then run:

```sh
node scripts/import-geography.mjs /path/cities500.zip /path/admin1CodesASCII.txt /path/airports.json /path/LICENSE airport-git-sha
```

Review the resulting provenance/counts and rerun geography, scheduling and persistence tests. The importer needs Node and `unzip`. GeoNames daily exports are mutable; retain the downloaded files/digests to reproduce a particular snapshot. The implementation holds a lazily initialized in-process index: this trades memory/cold-start time for no network dependency. Benchmark larger deployment targets before release; no production memory or concurrency capacity is claimed here.
