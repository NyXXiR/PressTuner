export type ParsedBrick = {
  readonly title: string;
  readonly companyOrOrg?: string | null;
  readonly period?: string | null;
  readonly content: string;
  readonly originalText?: string;
  readonly tags?: readonly string[];
  readonly type?: string;
};
