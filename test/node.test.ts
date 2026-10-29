import type { IExecuteFunctions, IHttpRequestOptions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { version } from '../package.json';
import { MakesPdf } from '../nodes/MakesPdf/MakesPdf.node';

interface StubResponse {
	statusCode: number;
	body: unknown;
	headers?: Record<string, string>;
}

const PDF = Buffer.from('%PDF-1.7\n%stub\n');

function stubContext(
	params: Record<string, unknown>,
	responses: StubResponse[],
	{ continueOnFail = false, items = 1 } = {},
) {
	const calls: Array<{ credential: string; options: IHttpRequestOptions }> = [];
	const node = {
		id: 'n1',
		name: 'makesPDF',
		type: 'makesPdf',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const context = {
		getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
		getNodeParameter: (
			name: string,
			_i: number,
			fallback?: unknown,
			opts?: { extractValue?: boolean },
		) => {
			const value = name in params ? params[name] : fallback;
			if (opts?.extractValue && value && typeof value === 'object' && 'value' in value) {
				return (value as { value: unknown }).value;
			}
			return value;
		},
		getCredentials: async () => ({ apiKey: 'k', baseUrl: 'http://localhost:8788/' }),
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credential: string, options: IHttpRequestOptions) => {
				calls.push({ credential, options });
				const next = responses.shift();
				if (!next) throw new Error('unexpected request');
				return { headers: {}, ...next };
			},
			prepareBinaryData: async (data: Buffer, fileName: string, mimeType: string) => ({
				data: data.toString('base64'),
				fileName,
				mimeType,
			}),
		},
	};
	return { context: context as unknown as IExecuteFunctions, calls };
}

async function run(context: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const [output] = await new MakesPdf().execute.call(context);
	return output;
}

