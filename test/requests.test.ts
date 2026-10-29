import { describe, expect, it } from 'vitest';

import {
	buildListTemplates,
	buildMarkdownToPdf,
	buildRenderDsl,
	buildRenderTemplate,
	buildValidateMarkdown,
	clientHeader,
	describeApiError,
	normaliseBaseUrl,
	parseTemplateData,
	pdfFileName,
	pdfResultJson,
} from '../nodes/MakesPdf/requests';

describe('normaliseBaseUrl', () => {
	it('defaults to makespdf.com and strips trailing slashes', () => {
		expect(normaliseBaseUrl(undefined)).toBe('https://makespdf.com');
		expect(normaliseBaseUrl('  ')).toBe('https://makespdf.com');
		expect(normaliseBaseUrl('http://localhost:8788//')).toBe('http://localhost:8788');
	});
});

describe('clientHeader', () => {
	it('is <kind>/<version>', () => {
		expect(clientHeader('0.1.0')).toBe('n8n/0.1.0');
	});
});

describe('buildMarkdownToPdf', () => {
	it('posts markdown to /api/v1/md and expects a PDF', () => {
		expect(buildMarkdownToPdf('# Hi', {})).toEqual({
			method: 'POST',
			path: '/api/v1/md',
			body: { markdown: '# Hi' },
			expectsPdf: true,
		});
	});

	it('sends only the options that are set, trimmed', () => {
		const request = buildMarkdownToPdf('# Hi', {
			title: ' Report ',
			author: '',
			lang: 'ja',
			pageSize: 'Letter',
			theme: 'github',
			pageNumbers: 'page-n-of-total',
			pageNumberPosition: 'center',
		});
		expect(request.body).toEqual({
			markdown: '# Hi',
			options: {
				title: 'Report',
				lang: 'ja',
				pageSize: 'Letter',
				theme: 'github',
				pageNumbers: 'page-n-of-total',
				pageNumberPosition: 'center',
			},
		});
	});

	it('refuses empty markdown before calling the API', () => {
		expect(() => buildMarkdownToPdf('   ', {})).toThrow('Markdown is empty');
	});
});

describe('buildRenderTemplate', () => {
	it('posts templateId and data to /api/v1/render', () => {
		expect(buildRenderTemplate(' invoice-classic ', { name: 'Ada' })).toEqual({
			method: 'POST',
			path: '/api/v1/render',
			body: { templateId: 'invoice-classic', data: { name: 'Ada' } },
			expectsPdf: true,
		});
	});

	it('adds the title as an option', () => {
		expect(buildRenderTemplate('invoice-classic', { n: 1 }, 'Invoice 42').body).toEqual({
			templateId: 'invoice-classic',
			data: { n: 1 },
			options: { title: 'Invoice 42' },
		});
	});

	it('leaves out empty data so the template sample data is used', () => {
		expect(buildRenderTemplate('invoice-classic', {}).body).toEqual({
			templateId: 'invoice-classic',
		});
	});

	it('refuses an empty template id', () => {
		expect(() => buildRenderTemplate('', {})).toThrow('Template ID is empty');
	});
});

describe('buildRenderDsl', () => {
	it('posts dsl and data to /api/v1/render', () => {
		const dsl = 'const template = doc(page(col(s("Hi {{name}}"))));';
		expect(buildRenderDsl(dsl, { name: 'Ada' }, '')).toEqual({
			method: 'POST',
			path: '/api/v1/render',
			body: { dsl, data: { name: 'Ada' } },
			expectsPdf: true,
		});
	});

	it('leaves out empty data so the script sample data is used', () => {
		expect(buildRenderDsl('const template = doc(page());', {}).body).toEqual({
			dsl: 'const template = doc(page());',
		});
	});

	it('refuses an empty script', () => {
		expect(() => buildRenderDsl('', {})).toThrow('Template script is empty');
	});
});

describe('buildListTemplates', () => {
	it('maps filters to query parameters and clamps the page size', () => {
		expect(
			buildListTemplates(
				{ owner: 'library', category: 'invoice', tags: 'modern', search: 'classic' },
				500,
				20,
			),
		).toEqual({
			method: 'GET',
			path: '/api/v1/templates',
			qs: {
				owner: 'library',
				category: 'invoice',
				tags: 'modern',
				q: 'classic',
				limit: 100,
				offset: 20,
			},
			expectsPdf: false,
		});
	});

	it('omits empty filters', () => {
		expect(buildListTemplates({ owner: 'all', search: '' }, 5, 0).qs).toEqual({
			owner: 'all',
			limit: 5,
			offset: 0,
		});
	});
});

