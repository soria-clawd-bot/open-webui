import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

import { viteStaticCopy } from 'vite-plugin-static-copy';

import { openHermesImage } from './scripts/hermes-dev-media';

const hermesBackendUrl = process.env.HERMES_DEV_BACKEND_URL;
const hermesMediaRoots = (process.env.HERMES_MEDIA_ROOTS ?? '')
	.split(':')
	.map((root) => root.trim())
	.filter(Boolean);
const hermesDevAllowedHosts = (process.env.HERMES_DEV_ALLOWED_HOSTS ?? '')
	.split(',')
	.map((host) => host.trim())
	.filter(Boolean);
const configuredHermesMediaMaxBytes = Number.parseInt(process.env.HERMES_MEDIA_MAX_BYTES ?? '', 10);
const hermesMediaMaxBytes =
	configuredHermesMediaMaxBytes > 0 ? configuredHermesMediaMaxBytes : 20 * 1024 * 1024;

const hermesDevMedia = (): Plugin => ({
	name: 'hermes-dev-media',
	configureServer(server) {
		if (!hermesBackendUrl || hermesMediaRoots.length === 0) return;

		server.middlewares.use('/__hermes_media', async (request, response) => {
			if (!['GET', 'HEAD'].includes(request.method ?? '')) {
				response.statusCode = 405;
				response.end();
				return;
			}

			const cookie = request.headers.cookie;
			if (!cookie) {
				response.statusCode = 401;
				response.end();
				return;
			}

			const authResponse = await fetch(`${hermesBackendUrl}/api/v1/auths/`, {
				headers: { cookie }
			}).catch(() => null);
			const authUser = await authResponse?.json().catch(() => null);
			if (!authResponse?.ok || !['admin', 'user'].includes(authUser?.role)) {
				response.statusCode = authResponse?.ok ? 403 : 401;
				response.end();
				return;
			}

			try {
				const url = new URL(request.url ?? '/', 'http://localhost');
				const requestedPath = url.searchParams.get('path') ?? '';
				const image = await openHermesImage(requestedPath, hermesMediaRoots, hermesMediaMaxBytes);

				response.statusCode = 200;
				response.setHeader('Content-Type', image.contentType);
				response.setHeader('Content-Length', image.size);
				response.setHeader('Cache-Control', 'private, no-store');
				response.setHeader('X-Content-Type-Options', 'nosniff');
				if (request.method === 'HEAD') {
					await image.handle.close();
					response.end();
					return;
				}

				const stream = image.handle.createReadStream({ autoClose: true });
				stream.once('error', () => {
					if (!response.headersSent) {
						response.statusCode = 404;
						response.end();
					} else {
						response.destroy();
					}
				});
				response.once('close', () => stream.destroy());
				stream.pipe(response);
			} catch {
				response.statusCode = 404;
				response.end();
			}
		});
	}
});

const proxyTarget = hermesBackendUrl
	? Object.fromEntries(
			['/api', '/openai', '/ollama', '/ws', '/oauth'].map((path) => [
				path,
				{
					target: hermesBackendUrl,
					changeOrigin: true,
					ws: path === '/ws'
				}
			])
		)
	: undefined;

export default defineConfig({
	plugins: [
		sveltekit(),
		hermesDevMedia(),
		viteStaticCopy({
			targets: [
				{
					src: 'node_modules/onnxruntime-web/dist/*.jsep.*',

					dest: 'wasm'
				}
			]
		})
	],
	define: {
		APP_VERSION: JSON.stringify(process.env.npm_package_version),
		APP_BUILD_HASH: JSON.stringify(process.env.APP_BUILD_HASH || 'dev-build')
	},
	server: {
		...(hermesDevAllowedHosts.length > 0 ? { allowedHosts: hermesDevAllowedHosts } : {}),
		proxy: proxyTarget
	},
	build: {
		sourcemap: true
	},
	worker: {
		format: 'es'
	},
	esbuild: {
		pure: process.env.ENV === 'dev' ? [] : ['console.log', 'console.debug', 'console.error']
	}
});
