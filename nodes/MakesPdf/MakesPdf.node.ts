import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { version } from '../../package.json';
import { properties } from './properties';
import {
	type ApiRequest,
	type MarkdownOptions,
	type TemplateFilters,
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
	TEMPLATE_PAGE_SIZE,
} from './requests';

const CREDENTIAL = 'makesPdfApi';

interface ApiResponse {
	body: unknown;
	headers: Record<string, string | string[] | undefined>;
	statusCode: number;
}

type RequestContext = IExecuteFunctions | ILoadOptionsFunctions;

async function callApi(
	this: RequestContext,
	request: ApiRequest,
	itemIndex?: number,
): Promise<ApiResponse> {
	const credentials = await this.getCredentials(CREDENTIAL);
	const options: IHttpRequestOptions = {
		method: request.method,
		url: `${normaliseBaseUrl(credentials.baseUrl)}${request.path}`,
		qs: request.qs,
		headers: {
			Accept: request.expectsPdf ? 'application/pdf' : 'application/json',
			'X-MakesPDF-Client': clientHeader(version),
		},
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (request.body) {
		options.body = request.body;
		options.headers!['Content-Type'] = 'application/json';
	}
	if (request.expectsPdf) {
		options.encoding = 'arraybuffer';
	} else {
		options.json = true;
	}

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL,
		options,
	)) as ApiResponse;

	if (response.statusCode < 200 || response.statusCode >= 300) {
		const info = describeApiError(response.statusCode, response.body, response.headers);
		throw new NodeApiError(this.getNode(), { message: info.message } as JsonObject, {
			itemIndex,
			message: info.message,
			description: info.description,
			httpCode: String(response.statusCode),
		});
	}
	return response;
}

function toBuffer(body: unknown): Buffer | undefined {
	if (Buffer.isBuffer(body)) return body;
	if (body instanceof ArrayBuffer) return Buffer.from(body);
	if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	return undefined;
}

async function listTemplatePage(
	this: RequestContext,
	filters: TemplateFilters,
	limit: number,
	offset: number,
	itemIndex?: number,
): Promise<{ templates: IDataObject[]; total: number }> {
	const response = await callApi.call(this, buildListTemplates(filters, limit, offset), itemIndex);
	const body = (response.body ?? {}) as IDataObject;
	const templates = Array.isArray(body.templates) ? (body.templates as IDataObject[]) : [];
	const total = typeof body.total === 'number' ? body.total : templates.length;
	return { templates, total };
}

export class MakesPdf implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'makesPDF',
		name: 'makesPdf',
		icon: { light: 'file:makespdf.svg', dark: 'file:makespdf.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create accessible PDFs from markdown or templates with makesPDF',
		defaults: {
			name: 'makesPDF',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL,
				required: true,
			},
		],
		properties,
	};

	methods = {
		listSearch: {
			async searchTemplates(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const offset = paginationToken ? Number.parseInt(paginationToken, 10) || 0 : 0;
				const { templates, total } = await listTemplatePage.call(
					this,
					{ owner: 'all', search: filter },
					TEMPLATE_PAGE_SIZE,
					offset,
				);
				const next = offset + templates.length;
				return {
					results: templates.map((template) => ({
						name:
							template.ownerUserId === null
								? `${String(template.name)} (library)`
								: String(template.name),
						value: String(template.templateId),
						description:
							typeof template.description === 'string' ? template.description : undefined,
					})),
					paginationToken: next < total && templates.length > 0 ? String(next) : undefined,
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'pdf') {
					let request: ApiRequest;
					let title: string | undefined;
					if (operation === 'fromMarkdown') {
						const options = this.getNodeParameter('markdownOptions', i, {}) as MarkdownOptions;
						title = options.title;
						request = buildMarkdownToPdf(this.getNodeParameter('markdown', i) as string, options);
					} else {
						const data = parseTemplateData(this.getNodeParameter('data', i, '{}'));
						const options = this.getNodeParameter('renderOptions', i, {}) as { title?: string };
						title = options.title;
						request =
							operation === 'fromTemplate'
								? buildRenderTemplate(
										this.getNodeParameter('templateId', i, '', { extractValue: true }) as string,
										data,
										title,
									)
								: buildRenderDsl(this.getNodeParameter('dsl', i) as string, data, title);
					}

					const response = await callApi.call(this, request, i);
					const bytes = toBuffer(response.body);
					if (!bytes || bytes.length === 0) {
						throw new NodeOperationError(this.getNode(), 'makesPDF returned no PDF bytes', {
							itemIndex: i,
						});
					}
					const fileName = pdfFileName(this.getNodeParameter('fileName', i, '') as string, title);
					const binaryPropertyName = this.getNodeParameter(
						'binaryPropertyName',
						i,
						'data',
					) as string;
					const binary = await this.helpers.prepareBinaryData(bytes, fileName, 'application/pdf');
					returnData.push({
						json: pdfResultJson(fileName, bytes.length, response.headers),
						binary: { [binaryPropertyName]: binary },
						pairedItem: { item: i },
					});
				} else if (resource === 'template' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i, 50) as number);
					const filters = this.getNodeParameter('filters', i, {}) as TemplateFilters;
					let offset = 0;
					for (;;) {
						const pageSize = Math.min(TEMPLATE_PAGE_SIZE, limit - offset);
						const { templates, total } = await listTemplatePage.call(
							this,
							filters,
							pageSize,
							offset,
							i,
						);
						for (const template of templates) {
							returnData.push({ json: template, pairedItem: { item: i } });
						}
						offset += templates.length;
						if (templates.length === 0 || offset >= total || offset >= limit) break;
					}
				} else if (resource === 'markdown' && operation === 'validate') {
					const response = await callApi.call(
						this,
						buildValidateMarkdown(this.getNodeParameter('markdown', i) as string),
						i,
					);
					returnData.push({ json: response.body as IDataObject, pairedItem: { item: i } });
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation "${operation}" for resource "${resource}"`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors hand back an error of their own type unchanged, so an
				// API error keeps its status code and description.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
