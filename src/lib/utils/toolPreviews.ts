export type SafeToolArguments = {
	preview: string;
	display: string;
	parsed: Record<string, unknown> | null;
};

const REDACTED = '[redacted]';
const SENSITIVE_PATH = '[sensitive path]';
const PREVIEW_KEYS = ['command', 'cmd', 'path', 'file_path', 'query', 'pattern', 'url', 'skill'];
const SENSITIVE_KEY_PATTERN =
	/(?:^|[_-])(api[_-]?key|token|secret|password|passwd|authorization|cookie|credential)(?:$|[_-])/i;
const SENSITIVE_PATH_PATTERN =
	/(^|\/)[^/]*(?:secret|credential)[^/]*(\/|$)|(^|\/)\.env(?:\.|\/|$)/i;

function parseJSONString(value: string): unknown {
	let parsed: unknown = value;
	for (let depth = 0; depth < 4 && typeof parsed === 'string'; depth += 1) {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			break;
		}
	}
	return parsed;
}

function isSensitiveKey(key: string): boolean {
	const normalized = key
		.trim()
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.toLowerCase();
	return SENSITIVE_KEY_PATTERN.test(`_${normalized}_`);
}

function redactInlineSecrets(value: string): string {
	let safe = value.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, `$1${REDACTED}`);
	safe = safe.replace(
		/(\b(?:api[_-]?key|token|secret|password|passwd|authorization|cookie|credential)\b\s*(?:=|:)\s*)(["']?)([^\s"'&]+)/gi,
		`$1$2${REDACTED}`
	);
	safe = safe.replace(
		/(--?(?:api[_-]?key|token|secret|password|passwd|authorization|cookie|credential)\s+)(["']?)([^\s"']+)/gi,
		`$1$2${REDACTED}`
	);
	return safe;
}

function sanitizeString(key: string, value: string): string {
	if ((key === 'path' || key === 'file_path') && SENSITIVE_PATH_PATTERN.test(value)) {
		return SENSITIVE_PATH;
	}

	let safe = redactInlineSecrets(value);
	if (/^https?:\/\//i.test(safe)) {
		try {
			const url = new URL(safe);
			for (const queryKey of [...url.searchParams.keys()]) {
				if (isSensitiveKey(queryKey)) url.searchParams.set(queryKey, REDACTED);
			}
			safe = url.toString();
		} catch {
			// Keep the already-redacted string when it is not a valid URL.
		}
	}
	return safe;
}

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
	if (isSensitiveKey(key)) return REDACTED;
	if (depth >= 8) return '[nested value]';
	if (typeof value === 'string') return sanitizeString(key, value);
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeValue('', item, depth + 1));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
				nestedKey,
				sanitizeValue(nestedKey, nestedValue, depth + 1)
			])
		);
	}
	return value;
}

function scalarPreview(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value).replace(/\s+/g, ' ').trim();
	}
	return '';
}

function clipPreview(value: string): string {
	return value.length > 240 ? `${value.slice(0, 239)}…` : value;
}

export function buildSafeToolArguments(raw: string): SafeToolArguments {
	const decoded = parseJSONString(raw);
	if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
		const display = sanitizeString(
			'',
			typeof decoded === 'string' ? decoded : String(decoded ?? '')
		);
		return { preview: clipPreview(display.replace(/\s+/g, ' ').trim()), display, parsed: null };
	}

	const parsed = sanitizeValue('', decoded) as Record<string, unknown>;
	let preview = '';
	for (const key of PREVIEW_KEYS) {
		preview = scalarPreview(parsed[key]);
		if (preview) break;
	}
	if (!preview) {
		for (const value of Object.values(parsed)) {
			preview = scalarPreview(value);
			if (preview) break;
		}
	}

	return {
		preview: clipPreview(preview),
		display: JSON.stringify(parsed),
		parsed
	};
}
