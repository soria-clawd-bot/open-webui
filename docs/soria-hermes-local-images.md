# Hermes local image delivery

Soria's Open WebUI fork renders images created on the Hermes host without publishing them to the internet.

## Response contract

Hermes emits one directive per image on its own line:

```text
MEDIA:/absolute/path/to/image.png
```

The Open WebUI renderer rewrites supported directives outside code fences to an authenticated `/__hermes_media` image URL. Supported formats are PNG, JPEG, GIF, and WebP.

## Server configuration

Set colon-separated allowlisted host paths and an optional byte limit:

```text
HERMES_MEDIA_ROOTS=/home/openclaw/.hermes/generated:/home/openclaw/.hermes/cache/images:/home/openclaw/files
HERMES_MEDIA_MAX_BYTES=20971520
```

The endpoint requires a verified Open WebUI user and validates the opened descriptor, not only the requested pathname. The renderer requests the image with both the same-origin cookie policy and the active Open WebUI bearer token so a stale or absent auth cookie cannot leave a signed-in user's image broken. It rejects files outside the allowlist, final-component symlinks, non-regular files, oversized files, unsupported extensions, and image content whose magic bytes do not match the extension.

For a container deployment, bind-mount every configured root read-only at the same absolute path inside the Open WebUI container and pass both environment variables into the container. The frontend feature alone is insufficient if the backend cannot see the host file.

The hot-reload development service in `scripts/hermes-open-webui-dev.service` uses the same roots and serves media directly from Vite while proxying normal Open WebUI traffic to the live backend. Set `HERMES_DEV_ALLOWED_HOSTS` to a comma-separated list of external staging hostnames so Vite accepts the browser's `Host` header; IP and localhost access retain Vite's defaults.

## Hermes render profile

The Open WebUI connection must send:

```text
X-Hermes-Render-Profile: open-webui-v1
```

Hermes's allowlisted `open-webui-v1` render profile tells the agent to use `MEDIA:` for supported local images it creates or is explicitly asked to return. Do not rely on a generic OpenAI-compatible client prompt to infer this contract.

## Verification

1. Write a real image under an allowlisted root.
2. Confirm an unauthenticated request returns 401.
3. Request `/__hermes_media?path=<url-encoded-absolute-path>` as a verified user.
4. Confirm HTTP 200, the expected image content type, and exact SHA-256 parity with the source.
5. Open a signed-in Open WebUI chat containing the directive and confirm the image renders inline after reload.