describe('buildValidateMarkdown', () => {
	it('posts markdown to /api/v1/md/validate and expects JSON', () => {
		expect(buildValidateMarkdown('# Hi')).toEqual({
			method: 'POST',
			path: '/api/v1/md/validate',
			body: { markdown: '# Hi' },
			expectsPdf: false,
		});
	});
});

describe('parseTemplateData', () => {
	it('accepts a JSON string, an object, or nothing', () => {
		expect(parseTemplateData('{"name":"Ada"}')).toEqual({ name: 'Ada' });
		expect(parseTemplateData({ name: 'Ada' })).toEqual({ name: 'Ada' });
		expect(parseTemplateData('')).toEqual({});
		expect(parseTemplateData(undefined)).toEqual({});
	});

	it('rejects invalid JSON and non-objects', () => {
		expect(() => parseTemplateData('{nope')).toThrow('not valid JSON');
		expect(() => parseTemplateData('[1,2]')).toThrow('must be a JSON object');
		expect(() => parseTemplateData('"text"')).toThrow('must be a JSON object');
	});
});

describe('pdfFileName', () => {
	it('prefers the file name, then the title, then document.pdf', () => {
		expect(pdfFileName('invoice.pdf', 'Title')).toBe('invoice.pdf');
		expect(pdfFileName('', 'Quarterly report')).toBe('Quarterly report.pdf');
		expect(pdfFileName(undefined, undefined)).toBe('document.pdf');
	});

	it('replaces path and control characters', () => {
		expect(pdfFileName('a/b\\c:d?\u0001.PDF')).toBe('a-b-c-d-.pdf');
	});
});

describe('pdfResultJson', () => {
	it('reads page count, artifact id and credits from the headers', () => {
		expect(
			pdfResultJson('a.pdf', 1234, {
				'x-pages': '3',
				'x-artifact-id': 'art_1',
				'x-credits-deducted': '1',
				'x-credits-remaining': '99',
			}),
		).toEqual({
			fileName: 'a.pdf',
			sizeBytes: 1234,
			pageCount: 3,
			artifactId: 'art_1',
			creditsDeducted: 1,
			creditsRemaining: 99,
		});
	});

	it('leaves out headers that are missing', () => {
		expect(pdfResultJson('a.pdf', 10, {})).toEqual({ fileName: 'a.pdf', sizeBytes: 10 });
	});
});

describe('describeApiError', () => {
	const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;

	it('decodes a JSON error body sent as bytes (PDF requests)', () => {
		expect(
			describeApiError(
				400,
				bytes({ error: 'Invalid request body', hint: 'Send a markdown string.' }),
			),
		).toEqual({ message: 'Invalid request body', description: 'Send a markdown string.' });
	});

	it('names the credential on 401', () => {
		const info = describeApiError(401, { error: 'Unauthorized' });
		expect(info.message).toBe('The makesPDF API key was rejected');
		expect(info.description).toContain('Check the API key');
		expect(info.description).toContain('Unauthorized');
	});

	it('explains 402 as missing credits', () => {
		expect(describeApiError(402, { error: 'Insufficient credits' }).message).toBe(
			'Not enough makesPDF credits for this render',
		);
	});

	it('keeps the server message on 404', () => {
		expect(describeApiError(404, { error: 'Template not found' })).toEqual({
			message: 'Template not found',
		});
	});

	it('includes Retry-After on 429', () => {
		const info = describeApiError(429, { error: 'rate-limited' }, { 'Retry-After': '30' });
		expect(info.message).toBe('makesPDF rate limit reached');
		expect(info.description).toContain('Retry after 30 seconds.');
	});

	it('lists validation details and issues', () => {
		const info = describeApiError(400, {
			error: 'Invalid DSL',
			details: ['dsl: must be a string'],
			issues: [{ path: 'kids[0]', message: 'unknown tag' }],
			docs: 'https://makespdf.com/docs/api',
		});
		expect(info.message).toBe('Invalid DSL');
		expect(info.description).toBe(
			'dsl: must be a string\nkids[0]: unknown tag\nDocs: https://makespdf.com/docs/api',
		);
	});

	it('falls back to the status code', () => {
		expect(describeApiError(500, undefined)).toEqual({ message: 'makesPDF returned HTTP 500' });
	});
});
