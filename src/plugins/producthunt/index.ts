import { z } from "zod";
import { basePlugin } from "../../plugin";
import type { FeedItem } from "../../types";

const postNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string().nullable().optional(),
  url: z.string(),
  website: z.string().nullable().optional(),
  votesCount: z.number(),
  createdAt: z.string(),
  topics: z.object({
    edges: z.array(z.object({ node: z.object({ name: z.string() }) })),
  }),
});

const responseSchema = z.object({
  data: z.object({
    posts: z.object({
      edges: z.array(z.object({ node: postNodeSchema })),
    }),
  }),
});

const DEFAULT_LIMIT = 10;

const query = `
  query($postedAfter: DateTime!, $first: Int!) {
    posts(order: VOTES, first: $first, postedAfter: $postedAfter) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          createdAt
          topics { edges { node { name } } }
        }
      }
    }
  }
`;

async function resolveLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const resolved = new URL(res.url || url);
    resolved.searchParams.delete("ref");
    return resolved.toString();
  } catch {
    return url;
  }
}

interface ProductHuntOptions {
  limit?: number;
}

const plugin = {
  ...basePlugin,
  async collect(options: ProductHuntOptions) {
    const token = process.env.PRODUCTHUNT_API_KEY;
    if (!token) throw new Error("PRODUCTHUNT_API_KEY not set");

    // PH 每天 PST 00:00（UTC 08:00）重置，以此为 postedAfter
    const now = new Date();
    const pstMidnight = new Date(now);
    pstMidnight.setUTCHours(8, 0, 0, 0);
    if (pstMidnight > now) pstMidnight.setUTCDate(pstMidnight.getUTCDate() - 1);
    const postedAfter = pstMidnight.toISOString();

    const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { postedAfter, first: options.limit ?? DEFAULT_LIMIT },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const parsed = responseSchema.parse(json);

    const resolvedLinks = await Promise.all(
      parsed.data.posts.edges.map(({ node }) =>
        resolveLink(node.website || node.url),
      ),
    );

    const items: FeedItem[] = parsed.data.posts.edges.map(({ node }, index) => {
      const topics = node.topics.edges.map((e) => e.node.name).join(", ");
      const rank = index + 1;
      return {
        title: node.name,
        link: resolvedLinks[index] ?? (node.website || node.url),
        pubDate: node.createdAt,
        description: `${node.tagline}${node.description ? `\n\n${node.description}` : ""}`,
        guid: node.id,
        extra: { votesCount: node.votesCount, rank, topics, phUrl: node.url },
        level: "unknown" as const,
        reason: "未分级",
      };
    });

    return { title: "Product Hunt", items };
  },
};

export default plugin;
