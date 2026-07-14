import { describe, expect, it } from 'vitest';

import { buildOutputDisplayItems, type OutputItem } from './structuredOutput';

function reasoning(text: string): OutputItem {
	return {
		type: 'reasoning',
		status: 'completed',
		summary: [{ type: 'summary_text', text }]
	};
}

function tool(index: number): OutputItem {
	return {
		type: 'function_call',
		status: 'completed',
		name: 'read_file',
		call_id: `call-${index}`,
		arguments: JSON.stringify({ path: `/tmp/${index}.txt` })
	};
}

describe('structured Responses output', () => {
	it('shows one reasoning milestone for every four raw updates', () => {
		const output: OutputItem[] = [];
		for (let index = 0; index < 9; index += 1) {
			output.push(reasoning(`Update ${index + 1}`), tool(index));
		}
		output.push({ type: 'message', content: [{ type: 'output_text', text: 'Finished.' }] });

		const detailGroup = buildOutputDisplayItems(output, true).find(
			(item) => item.type === 'detail_group'
		);
		expect(detailGroup?.type).toBe('detail_group');
		if (detailGroup?.type !== 'detail_group') throw new Error('expected detail group');

		const milestones = detailGroup.tokens.filter((token) => token.attributes.type === 'reasoning');
		expect(milestones).toHaveLength(3);
		expect(milestones[0].text).toContain('Update 1');
		expect(milestones[0].text).toContain('Update 4');
		expect(milestones[1].text).toContain('Update 5');
		expect(milestones[1].text).toContain('Update 8');
		expect(milestones[2].text).toBe('Update 9');
		expect(milestones.map((token) => token.attributes.updates)).toEqual(['4', '4', '1']);
		expect(
			detailGroup.tokens.filter((token) => token.attributes.type === 'tool_calls')
		).toHaveLength(9);
	});

	it('hides a completed reasoning card that exactly duplicates the final answer', () => {
		const output = [
			reasoning('The answer is 42.'),
			{ type: 'message', content: [{ type: 'output_text', text: '  The answer is 42.\n' }] }
		];

		expect(buildOutputDisplayItems(output, true).map((item) => item.type)).toEqual(['message']);
		expect(buildOutputDisplayItems(output, false).map((item) => item.type)).toEqual([
			'detail_single',
			'message'
		]);
	});
});
