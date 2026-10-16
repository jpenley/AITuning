from __future__ import annotations

import argparse
import io
import os
from pathlib import Path
from typing import Any

from fastmcp import FastMCP
from fastmcp.utilities.types import Image
from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont, ImageOps

mcp = FastMCP(
    "image-zoom",
    instructions=(
        "Inspect large or dense images (technical drawings, schematics, screenshots) at full "
        "resolution. Start with image_overview to see the whole image with a coordinate grid, "
        "then call image_crop or image_tile on the region you need. All coordinates are pixels "
        "in the ORIGINAL image."
    ),
)

# Long edge of any image sent back to the model. 1568 px is the size Claude models see
# without further downscaling; raise it for models that accept larger images.
MAX_SIDE = int(os.getenv("IMAGE_ZOOM_MAX_SIDE", "1568"))
# Payload above this switches from PNG to JPEG so clients with small tool-result limits cope.
MAX_PNG_BYTES = int(os.getenv("IMAGE_ZOOM_MAX_PNG_BYTES", str(900_000)))
MAX_UPSCALE = 4.0

# Engineering drawings and scans routinely exceed Pillow's decompression-bomb default.
PILImage.MAX_IMAGE_PIXELS = int(os.getenv("IMAGE_ZOOM_MAX_PIXELS", str(600_000_000)))

# Every tool only reads a local file and returns the same result for the same arguments, so hosts
# may auto-approve and retry them.
READ_ONLY = {"readOnlyHint": True, "idempotentHint": True, "openWorldHint": False}


def _open(path: str) -> PILImage.Image:
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise ValueError(f"File not found: {p}")
    img = PILImage.open(p)
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA", "L"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    return img


def _fit(img: PILImage.Image, max_side: int, allow_upscale: bool) -> tuple[PILImage.Image, float]:
    long_side = max(img.size)
    scale = max_side / long_side
    if scale >= 1 and not allow_upscale:
        return img, 1.0
    scale = min(scale, MAX_UPSCALE)
    if abs(scale - 1) < 1e-3:
        return img, 1.0
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    resample = PILImage.Resampling.LANCZOS if scale < 1 else PILImage.Resampling.BICUBIC
    return img.resize(size, resample), scale


def _encode(img: PILImage.Image) -> Image:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    if buf.tell() <= MAX_PNG_BYTES:
        return Image(data=buf.getvalue(), format="png")
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return Image(data=buf.getvalue(), format="jpeg")


def _font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _clamp_box(img: PILImage.Image, x: int, y: int, width: int, height: int) -> tuple[int, int, int, int]:
    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    left = max(0, min(x, img.width - 1))
    top = max(0, min(y, img.height - 1))
    right = max(left + 1, min(x + width, img.width))
    bottom = max(top + 1, min(y + height, img.height))
    return left, top, right, bottom


@mcp.tool(annotations=READ_ONLY)
def image_info(path: str) -> dict[str, Any]:
    """Return pixel dimensions, mode and format of an image file without sending the image."""
    p = Path(path).expanduser().resolve()
    with PILImage.open(p) as raw:
        fmt = raw.format
        img = ImageOps.exif_transpose(raw)
        return {
            "path": str(p),
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "format": fmt,
            "file_bytes": p.stat().st_size,
            "max_side_returned": MAX_SIDE,
            "downscaled_in_overview": max(img.size) > MAX_SIDE,
        }


