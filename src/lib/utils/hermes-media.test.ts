import { describe, expect, it } from 'vitest';

import { rewriteHermesMediaDirectives } from './hermes-media';

describe('rewriteHermesMediaDirectives', () => {
	it('renders an absolute local image directive through the UI media endpoint', () => {
		expect(
			rewriteHermesMediaDirectives(
				'Chart\nMEDIA:/home/openclaw/.hermes/generated/account activity.png\nAfter'
			)
		).toBe(
			'Chart\n![Generated image](/__hermes_media?path=%2Fhome%2Fopenclaw%2F.hermes%2Fgenerated%2Faccount%20activity.png)\nAfter'
		);
	});

	it('preserves multiple image order and supported image formats', () => {
		expect(
			rewriteHermesMediaDirectives(
				'MEDIA:/home/openclaw/.hermes/generated/one.jpg\nLabel\nMEDIA:/home/openclaw/files/two.webp'
			)
		).toBe(
			'![Generated image](/__hermes_media?path=%2Fhome%2Fopenclaw%2F.hermes%2Fgenerated%2Fone.jpg)\nLabel\n![Generated image](/__hermes_media?path=%2Fhome%2Fopenclaw%2Ffiles%2Ftwo.webp)'
		);
	});

	it('does not expose unsupported or incomplete local paths', () => {
		expect(rewriteHermesMediaDirectives('MEDIA:/etc/passwd')).toBe('[Local media unavailable]');
		expect(
			rewriteHermesMediaDirectives('Working\nMEDIA:/home/openclaw/.hermes/generated/chart.p', {
				done: false
			})
		).toBe('Working\n');
	});

	it('leaves literal directives inside fenced code unchanged', () => {
		const content = '```text\nMEDIA:/home/openclaw/.hermes/generated/example.png\n```';
		expect(rewriteHermesMediaDirectives(content)).toBe(content);
	});

	it('honors opening-fence length and valid closing-fence syntax', () => {
		const content =
			'````text\n```\nMEDIA:/home/openclaw/.hermes/generated/example.png\n````\nMEDIA:/home/openclaw/files/result.png';
		expect(rewriteHermesMediaDirectives(content)).toBe(
			'````text\n```\nMEDIA:/home/openclaw/.hermes/generated/example.png\n````\n![Generated image](/__hermes_media?path=%2Fhome%2Fopenclaw%2Ffiles%2Fresult.png)'
		);
	});

	it('does not treat over-indented or info-bearing fence-like lines as valid fences', () => {
		const overIndented = '    ```text\nMEDIA:/home/openclaw/.hermes/generated/example.png\n    ```';
		expect(rewriteHermesMediaDirectives(overIndented)).toContain(
			'![Generated image](/__hermes_media?path='
		);

		const infoBearingCloser =
			'```text\n``` still code\nMEDIA:/home/openclaw/.hermes/generated/example.png\n```';
		expect(rewriteHermesMediaDirectives(infoBearingCloser)).toBe(infoBearingCloser);
	});
});
