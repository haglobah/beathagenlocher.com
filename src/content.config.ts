import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { glob, file } from 'astro/loaders'

const growthStageEnum = z.enum(['seedling', 'budding', 'evergreen'])

const notesCollection = defineCollection({
  loader: glob({ pattern: ['**/*.mdx'], base: './src/content/notes' }),
  schema: () =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      startDate: z.coerce.date(),
      updated: z.coerce.date(),
      topics: z.array(z.string()).default([]),
      growthStage: growthStageEnum,
      publish: z.boolean().default(false),
      toc: z.boolean().optional(),
    }),
})

const essaysCollection = defineCollection({
  loader: glob({ pattern: ['**/*.mdx'], base: './src/content/essays' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      updated: z.coerce.date(),
      startDate: z.coerce.date(),
      cover: image().optional(),
      topics: z.array(z.string()).default([]),
      growthStage: growthStageEnum,
      featured: z.boolean().optional(),
      publish: z.boolean().default(false),
      toc: z.boolean().optional(),
      aliases: z.array(z.string()).optional(),
    }),
})

const talksCollection = defineCollection({
  loader: glob({ pattern: ['**/*.mdx'], base: './src/content/talks' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      aliases: z.array(z.string()).optional(),
      startDate: z.coerce.date(),
      updated: z.coerce.date(),
      topics: z.array(z.string()),
      growthStage: growthStageEnum,
      conferences: z.array(
        z.object({
          name: z.string(),
          date: z.string(),
          location: z.string(),
        }),
      ),
      cover: image().optional(),
      publish: z.boolean().default(false),
    }),
})

const quotesCollection = defineCollection({
  loader: file('src/content/quotes.json'),
  schema: () =>
    z.object({
      content: z.string(),
      source: z.string(),
      id: z.number(),
    }),
})

const booksCollection = defineCollection({
  loader: glob({ pattern: ['**/*.mdx'], base: './src/content/books' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      authors: z.array(z.string()),
      description: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      bookId: z.string(),
      isbn13: z.string().optional(),
      shelves: z.array(z.string()).default([]),
      cover: image().optional(),
      recommendations: z.number().int().min(0).default(0),
      order: z.number(),
      startDate: z.coerce.date(),
      updated: z.coerce.date(),
      publish: z.boolean().default(true),
    }),
})

const streamCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/stream' }),
  schema: () =>
    z.object({
      title: z.string().optional(),
      startDate: z.coerce.date(),
      topics: z.array(z.string()).optional(),
      publish: z.boolean(),
    }),
})

export const collections = {
  notes: notesCollection,
  essays: essaysCollection,
  talks: talksCollection,
  quotes: quotesCollection,
  books: booksCollection,
  stream: streamCollection,
}
