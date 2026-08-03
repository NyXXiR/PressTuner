import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = '/home/nyxxir/PressTuner';

function read(relativePath) {
  return fs.readFileSync(`${root}/${relativePath}`, 'utf8');
}

test('layout metadata targets both press-release and resume-intent keywords', () => {
  const layout = read('app/layout.tsx');

  assert.match(layout, /보도자료 AI/);
  assert.match(layout, /자기소개서 AI/);
  assert.match(layout, /자소서 AI/);
  assert.match(layout, /keywords:/);
});

test('sitemap includes keyword landing pages for resume and press release search intents', () => {
  const sitemap = read('app/sitemap.ts');

  assert.match(sitemap, /\/resume/);
  assert.match(sitemap, /\/cover-letter-ai/);
  assert.match(sitemap, /\/press-release-ai/);
});

test('resume landing page exposes server metadata and structured data for self-introduction queries', () => {
  const resumePage = read('app/resume/page.tsx');

  assert.match(resumePage, /export const metadata/);
  assert.match(resumePage, /자기소개서 AI/);
  assert.match(resumePage, /자소서 AI/);
  assert.match(resumePage, /application\/ld\+json/);
});

test('dedicated keyword landing pages exist for cover-letter and press-release searches', () => {
  assert.equal(fs.existsSync(`${root}/app/cover-letter-ai/page.tsx`), true);
  assert.equal(fs.existsSync(`${root}/app/press-release-ai/page.tsx`), true);
});
