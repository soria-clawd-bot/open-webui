export const isHermesMediaPath = (src: string) => src.startsWith('/__hermes_media?');

export const fetchHermesMediaBlob = async (
	src: string,
	token: string | undefined,
	fetcher: typeof fetch = fetch
) => {
	if (!isHermesMediaPath(src)) return null;

	const response = await fetcher(src, {
		credentials: 'same-origin',
		headers: token ? { authorization: `Bearer ${token}` } : {}
	});
	if (!response.ok) throw new Error(`Hermes media request failed with ${response.status}`);
	if (!response.headers.get('content-type')?.startsWith('image/')) {
		throw new Error('Hermes media response was not an image');
	}

	return response.blob();
};
