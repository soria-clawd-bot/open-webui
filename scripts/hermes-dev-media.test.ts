import { mkdtemp, mkdir, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openHermesImage } from './hermes-dev-media';

const roots: string[] = [];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const close = async (file: Awaited<ReturnType<typeof openHermesImage>>) => {
	await file.handle.close();
};

afterEach(async () => {
	const { rm } = await import('node:fs/promises');
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async () => {
	const root = await mkdtemp(join(tmpdir(), 'hermes-media-'));
	roots.push(root);
	return root;
};

describe('openHermesImage', () => {
	it('opens and identifies a supported regular image inside an allowed root', async () => {
		const root = await makeRoot();
		const image = join(root, 'chart.png');
		await writeFile(image, PNG);

		const opened = await openHermesImage(image, [join(root, 'missing'), root]);
		try {
			expect(opened.contentType).toBe('image/png');
			expect(opened.size).toBe(PNG.length);
		} finally {
			await close(opened);
		}
	});

	it('rejects paths outside allowed roots and sibling prefix collisions', async () => {
		const root = await makeRoot();
		const sibling = `${root}-other`;
		roots.push(sibling);
		await mkdir(sibling);
		const image = join(sibling, 'chart.png');
		await writeFile(image, PNG);

		await expect(openHermesImage(image, [root])).rejects.toThrow('outside allowed roots');
	});

	it('rejects symlinks even when their targets are inside an allowed root', async () => {
		const root = await makeRoot();
		const image = join(root, 'real.png');
		await writeFile(image, PNG);
		const link = join(root, 'chart.png');
		await symlink(image, link);

		await expect(openHermesImage(link, [root])).rejects.toThrow('symbolic links are not allowed');
	});

	it('validates image magic bytes and the configured size limit', async () => {
		const root = await makeRoot();
		const fakeImage = join(root, 'notes.png');
		const image = join(root, 'chart.png');
		await writeFile(fakeImage, Buffer.from('not an image'));
		await writeFile(image, PNG);

		await expect(openHermesImage(fakeImage, [root])).rejects.toThrow(
			'image content does not match extension'
		);
		await expect(openHermesImage(image, [root], 4)).rejects.toThrow('image too large');
	});

	it('pins validation and reads to the same descriptor when the pathname is replaced', async () => {
		const root = await makeRoot();
		const image = join(root, 'chart.png');
		const original = Buffer.concat([PNG, Buffer.from('original')]);
		await writeFile(image, original);

		const opened = await openHermesImage(image, [root]);
		try {
			await rename(image, join(root, 'original.png'));
			await writeFile(image, Buffer.from('replacement secret'));
			const buffer = Buffer.alloc(original.length);
			await opened.handle.read(buffer, 0, buffer.length, 0);
			expect(buffer).toEqual(original);
		} finally {
			await close(opened);
		}
	});
});
