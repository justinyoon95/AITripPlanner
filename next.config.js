/** @type {import('next').NextConfig} */
module.exports = {
  outputFileTracingIncludes: { "/api/*": ["./data/geography/*.gz"] },
};
