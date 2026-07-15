import { describe, expect, it, vi } from 'vitest';

import { fetchHermesMediaBlob, isHermesMediaPath } from './hermes-media-image';

describe('Hermes media image loading', () => {
	it('recognizes only the authenticated Hermes media route', () => {
		expect(isHermesMediaPath('/__hermes_media?path=%2Fhome%2Fopenclaw%2Ffiles%2Fchart.png')).toBe(
			true
		);
		expect(isHermesMediaPath('/api/v1/files/chart.png')).toBe(false);
	});

	it('fetches media with both the session cookie policy and bearer token', async () => {
		const blob = new Blob(['image'], { type: 'image/png' });
		const fetcher = vi.fn().mockResolvedValue(
			new Response(blob, { status: 200, headers: { 'content-type': 'image/png' } })
		);

		await expect(
			fetchHermesMediaBlob('/__hermes_media?path=%2Fchart.png', 'session-token', fetcher)
		).resolves.toEqual(blob);
		expect(fetcher).toHaveBeenCalledWith('/__hermes_media?path=%2Fchart.png', {
			credentials: 'same-origin',
			headers: { authorization: 'Bearer session-token' }
		});
	});

	it('rejects non-image responses', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
		);

		await expect(
			fetchHermesMediaBlob('/__hermes_media?path=%2Fmissing.png', undefined, fetcher)
		).rejects.toThrow('Hermes media request failed with 404');
	});
});
