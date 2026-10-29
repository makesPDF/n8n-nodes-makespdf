import type { IDataObject } from 'n8n-workflow';
import { UserError } from 'n8n-workflow';

/**
 * Request building and error mapping for the makesPDF node, kept free of n8n
 * runtime calls so it can be unit-tested directly.
 */

export const DEFAULT_BASE_URL = 'https://makespdf.com';

/** Client kind sent in `X-MakesPDF-Client`, as `<kind>/<version>`. */
export const CLIENT_KIND = 'n8n';

/** The API caps template pages at 100 rows. */
export const TEMPLATE_PAGE_SIZE = 100;

export interface ApiRequest {
	method: 'GET' | 'POST';
	/** Path below the base URL, starting with `/api/v1/`. */
	path: string;
	qs?: IDataObject;
	body?: IDataObject;
	/** True when a successful response is PDF bytes rather than JSON. */
	expectsPdf: boolean;
}

export interface MarkdownOptions {
	author?: string;
	fontFamily?: string;
	lang?: string;
	pageNumberPosition?: string;
	pageNumbers?: string;
	pageSize?: string;
	theme?: string;
	title?: string;
}

export interface TemplateFilters {
	category?: string;
	owner?: string;
	search?: string;
	tags?: string;
}

export function normaliseBaseUrl(value: unknown): string {
	const raw = typeof value === 'string' ? value.trim() : '';
	return (raw === '' ? DEFAULT_BASE_URL : raw).replace(/\/+$/, '');
}

export function clientHeader(version: string): string {
	return `${CLIENT_KIND}/${version}`;
}

/** Drop unset values so the API applies its own defaults. */
function compact(values: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		out[key] = typeof value === 'string' ? value.trim() : value;
	}
	return out;
}

function requireText(value: string, label: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new UserError(`${label} is empty`);
	}
	return value;
}

const INVALID_JSON = Symbol('invalid-json');

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return INVALID_JSON;
	}
}

/**
 * The template data parameter arrives as a JSON string when typed into the
 * field, or as an object when it comes from an expression.
 */
export function parseTemplateData(value: unknown): IDataObject {
	if (value === undefined || value === null || value === '') return {};
	let parsed: unknown = value;
	if (typeof value === 'string') {
		parsed = parseJson(value);
		if (parsed === INVALID_JSON) throw new UserError('Template data is not valid JSON');
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new UserError('Template data must be a JSON object, for example {"name": "Ada"}');
	}
	return parsed as IDataObject;
}

export function buildMarkdownToPdf(markdown: string, options: MarkdownOptions): ApiRequest {
	const body: IDataObject = { markdown: requireText(markdown, 'Markdown') };
	const opts = compact({ ...options });
	if (Object.keys(opts).length > 0) body.options = opts;
	return { method: 'POST', path: '/api/v1/md', body, expectsPdf: true };
}

/**
 * The server falls back to the template's sample data only when `data` is
 * absent, so an empty object is left out rather than sent.
 */
function addData(body: IDataObject, data: IDataObject): void {
	if (Object.keys(data).length > 0) body.data = data;
}

export function buildRenderTemplate(
	templateId: string,
	data: IDataObject,
	title?: string,
): ApiRequest {
	const body: IDataObject = { templateId: requireText(templateId, 'Template ID').trim() };
	addData(body, data);
	const opts = compact({ title });
	if (Object.keys(opts).length > 0) body.options = opts;
	return { method: 'POST', path: '/api/v1/render', body, expectsPdf: true };
}

export function buildRenderDsl(dsl: string, data: IDataObject, title?: string): ApiRequest {
	const body: IDataObject = { dsl: requireText(dsl, 'Template script') };
	addData(body, data);
	const opts = compact({ title });
	if (Object.keys(opts).length > 0) body.options = opts;
	return { method: 'POST', path: '/api/v1/render', body, expectsPdf: true };
}

export function buildListTemplates(
	filters: TemplateFilters,
	limit: number,
	offset: number,
): ApiRequest {
	const qs = compact({
		owner: filters.owner,
		category: filters.category,
		tags: filters.tags,
		q: filters.search,
	});
	qs.limit = Math.max(1, Math.min(TEMPLATE_PAGE_SIZE, Math.floor(limit)));
	qs.offset = Math.max(0, Math.floor(offset));
	return { method: 'GET', path: '/api/v1/templates', qs, expectsPdf: false };
}

