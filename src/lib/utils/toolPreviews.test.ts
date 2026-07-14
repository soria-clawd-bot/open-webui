import { describe, expect, it } from 'vitest';

import { buildSafeToolArguments } from './toolPreviews';

describe('safe tool argument previews', () => {
	it('hides sensitive paths', () => {
		const safe = buildSafeToolArguments(
			JSON.stringify({ path: '/home/openclaw/.config/soria-secrets/runtime.env' })
		);
		expect(safe.preview).toBe('[sensitive path]');
		expect(safe.display).not.toContain('soria-secrets');
	});

	it('redacts inline command credentials', () => {
		const safe = buildSafeToolArguments(
			JSON.stringify({ command: 'curl -H "Authorization: Bearer abc123" --token super-secret' })
		);
		expect(safe.preview).not.toContain('abc123');
		expect(safe.preview).not.toContain('super-secret');
		expect(safe.preview).toContain('[redacted]');
	});

	it('redacts nested secret keys in expanded argument data', () => {
		const safe = buildSafeToolArguments(
			JSON.stringify({ query: 'status', config: { apiKey: 'sk-live-value', password: 'hunter2' } })
		);
		expect(safe.parsed).toEqual({
			query: 'status',
			config: { apiKey: '[redacted]', password: '[redacted]' }
		});
		expect(safe.display).not.toContain('sk-live-value');
		expect(safe.display).not.toContain('hunter2');
	});

	it('redacts credential-bearing URL query parameters', () => {
		const safe = buildSafeToolArguments(
			JSON.stringify({ url: 'https://example.com/data?token=abc123&page=2' })
		);
		expect(safe.preview).not.toContain('abc123');
		expect(safe.preview).toContain('page=2');
	});

	it('keeps ordinary previews useful', () => {
		const safe = buildSafeToolArguments(JSON.stringify({ query: 'quarterly hospital margins' }));
		expect(safe.preview).toBe('quarterly hospital margins');
	});
});
