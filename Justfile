# Names and ports come from portless (github:haglobah/portless, in the dev
# shell). Its proxy listens on proxy_port and maps <name>.localhost to the
# ports below; worktrees get a branch prefix. The first server to start brings
# the proxy up, the last one to stop takes it down.
proxy_port := "8099"
site_host := `portless host`
# One block of consecutive ports per checkout, chosen by hashing site_host and
# moved to the next free block on a collision. Add a service here and its port
# is the next one in the block.
services := "astro bsky comment"
astro_port := shell('portless port "$1" astro $2', site_host, services)
bsky_port := shell('portless port "$1" bsky $2', site_host, services)
comment_port := shell('portless port "$1" comment $2', site_host, services)
astro_url := "http://localhost:" + astro_port
site_url := "http://" + site_host + ":" + proxy_port
bsky_url := "http://bsky." + site_host + ":" + proxy_port
comment_url := "http://comments." + site_host + ":" + proxy_port
with_route := "portless with-route --proxy-port " + proxy_port

help:
    just --list

# Show the names and ports this checkout uses
ports:
    @echo "site     {{site_url}}  ->  {{astro_url}}"
    @echo "bsky     {{bsky_url}}  ->  http://localhost:{{bsky_port}}"
    @echo "comments {{comment_url}}  ->  http://localhost:{{comment_port}}"

# Run this project's proxy in the foreground (normally started by just dev)
proxy:
    PORTLESS_PORT={{proxy_port}} portless serve

setup:
    npm clean-install

fmt:
    oxfmt src/content/**/*.mdx

[parallel]
dev: astro bsky-server comment-server

track args="":
    npm run track-updates -- {{ args }}

books:
    npm run sync-books

astro:
    PORT={{astro_port}} PUBLIC_COMMENT_SERVER_URL={{comment_url}} \
        {{with_route}} {{site_host}} {{astro_port}} -- npm run dev

bsky-server:
    cd bsky-post-server && PORT={{bsky_port}} SITE_URL={{astro_url}} \
        {{with_route}} bsky.{{site_host}} {{bsky_port}} -- bun run dev

comment-server:
    cd comment-server && PORT={{comment_port}} \
        {{with_route}} comments.{{site_host}} {{comment_port}} -- bun run dev

deploy:
    cd comment-server && npx wrangler deploy

tail:
    cd comment-server && npx wrangler tail

open cmd="":
    #!/usr/bin/env bash
    url="{{site_url}}"

    if [[ -n "{{ cmd }}" ]]; then
        {{ cmd }} "$url"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$url"
    elif command -v open &> /dev/null; then
        open "$url"
    else
        echo "No suitable cmd found. Please install xdg-open or open."
        exit 1
    fi
