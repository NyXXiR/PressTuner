import { z } from "zod";

export const PressToneSchema = z.enum(["formal", "neutral", "friendly"]);
export const InitializeArticleBodySchema = z.object({ teamId: z.string().optional(), type: z.enum(["PRESS_RELEASE", "BLOG_POST", "NEWSLETTER", "OTHER"]).optional() }).passthrough();
export const NormalizeBriefBodySchema = z.object({ teamId: z.string().optional(), rawText: z.string().optional(), tone: z.unknown().optional(), quotaMode: z.enum(["simplified"]).optional() }).passthrough();
export const GenerateArticleBodySchema = z.object({ teamId: z.string().optional(), serviceName: z.string().optional(), announceType: z.string().min(1), oneLiner: z.string().optional(), points: z.array(z.string()).default([]), quoteMessage: z.string().optional(), quoteWho: z.string().optional(), tone: PressToneSchema, rawText: z.string().optional(), eventAt: z.string().optional(), publishAt: z.string().optional(), quotaMode: z.enum(["simplified"]).optional() });
export const ReviewArticleBodySchema = z.object({ teamId: z.string().optional(), title: z.string().min(1), plain: z.string().min(1), userInstruction: z.string().max(1000).optional(), quotaMode: z.enum(["simplified"]).optional() });
export const RewriteArticleBodySchema = z.object({ teamId: z.string().optional(), selectedNoteIds: z.array(z.string()).default([]), userInstruction: z.string().default(""), quotaMode: z.enum(["simplified"]).optional() }).passthrough();

export type ReviewArticleInput = z.infer<typeof ReviewArticleBodySchema>;
export type RewriteArticleInput = z.infer<typeof RewriteArticleBodySchema>;

