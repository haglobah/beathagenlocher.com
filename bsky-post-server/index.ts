import { AtpAgent, RichText } from '@atproto/api';
import * as util from 'util';

const agent = new AtpAgent({ service: 'https://bsky.social' });

// Auth on startup
await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
});

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/post' && req.method === 'POST') {
      const { text } = await req.json();

      const rt = new RichText({ text });
      await rt.detectFacets(agent);

      const payload = {
        text: rt.text,
        facets: rt.facets,
      };

      console.log(util.inspect(payload, false, null, true));

      await agent.post(payload);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);
