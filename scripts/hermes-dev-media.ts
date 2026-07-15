import { constants } from 'node:fs';
import { open, readlink, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, sep } from 'node:path';

const IMAGE_CONTENT_TYPES = new Map([
	['.png', 'image/png'],
	['.jpg', 'image/jpeg'],
	['.jpeg', 'image/jpeg'],
	['.gif', 'image/gif'],
	['.webp', 'image/webp']
]);

const detectImageContentType = (header: Buffer) => {
	if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return 'image/png';
	}
	if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
		return 'image/jpeg';
	}
	const sixBytes = header.subarray(0, 6).toString('ascii');
	if (sixBytes === 'GIF87a' || sixBytes === 'GIF89a') return 'image/gif';
	if (
		header.length >= 12 &&
		header.subarray(0, 4).toString('ascii') === 'RIFF' &&
		header.subarray(8, 12).toString('ascii') === 'WEBP'
	) {
		return 'image/webp';
	}
	return null;
};

export const openHermesImage = async (
	requestedPath: string,
	allowedRoots: string[],
	maxBytes = 20 * 1024 * 1024
) => {
	if (!isAbsolute(requestedPath)) throw new Error('image path must be absolute');
	const expectedContentType = IMAGE_CONTENT_TYPES.get(extname(requestedPath).toLowerCase());
	if (!expectedContentType) throw new Error('unsupported image type');

	let handle;
	try {
		handle = await open(requestedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
			throw new Error('symbolic links are not allowed');
		}
		throw error;
	}

	try {
		const descriptorPath = await readlink(`/proc/self/fd/${handle.fd}`);
		const rootResults = await Promise.allSettled(allowedRoots.map((root) => realpath(root)));
		const resolvedRoots = rootResults.flatMap((result) =>
			result.status === 'fulfilled' ? [result.value] : []
		);
		const insideAllowedRoot = resolvedRoots.some((root) => {
			const childPath = relative(root, descriptorPath);
			return childPath !== '..' && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath);
		});
		if (!insideAllowedRoot) throw new Error('outside allowed roots');

		const file = await handle.stat();
		if (!file.isFile()) throw new Error('not a regular file');
		if (file.size > maxBytes) throw new Error('image too large');

		const header = Buffer.alloc(12);
		const { bytesRead } = await handle.read(header, 0, header.length, 0);
		const detectedContentType = detectImageContentType(header.subarray(0, bytesRead));
		if (detectedContentType !== expectedContentType) {
			throw new Error('image content does not match extension');
		}

		return { handle, contentType: detectedContentType, size: file.size };
	} catch (error) {
		await handle.close().catch(() => undefined);
		throw error;
	}
};
