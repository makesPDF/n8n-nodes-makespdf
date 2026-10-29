import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MakesPdfApi implements ICredentialType {
	name = 'makesPdfApi';

	displayName = 'makesPDF API';

	icon: Icon = {
		light: 'file:../nodes/MakesPdf/makespdf.svg',
		dark: 'file:../nodes/MakesPdf/makespdf.dark.svg',
	};

	documentationUrl = 'https://github.com/makesPDF/n8n-nodes-makespdf#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create a key at https://makespdf.com/settings/api-keys',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://makespdf.com',
			description: 'Leave as is unless you were given a different makesPDF environment',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Listing your own recent renders needs a valid key and costs nothing.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{($credentials.baseUrl || "https://makespdf.com").replace(/\\/+$/, "")}}',
			url: '/api/v1/artifacts',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