@mcp.tool(output_schema=None, annotations=READ_ONLY)
def image_overview(path: str, grid: int = 8, max_side: int = 0) -> list[Any]:
    """Whole image, downscaled to fit, with a labelled grid in ORIGINAL pixel coordinates.

    Use this first to locate the region of interest, then image_crop it. grid is the number of
    divisions along the long edge (0 disables the grid). max_side 0 uses the server default.
    """
    img = _open(path)
    view, scale = _fit(img, max_side or MAX_SIDE, allow_upscale=False)
    view = view.convert("RGB")
    if grid > 0:
        draw = ImageDraw.Draw(view)
        font = _font(max(12, max(view.size) // 90))
        step = max(img.size) / grid
        for i in range(1, int(img.width / step) + 1):
            ox = round(i * step)
            if ox >= img.width:
                break
            vx = round(ox * scale)
            draw.line([(vx, 0), (vx, view.height)], fill=(255, 0, 255), width=1)
            draw.text((vx + 3, 3), str(ox), fill=(255, 0, 255), font=font, stroke_width=2, stroke_fill="white")
        for i in range(1, int(img.height / step) + 1):
            oy = round(i * step)
            if oy >= img.height:
                break
            vy = round(oy * scale)
            draw.line([(0, vy), (view.width, vy)], fill=(255, 0, 255), width=1)
            draw.text((3, vy + 3), str(oy), fill=(255, 0, 255), font=font, stroke_width=2, stroke_fill="white")
    caption = (
        f"Overview of {Path(path).name}: original {img.width}x{img.height}px, shown at "
        f"{view.width}x{view.height}px (scale {scale:.3f}). Grid labels are ORIGINAL pixel coordinates."
    )
    return [caption, _encode(view)]


@mcp.tool(output_schema=None, annotations=READ_ONLY)
def image_crop(path: str, x: int, y: int, width: int, height: int, upscale: bool = True, max_side: int = 0) -> list[Any]:
    """Crop a region (ORIGINAL pixel coordinates) at full resolution and return it.

    Regions larger than max_side are downscaled; small regions are enlarged (up to 4x) when
    upscale is true, which helps with tiny text. max_side 0 uses the server default.
    """
    img = _open(path)
    box = _clamp_box(img, x, y, width, height)
    region, scale = _fit(img.crop(box), max_side or MAX_SIDE, allow_upscale=upscale)
    caption = (
        f"Crop of {Path(path).name} at x={box[0]}..{box[2]}, y={box[1]}..{box[3]} "
        f"({box[2] - box[0]}x{box[3] - box[1]}px original), returned at "
        f"{region.width}x{region.height}px (scale {scale:.3f})."
    )
    return [caption, _encode(region)]


@mcp.tool(output_schema=None, annotations=READ_ONLY)
def image_tile(path: str, rows: int, cols: int, row: int, col: int, overlap: float = 0.1, max_side: int = 0) -> list[Any]:
    """Split the image into a rows x cols grid and return one tile (row/col are 0-based).

    Useful for scanning a dense image systematically. overlap (0-0.5) extends each tile into
    its neighbours so text on a boundary is not cut in half.
    """
    if rows < 1 or cols < 1 or not (0 <= row < rows) or not (0 <= col < cols):
        raise ValueError("row/col must be within the rows x cols grid")
    overlap = min(max(overlap, 0.0), 0.5)
    img = _open(path)
    tw, th = img.width / cols, img.height / rows
    pad_x, pad_y = tw * overlap, th * overlap
    left = round(max(0, col * tw - pad_x))
    top = round(max(0, row * th - pad_y))
    right = round(min(img.width, (col + 1) * tw + pad_x))
    bottom = round(min(img.height, (row + 1) * th + pad_y))
    region, scale = _fit(img.crop((left, top, right, bottom)), max_side or MAX_SIDE, allow_upscale=True)
    caption = (
        f"Tile r{row} c{col} of {rows}x{cols} from {Path(path).name}: x={left}..{right}, y={top}..{bottom} "
        f"original, returned at {region.width}x{region.height}px (scale {scale:.3f})."
    )
    return [caption, _encode(region)]


def _selftest() -> int:
    import tempfile

    failures: list[str] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        print(f"{'ok  ' if ok else 'FAIL'} {name}{': ' + detail if detail and not ok else ''}")
        if not ok:
            failures.append(name)

    def size(result: list[Any]) -> tuple[int, int]:
        with PILImage.open(io.BytesIO(result[1].data)) as shown:
            return shown.size

    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "wide.png")
        # 4000x1000 with a red block at x=3000..3100, y=500..600: large enough to be downscaled.
        img = PILImage.new("RGB", (4000, 1000), "white")
        ImageDraw.Draw(img).rectangle([3000, 500, 3099, 599], fill=(255, 0, 0))
        img.save(path)

        for tool in (image_info, image_overview, image_crop, image_tile):
            hints = tool.annotations
            check(
                f"{tool.name} is marked read-only and idempotent",
                hints is not None and hints.readOnlyHint is True and hints.idempotentHint is True,
                str(hints),
            )

        info = image_info.fn(path)
        check("info reports original size", (info["width"], info["height"]) == (4000, 1000), str(info))
        check("info flags downscaling", info["downscaled_in_overview"] is True)

        overview = image_overview.fn(path)
        check("overview fits max side", max(size(overview)) == MAX_SIDE, str(size(overview)))
        check("overview caption gives original size", "original 4000x1000px" in overview[0], overview[0])

        crop = image_crop.fn(path, 3000, 500, 100, 100)
        check("small crop upscales at most 4x", size(crop) == (400, 400), str(size(crop)))
        with PILImage.open(io.BytesIO(crop[1].data)) as shown:
            check("crop lands on original coordinates", shown.convert("RGB").getpixel((200, 200)) == (255, 0, 0))

        edge = image_crop.fn(path, 3950, 950, 500, 500, upscale=False)
        check("crop clamps to the image", "x=3950..4000, y=950..1000" in edge[0], edge[0])

        tile = image_tile.fn(path, 1, 4, 0, 3, overlap=0.0)
        check("tile covers its quarter", "x=3000..4000, y=0..1000" in tile[0], tile[0])

        for name, call in [
            ("missing file is rejected", lambda: image_crop.fn(str(Path(tmp) / "none.png"), 0, 0, 1, 1)),
            ("zero-size crop is rejected", lambda: image_crop.fn(path, 0, 0, 0, 10)),
            ("tile outside the grid is rejected", lambda: image_tile.fn(path, 2, 2, 2, 0)),
        ]:
            try:
                call()
                check(name, False, "no error raised")
            except ValueError:
                check(name, True)

        noisy = str(Path(tmp) / "noisy.png")
        PILImage.frombytes("RGB", (1500, 1500), os.urandom(1500 * 1500 * 3)).save(noisy)
        check("large payload falls back to JPEG", image_crop.fn(noisy, 0, 0, 1500, 1500)[1]._format == "jpeg")

    print(f"FAILED: {len(failures)} check(s)" if failures else "passed")
    return 1 if failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--transport", choices=["stdio", "http"], default=os.getenv("MCP_TRANSPORT", "stdio"))
    parser.add_argument("--host", default=os.getenv("MCP_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("MCP_PORT", "8766")))
    parser.add_argument("--selftest", action="store_true", help="check the tools against generated images and exit")
    args = parser.parse_args()

    if args.selftest:
        raise SystemExit(_selftest())
    if args.transport == "http":
        mcp.run(transport="http", host=args.host, port=args.port)
    else:
        mcp.run(show_banner=False)