export function buildValidateMarkdown(markdown: string): ApiRequest {
	return {
		method: 'POST',
		path: '/api/v1/md/validate',
		body: { markdown: requireText(markdown, 'Markdown') },
		expectsPdf: false,
	};
}

/** A safe `.pdf` file name from the user's choice, else the title, else `document.pdf`. */
export function pdfFileName(fileName?: string, title?: string): string {
	const chosen = (fileName ?? '').trim() || (title ?? '').trim() || 'document';
	const stem = Array.from(chosen.replace(/\.pdf$/i, ''), (ch) =>
		ch.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(ch) ? '-' : ch,
	)
		.join('')
		.replace(/-+/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
	return `${stem || 'document'}.pdf`;
}

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	const wanted = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}

function headerInt(headers: Headers | undefined, name: string): number | undefined {
	const value = header(headers, name);
	if (value === undefined) return undefined;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : undefined;
}

/** The JSON half of a PDF item, read from the response headers. */
export function pdfResultJson(fileName: string, sizeBytes: number, headers?: Headers): IDataObject {
	return compact({
		fileName,
		sizeBytes,
		pageCount: headerInt(headers, 'x-pages'),
		artifactId: header(headers, 'x-artifact-id'),
		creditsDeducted: headerInt(headers, 'x-credits-deducted'),
		creditsRemaining: headerInt(headers, 'x-credits-remaining'),
	});
}

/** Response bodies arrive as an object, a string, or raw bytes (PDF requests). */
export function decodeBody(body: unknown): unknown {
	let text: string | undefined;
	if (typeof body === 'string') text = body;
	else if (body instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(body));
	else if (ArrayBuffer.isView(body)) {
		text = new TextDecoder().decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
	}
	if (text === undefined) return body;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export interface ApiErrorInfo {
	message: string;
	description?: string;
}

/** Turn a non-2xx makesPDF response into a message the user can act on. */
export function describeApiError(
	statusCode: number,
	body: unknown,
	headers?: Headers,
): ApiErrorInfo {
	const decoded = decodeBody(body);
	const obj =
		decoded && typeof decoded === 'object' && !Array.isArray(decoded)
			? (decoded as IDataObject)
			: undefined;
	const serverMessage =
		typeof obj?.error === 'string' && obj.error.trim() !== ''
			? obj.error.trim()
			: typeof decoded === 'string' && decoded.trim() !== '' && decoded.length <= 300
				? decoded.trim()
				: undefined;

	const notes: string[] = [];
	if (typeof obj?.hint === 'string') notes.push(obj.hint);
	if (Array.isArray(obj?.details)) {
		for (const detail of obj.details) if (typeof detail === 'string') notes.push(detail);
	}
	if (Array.isArray(obj?.issues)) {
		for (const issue of obj.issues) {
			const item = issue as IDataObject;
			if (typeof item?.message === 'string') {
				notes.push(typeof item.path === 'string' ? `${item.path}: ${item.message}` : item.message);
			}
		}
	}

	let message: string;
	switch (statusCode) {
		case 401:
			message = 'The makesPDF API key was rejected';
			notes.unshift('Check the API key in the makesPDF credential.');
			break;
		case 402:
			message = 'Not enough makesPDF credits for this render';
			notes.unshift('Top up at https://makespdf.com/pricing.');
			break;
		case 404:
			message = serverMessage ?? 'Not found';
			break;
		case 429: {
			message = 'makesPDF rate limit reached';
			const retry = header(headers, 'retry-after');
			if (retry) notes.unshift(`Retry after ${retry} seconds.`);
			break;
		}
		default:
			message = serverMessage ?? `makesPDF returned HTTP ${statusCode}`;
	}
	if (serverMessage && serverMessage !== message && statusCode !== 404) {
		notes.unshift(serverMessage);
	}
	if (typeof obj?.docs === 'string') notes.push(`Docs: ${obj.docs}`);

	return notes.length > 0 ? { message, description: notes.join('\n') } : { message };
}
