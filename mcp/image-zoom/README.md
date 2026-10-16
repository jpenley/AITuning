# Image zoom

An MCP server for inspecting large or dense images at their original resolution.
Use an overview to find a region, then crop or tile it to read the details.

| Tool | Result |
|---|---|
| `image_info` | Image size, mode, and format |
| `image_overview` | An overview with a grid labelled in original pixel coordinates |
| `image_crop` | A region at full resolution, with small regions enlarged up to 4x |
| `image_tile` | One tile of a grid, overlapping neighboring tiles |

All coordinates refer to pixels in the original image. The server reads local
files accessible to its process. It does not upload or modify the source image;
returned image content is passed to the MCP client and its model provider.

## Run

Install Python 3.12 or later and [uv](https://docs.astral.sh/uv/). From the repository root:

```text
uv run --locked --project mcp/image-zoom python mcp/image-zoom/server.py
```

This starts the stdio transport. Dependencies are pinned in `uv.lock`.
The first run creates a local environment and downloads the locked dependencies.
`--locked` refuses to change the lockfile if it differs from the project metadata.

Configure a client that accepts MCP stdio servers with these values, replacing
`/absolute/path/AITuning` with the location of your clone:

```json
{
  "command": "uv",
  "args": [
    "run", "--locked", "--project", "/absolute/path/AITuning/mcp/image-zoom",
    "python", "/absolute/path/AITuning/mcp/image-zoom/server.py"
  ]
}
```

The surrounding configuration format depends on your MCP client. On Windows,
use forward slashes or escaped backslashes in JSON paths.

## Check the tools

The built-in self-test generates temporary images, checks the four tools and
invalid inputs, and exits without starting a server:

```text
uv run --locked --project mcp/image-zoom python mcp/image-zoom/server.py --selftest
```

## Settings

| Variable | Default | Effect |
|---|---|---|
| `IMAGE_ZOOM_MAX_SIDE` | 1568 | Maximum long edge of a returned image |
| `IMAGE_ZOOM_MAX_PNG_BYTES` | 900000 | Larger payloads use JPEG |
| `IMAGE_ZOOM_MAX_PIXELS` | 600000000 | Pillow image size limit for large scans |

The default transport is stdio. For a local HTTP client, append
`--transport http --host 127.0.0.1 --port 8766`. Keep the HTTP listener on loopback;
the server has no authentication or file-access sandbox.
