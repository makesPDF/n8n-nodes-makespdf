import type { INodeProperties } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import invoiceFromOrder from '../examples/invoice-from-order.json';
import markdownReport from '../examples/markdown-report.json';
import { name as packageName } from '../package.json';
import { properties } from '../nodes/MakesPdf/properties';

interface WorkflowNode {
	name: string;
	type: string;
	parameters: Record<string, unknown>;
}

interface Workflow {
	nodes: WorkflowNode[];
	connections: Record<string, { main: Array<Array<{ node: string }>> }>;
}

// Add each new file in examples/ here.
const examples: Array<[string, Workflow]> = [
	['invoice-from-order.json', invoiceFromOrder as Workflow],
	['markdown-report.json', markdownReport as Workflow],
];
const nodeType = `${packageName}.makesPdf`;

function shown(property: INodeProperties, parameters: Record<string, unknown>): boolean {
	const show = property.displayOptions?.show ?? {};
	return Object.entries(show).every(([key, values]) =>
		(values as unknown[]).includes(parameters[key]),
	);
}

function optionValues(property: INodeProperties): unknown[] {
	return (property.options ?? []).map((option) => ('value' in option ? option.value : option.name));
}

describe('example workflows', () => {
	describe.each(examples)('%s', (_file, workflow) => {
		const nodeNames = new Set(workflow.nodes.map((node) => node.name));
		const makesPdfNodes = workflow.nodes.filter((node) => node.type === nodeType);

		it('uses the makesPDF node', () => {
			expect(makesPdfNodes.length).toBeGreaterThan(0);
		});

		it('connects only nodes that exist', () => {
			for (const [from, outputs] of Object.entries(workflow.connections)) {
				expect(nodeNames).toContain(from);
				for (const target of outputs.main.flat()) expect(nodeNames).toContain(target.node);
			}
		});

		it.each(makesPdfNodes.map((node) => [node.name, node] as const))(
			'%s sets only parameters the node shows',
			(_name, node) => {
				const visible = properties.filter((property) => shown(property, node.parameters));
				for (const [key, value] of Object.entries(node.parameters)) {
					const matches = visible.filter((property) => property.name === key);
					expect(matches, `parameter "${key}"`).not.toHaveLength(0);
					const property = matches[0];
					if (property.type === 'options') {
						expect(optionValues(property), `value of "${key}"`).toContain(value);
					}
					if (property.type === 'collection') {
						const allowed = (property.options ?? []).map((option) => option.name);
						for (const option of Object.keys(value as object)) {
							expect(allowed, `option "${key}.${option}"`).toContain(option);
						}
					}
				}
			},
		);
	});
});
