<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext, onDestroy } from 'svelte';
	import { WEBUI_BASE_URL } from '$lib/constants';
	import { fetchHermesMediaBlob, isHermesMediaPath } from '$lib/utils/hermes-media-image';
	import { safeImageUrl } from '$lib/utils/safeImageUrl';

	import { settings } from '$lib/stores';
	import ImagePreview from './ImagePreview.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';

	export let src = '';
	export let alt = '';

	export let className = ` w-full ${($settings?.highContrastMode ?? false) ? '' : 'outline-hidden focus:outline-hidden'}`;

	export let imageClassName = 'rounded-lg';

	export let dismissible = false;
	export let onDismiss = () => {};

	const i18n = getContext('i18n');

	let _src = '';
	let hermesMediaObjectUrl: string | null = null;
	let hermesMediaRequest = 0;

	const setImageSource = async (nextSrc: string, token: string | undefined) => {
		const request = ++hermesMediaRequest;
		if (hermesMediaObjectUrl) {
			URL.revokeObjectURL(hermesMediaObjectUrl);
			hermesMediaObjectUrl = null;
		}

		if (!isHermesMediaPath(nextSrc)) {
			_src = safeImageUrl(nextSrc.startsWith('/') ? `${WEBUI_BASE_URL}${nextSrc}` : nextSrc);
			return;
		}

		_src = `${WEBUI_BASE_URL}/favicon.png`;
		try {
			const blob = await fetchHermesMediaBlob(nextSrc, token);
			if (!blob || request !== hermesMediaRequest) return;
			hermesMediaObjectUrl = URL.createObjectURL(blob);
			_src = hermesMediaObjectUrl;
		} catch {
			if (request === hermesMediaRequest) _src = `${WEBUI_BASE_URL}/favicon.png`;
		}
	};

	$: void setImageSource(src, browser ? (localStorage.getItem('token') ?? undefined) : undefined);

	onDestroy(() => {
		hermesMediaRequest++;
		if (hermesMediaObjectUrl) URL.revokeObjectURL(hermesMediaObjectUrl);
	});

	let showImagePreview = false;
</script>

<ImagePreview bind:show={showImagePreview} src={_src} {alt} />

<div class=" relative group w-fit flex items-center">
	<button
		class={className}
		on:click={() => {
			showImagePreview = true;
		}}
		aria-label={$i18n.t('Show image preview')}
		type="button"
	>
		<img src={_src} {alt} class={imageClassName} draggable="false" data-cy="image" />
	</button>

	{#if dismissible}
		<div class=" absolute -top-1 -right-1">
			<button
				aria-label={$i18n.t('Remove image')}
				class=" bg-white text-black border border-white rounded-full group-hover:visible invisible transition"
				type="button"
				on:click={() => {
					onDismiss();
				}}
			>
				<XMark className={'size-4'} />
			</button>
		</div>
	{/if}
</div>
