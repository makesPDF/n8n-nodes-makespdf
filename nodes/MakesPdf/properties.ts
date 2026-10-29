import type { INodeProperties } from 'n8n-workflow';

const pdf = { resource: ['pdf'] };
const fromMarkdown = { resource: ['pdf'], operation: ['fromMarkdown'] };
const fromTemplate = { resource: ['pdf'], operation: ['fromTemplate'] };
const fromDsl = { resource: ['pdf'], operation: ['fromDsl'] };
const rendersTemplate = { resource: ['pdf'], operation: ['fromTemplate', 'fromDsl'] };
const getTemplates = { resource: ['template'], operation: ['getAll'] };
const validateMarkdown = { resource: ['markdown'], operation: ['validate'] };

export const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Markdown', value: 'markdown' },
			{ name: 'PDF', value: 'pdf' },
			{ name: 'Template', value: 'template' },
		],
		default: 'pdf',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: pdf },
		options: [
			{
				name: 'Create From Markdown',
				value: 'fromMarkdown',
				description: 'Turn markdown into a tagged, accessible PDF',
				action: 'Create a PDF from markdown',
			},
			{
				name: 'Create From Template',
				value: 'fromTemplate',
				description: 'Fill a saved or library template with data',
				action: 'Create a PDF from a template',
			},
			{
				name: 'Create From Template Script',
				value: 'fromDsl',
				description: 'Render a makesPDF template script with data',
				action: 'Create a PDF from a template script',
			},
		],
		default: 'fromMarkdown',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List library templates and your own',
				action: 'Get many templates',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['markdown'] } },
		options: [
			{
				name: 'Validate',
				value: 'validate',
				description: 'Check markdown for accessibility issues without rendering it',
				action: 'Validate markdown',
			},
		],
		default: 'validate',
	},

	// PDF: from markdown
	{
		displayName: 'Markdown',
		name: 'markdown',
		type: 'string',
		typeOptions: { rows: 10 },
		required: true,
		default: '',
		placeholder: '# Hello\n\nSome **bold** text.',
		description:
			'GitHub-flavoured markdown. Tables, code, images and Mermaid diagrams are supported.',
		displayOptions: { show: fromMarkdown },
	},
	{
		displayName: 'Options',
		name: 'markdownOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: fromMarkdown },
		options: [
			{
				displayName: 'Author',
				name: 'author',
				type: 'string',
				default: '',
				description: 'Written to the PDF metadata',
			},
			{
				displayName: 'Font',
				name: 'fontFamily',
				type: 'options',
				options: [
					{ name: 'Inter', value: 'Inter' },
					{ name: 'Noto Sans', value: 'NotoSans' },
				],
				default: 'Inter',
			},
			{
				displayName: 'Language',
				name: 'lang',
				type: 'string',
				default: '',
				placeholder: 'en',
				description:
					'BCP 47 language tag for the document, for example en, ja or zh-Hant. Also picks the built-in Chinese, Japanese or Korean font.',
			},
			{
				displayName: 'Page Number Position',
				name: 'pageNumberPosition',
				type: 'options',
				options: [
					{ name: 'Center', value: 'center' },
					{ name: 'Left', value: 'left' },
					{ name: 'Right', value: 'right' },
				],
				default: 'right',
				description: 'Where the page number sits in the footer',
			},
			{
				displayName: 'Page Numbers',
				name: 'pageNumbers',
				type: 'options',
				options: [
					{ name: '3', value: 'n' },
					{ name: '3 / 12', value: 'n-of-total' },
					{ name: 'Page 3 of 12', value: 'page-n-of-total' },
				],
				default: 'page-n-of-total',
				description: 'Add page numbers to the footer in this format',
			},
			{
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'options',
				options: [
					{ name: 'A3', value: 'A3' },
					{ name: 'A4', value: 'A4' },
					{ name: 'A5', value: 'A5' },
					{ name: 'Legal', value: 'Legal' },
					{ name: 'Letter', value: 'Letter' },
				],
				default: 'A4',
			},
			{
				displayName: 'Theme',
				name: 'theme',
				type: 'options',
				options: [
					{ name: 'Classic', value: 'default' },
					{ name: 'GitHub', value: 'github' },
				],
				default: 'github',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description:
					'Document title in the PDF metadata. Also names the file when File Name is empty.',
			},
		],
	},

	// PDF: from a template
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		required: true,
		default: { mode: 'list', value: '' },
		description: 'A library template or one of your saved templates',
		displayOptions: { show: fromTemplate },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'invoice-classic',
			},
		],
	},

	// PDF: from a template script
	{
		displayName: 'Template Script',
		name: 'dsl',
		type: 'string',
		typeOptions: { rows: 10 },
		required: true,
		default: '',
		placeholder: 'const template = doc(page(col(s("Hello {{name}}"))));',
		description:
			'A makesPDF template script. Reference: https://makespdf.com/skills/pdf-template-author.md.',
		displayOptions: { show: fromDsl },
	},
	{
		displayName: 'Data',
		name: 'data',
		type: 'json',
		default: '{}',
		description:
			'Values for the template placeholders, as a JSON object. Leave as {} to use the sample data saved with the template.',
		displayOptions: { show: rendersTemplate },
	},
	{
		displayName: 'Options',
		name: 'renderOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: rendersTemplate },
		options: [
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description:
					'Document title in the PDF metadata. Also names the file when File Name is empty.',
			},
		],
	},

	// PDF: output
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the output binary field to put the PDF in',
		displayOptions: { show: pdf },
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: '',
		placeholder: 'invoice.pdf',
		description: 'Defaults to the title, or document.pdf',
		displayOptions: { show: pdf },
	},

	// Template: get many
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: getTemplates },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...getTemplates, returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: getTemplates },
		options: [
			{
				displayName: 'Category',
				name: 'category',
				type: 'string',
				default: '',
				placeholder: 'invoice',
			},
			{
				displayName: 'Owner',
				name: 'owner',
				type: 'options',
				options: [
					{ name: 'All', value: 'all', description: 'Library templates and your own' },
					{ name: 'Library', value: 'library', description: 'The curated makesPDF library' },
					{ name: 'Mine', value: 'mine', description: 'Templates you saved' },
				],
				default: 'all',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Text to match in the template name or description',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'invoice,modern',
				description: 'Comma-separated tags. A template must have all of them.',
			},
		],
	},

	// Markdown: validate
	{
		displayName: 'Markdown',
		name: 'markdown',
		type: 'string',
		typeOptions: { rows: 10 },
		required: true,
		default: '',
		placeholder: '# Hello\n\nSome **bold** text.',
		description: 'Markdown to check for heading order, image alt text and diagram descriptions',
		displayOptions: { show: validateMarkdown },
	},
];
