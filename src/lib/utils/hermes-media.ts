type RewriteHermesMediaOptions = {
	done?: boolean;
};

type Fence = {
	marker: '`' | '~';
	length: number;
};

const SUPPORTED_IMAGE_PATH = /\.(?:png|jpe?g|gif|webp)$/i;

export const rewriteHermesMediaDirectives = (
	content: string,
	{ done = true }: RewriteHermesMediaOptions = {}
) => {
	let fence: Fence | null = null;
	const lines = content.split('\n');

	return lines
		.map((line, index) => {
			if (fence !== null) {
				const indented = /^( {0,3})(.*)$/.exec(line);
				const body = indented?.[2] ?? line;
				const markerRun = fence.marker === '`' ? /^`+/.exec(body) : /^~+/.exec(body);
				if (
					markerRun &&
					markerRun[0].length >= fence.length &&
					body.slice(markerRun[0].length).trim() === ''
				) {
					fence = null;
				}
				return line;
			}

			const openingFence = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
			if (openingFence) {
				const marker = openingFence[2][0] as '`' | '~';
				const info = openingFence[3];
				if (!(marker === '`' && info.includes('`'))) {
					fence = { marker, length: openingFence[2].length };
				}
				return line;
			}

			if (!line.startsWith('MEDIA:')) return line;
			if (!done && index === lines.length - 1) return '';

			const path = line.slice('MEDIA:'.length).trim();
			if (!path.startsWith('/') || !SUPPORTED_IMAGE_PATH.test(path)) {
				return '[Local media unavailable]';
			}

			return `![Generated image](/__hermes_media?path=${encodeURIComponent(path)})`;
		})
		.join('\n');
};
