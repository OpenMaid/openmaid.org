# syntax=docker/dockerfile:1
#
# The site's image (site plan §15): the site built in Node, then served by nginx over plain HTTP on port 8080, behind
# the reverse proxy that terminates HTTPS.
#
# The build reads two folders of the build context that git ignores: data/<game>/, each game's export (site design
# §10.1), and bundle/, holding one OME-reference-<version>.zip. They reach the build as bind mounts, so no layer of
# either stage holds them: the image has the built pages and pictures, never an export's SQLite. The deploy workflow
# downloads both; to build by hand, copy them in as the README says, then
#
#   docker build -t ome-site .
#   docker run --rm -p 8080:8080 ome-site

FROM node:24-bookworm-slim AS build
WORKDIR /site
# The heap a 16 GB machine gives Node by default, so a runner with less memory builds as a desk does.
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY astro.config.mjs site.config.mjs tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN --mount=type=bind,source=data,target=/site/data \
	--mount=type=bind,source=bundle,target=/site/bundle \
	npm run build \
	&& node scripts/entity-redirects.mjs dist > /site/entity-redirects.map

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/entity-redirects.map /etc/nginx/entity-redirects.map
COPY --from=build /site/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