describe('MakesPdf node', () => {
	it('creates a PDF from markdown as binary data', async () => {
		const { context, calls } = stubContext(
			{
				resource: 'pdf',
				operation: 'fromMarkdown',
				markdown: '# Hello',
				markdownOptions: { title: 'Hello', pageSize: 'A4' },
				binaryPropertyName: 'pdf',
				fileName: '',
			},
			[{ statusCode: 200, body: PDF, headers: { 'x-pages': '1', 'x-artifact-id': 'a1' } }],
		);
		const [item] = await run(context);

		expect(calls).toHaveLength(1);
		const { credential, options } = calls[0];
		expect(credential).toBe('makesPdfApi');
		expect(options).toMatchObject({
			method: 'POST',
			url: 'http://localhost:8788/api/v1/md',
			body: { markdown: '# Hello', options: { title: 'Hello', pageSize: 'A4' } },
			encoding: 'arraybuffer',
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		});
		expect(options.headers).toMatchObject({
			Accept: 'application/pdf',
			'Content-Type': 'application/json',
			'X-MakesPDF-Client': `n8n/${version}`,
		});
		expect(item.json).toEqual({
			fileName: 'Hello.pdf',
			sizeBytes: PDF.length,
			pageCount: 1,
			artifactId: 'a1',
		});
		expect(item.binary?.pdf).toMatchObject({ fileName: 'Hello.pdf', mimeType: 'application/pdf' });
		expect(Buffer.from(item.binary!.pdf.data, 'base64').equals(PDF)).toBe(true);
	});

	it('renders a template picked from the list with JSON data', async () => {
		const { context, calls } = stubContext(
			{
				resource: 'pdf',
				operation: 'fromTemplate',
				templateId: { mode: 'list', value: 'invoice-classic' },
				data: '{"name":"Ada"}',
				renderOptions: {},
				binaryPropertyName: 'data',
				fileName: 'invoice.pdf',
			},
			[{ statusCode: 200, body: new Uint8Array(PDF).buffer }],
		);
		const [item] = await run(context);
		expect(calls[0].options).toMatchObject({
			method: 'POST',
			url: 'http://localhost:8788/api/v1/render',
			body: { templateId: 'invoice-classic', data: { name: 'Ada' } },
		});
		expect(item.json.fileName).toBe('invoice.pdf');
		expect(item.binary?.data.mimeType).toBe('application/pdf');
	});

	it('renders a template script', async () => {
		const dsl = 'const template = doc(page(col(s("Hi {{name}}"))));';
		const { context, calls } = stubContext(
			{
				resource: 'pdf',
				operation: 'fromDsl',
				dsl,
				data: { name: 'Ada' },
				renderOptions: { title: 'Greeting' },
				binaryPropertyName: 'data',
			},
			[{ statusCode: 200, body: PDF }],
		);
		const [item] = await run(context);
		expect(calls[0].options.body).toEqual({
			dsl,
			data: { name: 'Ada' },
			options: { title: 'Greeting' },
		});
		expect(item.json.fileName).toBe('Greeting.pdf');
	});

	it('pages through templates until the limit', async () => {
		const page = (start: number, count: number) =>
			Array.from({ length: count }, (_, k) => ({
				templateId: `t${start + k}`,
				name: `T${start + k}`,
			}));
		const { context, calls } = stubContext(
			{
				resource: 'template',
				operation: 'getAll',
				returnAll: false,
				limit: 150,
				filters: { owner: 'library' },
			},
			[
				{ statusCode: 200, body: { templates: page(0, 100), total: 230, limit: 100, offset: 0 } },
				{ statusCode: 200, body: { templates: page(100, 50), total: 230, limit: 50, offset: 100 } },
			],
		);
		const items = await run(context);
		expect(items).toHaveLength(150);
		expect(items[149].json.templateId).toBe('t149');
		expect(calls.map((c) => c.options.qs)).toEqual([
			{ owner: 'library', limit: 100, offset: 0 },
			{ owner: 'library', limit: 50, offset: 100 },
		]);
		expect(calls[0].options).toMatchObject({ method: 'GET', json: true });
		expect(calls[0].options.headers).toMatchObject({ Accept: 'application/json' });
	});

	it('returns every template with Return All', async () => {
		const { context, calls } = stubContext(
			{ resource: 'template', operation: 'getAll', returnAll: true, filters: {} },
			[
				{
					statusCode: 200,
					body: { templates: [{ templateId: 'a' }], total: 2, limit: 100, offset: 0 },
				},
				{
					statusCode: 200,
					body: { templates: [{ templateId: 'b' }], total: 2, limit: 100, offset: 1 },
				},
			],
		);
		expect((await run(context)).map((i) => i.json.templateId)).toEqual(['a', 'b']);
		expect(calls).toHaveLength(2);
	});

	it('returns the validation result as JSON', async () => {
		const result = {
			valid: false,
			issues: [{ severity: 'warning', message: 'm', path: 'p', rule: 'r' }],
			summary: { errors: 0, warnings: 1 },
		};
		const { context, calls } = stubContext(
			{ resource: 'markdown', operation: 'validate', markdown: '## No H1' },
			[{ statusCode: 200, body: result }],
		);
		const [item] = await run(context);
		expect(calls[0].options).toMatchObject({
			method: 'POST',
			url: 'http://localhost:8788/api/v1/md/validate',
			body: { markdown: '## No H1' },
			json: true,
		});
		expect(item.json).toEqual(result);
	});

	it('maps an API error to NodeApiError with the server message', async () => {
		const body = new TextEncoder().encode(JSON.stringify({ error: 'Template not found' })).buffer;
		const { context } = stubContext(
			{
				resource: 'pdf',
				operation: 'fromTemplate',
				templateId: { mode: 'id', value: 'missing' },
				data: '{}',
				renderOptions: {},
				binaryPropertyName: 'data',
			},
			[{ statusCode: 404, body }],
		);
		const error = await run(context).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('Template not found');
		expect((error as NodeApiError).httpCode).toBe('404');
		expect((error as NodeApiError).context.itemIndex).toBe(0);
	});

	it('maps a 401 to a credential message', async () => {
		const { context } = stubContext(
			{ resource: 'markdown', operation: 'validate', markdown: '# Hi' },
			[{ statusCode: 401, body: { error: 'Unauthorized' } }],
		);
		const error = (await run(context).catch((e: unknown) => e)) as NodeApiError;
		expect(error.message).toBe('The makesPDF API key was rejected');
		expect(error.description).toContain('Check the API key');
	});

	it('reports bad template data as a NodeOperationError without calling the API', async () => {
		const { context, calls } = stubContext(
			{
				resource: 'pdf',
				operation: 'fromDsl',
				dsl: 'x',
				data: '{bad',
				renderOptions: {},
				binaryPropertyName: 'data',
			},
			[],
		);
		const error = await run(context).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as Error).message).toContain('not valid JSON');
		expect(calls).toHaveLength(0);
	});

	it('searches templates for the picker and pages with an offset token', async () => {
		const { context, calls } = stubContext({}, [
			{
				statusCode: 200,
				body: {
					templates: [
						{
							templateId: 'invoice-classic',
							name: 'Classic Invoice',
							ownerUserId: null,
							description: 'd',
						},
						{ templateId: 'u-1', name: 'My invoice', ownerUserId: 'user-1' },
					],
					total: 150,
					limit: 100,
					offset: 0,
				},
			},
		]);
		const node = new MakesPdf();
		const result = await node.methods.listSearch.searchTemplates.call(
			context as unknown as Parameters<typeof node.methods.listSearch.searchTemplates>[0],
			'invoice',
			'100',
		);
		expect(calls[0].options.qs).toEqual({ owner: 'all', q: 'invoice', limit: 100, offset: 100 });
		expect(result.results).toEqual([
			{ name: 'Classic Invoice (library)', value: 'invoice-classic', description: 'd' },
			{ name: 'My invoice', value: 'u-1', description: undefined },
		]);
		expect(result.paginationToken).toBe('102');
	});

	it('keeps going with Continue On Fail', async () => {
		const { context } = stubContext(
			{ resource: 'markdown', operation: 'validate', markdown: '# Hi' },
			[
				{ statusCode: 429, body: { error: 'rate-limited' }, headers: { 'retry-after': '10' } },
				{ statusCode: 200, body: { valid: true, issues: [], summary: { errors: 0, warnings: 0 } } },
			],
			{ continueOnFail: true, items: 2 },
		);
		const items = await run(context);
		expect(items[0].json).toEqual({ error: 'makesPDF rate limit reached' });
		expect(items[1].json.valid).toBe(true);
		expect(items.map((i) => i.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});
});
