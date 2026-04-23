#!/usr/bin/env python3
"""
Gallery helper — add / list / clean photos on the homepage gallery.

Typical flow:
    ./gallery.py add ~/Pictures/IMG_1234.jpg --at "Kyoto · Japan" --title "Autumn at Nanzen-ji" --caption "Early morning."
    ./gallery.py ingest                 # batch-process every image dropped into ./gallery_inbox/
    ./gallery.py ingest ~/Some/Folder   # or any other folder
    ./gallery.py list
    ./gallery.py clear-placeholders

What `add` does:
    1. Reads EXIF date (falls back to --date / today)
    2. Resizes long edge to 1800px, saves as JPEG q=82, strips EXIF
    3. Copies to assets/gallery/plate-NN.jpg (auto-numbered)
    4. Appends a [[photo]] entry to gallery.md (top = newest, so new entries are inserted after the header)
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
    from PIL.ExifTags import IFD
except ImportError:
    sys.exit("Pillow is required. Install with:  pip3 install --user Pillow")

ROOT = Path(__file__).parent.resolve()
GALLERY_DIR = ROOT / "assets" / "gallery"
GALLERY_MD = ROOT / "gallery.md"
INBOX = ROOT / "gallery_inbox"

MAX_LONG_EDGE = 2400
JPEG_QUALITY = 90
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}


def read_exif_date(path: Path):
    try:
        img = Image.open(path)
        exif = img.getexif()
        if not exif:
            return None
        # DateTimeOriginal lives in the Exif IFD (tag 36867)
        candidates = []
        try:
            exif_ifd = exif.get_ifd(IFD.Exif)
            if exif_ifd.get(36867):
                candidates.append(exif_ifd[36867])
        except Exception:
            pass
        if exif.get(36867):
            candidates.append(exif[36867])
        if exif.get(306):  # DateTime (modification)
            candidates.append(exif[306])
        for raw in candidates:
            try:
                dt = datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
                return dt.strftime("%Y-%m-%d")
            except Exception:
                continue
    except Exception:
        pass
    return None


def next_plate_number():
    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    nums = []
    for p in GALLERY_DIR.glob("plate-*.jpg"):
        m = re.match(r"plate-(\d+)\.jpg$", p.name)
        if m:
            nums.append(int(m.group(1)))
    return (max(nums) if nums else 0) + 1


def process_image(src: Path, dest: Path):
    img = Image.open(src)
    img = ImageOps.exif_transpose(img)  # honor orientation
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    w, h = img.size
    long_edge = max(w, h)
    if long_edge > MAX_LONG_EDGE:
        scale = MAX_LONG_EDGE / long_edge
        img = img.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)
    img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return img.size


def orient_of(size):
    w, h = size
    r = w / h
    if r > 1.1:
        return "landscape"
    if r < 0.9:
        return "portrait"
    return "square"


def format_entry(src_path: str, date: str, location: str, title: str, caption: str, orient: str = "") -> str:
    lines = ["[[photo]]", f"src: {src_path}"]
    lines.append(f"date: {date or ''}")
    if orient:
        lines.append(f"orient: {orient}")
    lines.append(f"location: {location or ''}")
    lines.append(f"title: {title or ''}")
    lines.append(f"caption: {caption or ''}")
    return "\n".join(lines) + "\n"


def append_entry(entry: str):
    existing = GALLERY_MD.read_text(encoding="utf-8") if GALLERY_MD.exists() else ""
    existing = existing.rstrip() + "\n\n"
    GALLERY_MD.write_text(existing + entry, encoding="utf-8")


def cmd_add(args):
    src = Path(args.path).expanduser().resolve()
    if not src.exists():
        sys.exit(f"Image not found: {src}")
    if src.is_dir():
        sys.exit(f"Expected a file, got a directory: {src}")

    plate_num = next_plate_number()
    dest_name = f"plate-{plate_num:02d}.jpg"
    dest = GALLERY_DIR / dest_name

    date = args.date or read_exif_date(src) or datetime.today().strftime("%Y-%m-%d")
    size = process_image(src, dest)
    orient = orient_of(size)

    print(f"✓ Saved {dest.relative_to(ROOT)}  ({size[0]}×{size[1]}, {orient}, {dest.stat().st_size // 1024} KB)")

    entry = format_entry(
        src_path=f"assets/gallery/{dest_name}",
        date=date,
        location=args.at or "",
        title=args.title or "",
        caption=args.caption or "",
        orient=orient,
    )
    append_entry(entry)
    print(f"✓ Appended [[photo]] block to gallery.md  (date: {date})")


def cmd_ingest(args):
    src_dir = Path(args.path).expanduser().resolve() if args.path else INBOX
    if not src_dir.exists():
        sys.exit(f"Folder not found: {src_dir}")
    if not src_dir.is_dir():
        sys.exit(f"Expected a directory, got a file: {src_dir}")

    photos = sorted(
        [p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    )
    if not photos:
        sys.exit(f"No images found in {src_dir}")

    # Sort chronologically by EXIF date when available so plate numbers follow real-world order
    dated = []
    for p in photos:
        d = read_exif_date(p) or datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d")
        dated.append((d, p))
    dated.sort(key=lambda x: x[0])

    print(f"→ Processing {len(dated)} image(s) from {src_dir.relative_to(ROOT) if src_dir.is_relative_to(ROOT) else src_dir}\n")

    default_location = args.at or ""
    added = []
    for date, src in dated:
        plate_num = next_plate_number()
        dest_name = f"plate-{plate_num:02d}.jpg"
        dest = GALLERY_DIR / dest_name
        size = process_image(src, dest)
        orient = orient_of(size)
        entry = format_entry(
            src_path=f"assets/gallery/{dest_name}",
            date=date,
            location=default_location,
            title="",
            caption="",
            orient=orient,
        )
        append_entry(entry)
        kb = dest.stat().st_size // 1024
        print(f"  ✓ {src.name}  →  {dest_name}  ({size[0]}×{size[1]}, {orient}, {kb} KB, {date})")
        added.append((src, dest))

    # Optionally remove the originals after a successful pass
    if args.delete:
        for src, _ in added:
            try:
                src.unlink()
            except Exception as e:
                print(f"  ! Could not delete {src}: {e}")
        print(f"\n✓ Removed {len(added)} source file(s)")

    print(f"\n✓ Appended {len(added)} entr{'y' if len(added) == 1 else 'ies'} to gallery.md")
    print(f"  Tip: open gallery.md to add title / caption per plate, then git commit.")


def cmd_reprocess(args):
    """Re-encode each plate from its original in ./gallery_inbox at current quality settings."""
    if not INBOX.exists():
        sys.exit(f"Inbox folder not found: {INBOX}")
    inbox_files = sorted(
        [p for p in INBOX.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    )
    dated = []
    for p in inbox_files:
        d = read_exif_date(p) or datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d")
        dated.append((d, p))
    dated.sort(key=lambda x: x[0])

    print(f"→ Re-encoding {len(dated)} plate(s) at {MAX_LONG_EDGE}px long edge, JPEG q={JPEG_QUALITY}\n")
    total_before = 0
    total_after = 0
    for i, (_d, src) in enumerate(dated, start=1):
        dest = GALLERY_DIR / f"plate-{i:02d}.jpg"
        if not dest.exists():
            continue
        before = dest.stat().st_size
        size = process_image(src, dest)
        after = dest.stat().st_size
        total_before += before
        total_after += after
        print(f"  ✓ plate-{i:02d}.jpg  ({size[0]}×{size[1]}, {before//1024} → {after//1024} KB)")
    delta = (total_after - total_before) / 1024 / 1024
    sign = "+" if delta >= 0 else ""
    print(f"\n✓ Total {total_before//1024//1024} → {total_after//1024//1024} MB  ({sign}{delta:.1f} MB)")


def cmd_list(args):
    for p in sorted(GALLERY_DIR.glob("plate-*.jpg")):
        size_kb = p.stat().st_size // 1024
        print(f"  {p.relative_to(ROOT)}  ({size_kb} KB)")


def read_gps(path: Path):
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return None
            try:
                gps = exif.get_ifd(IFD.GPSInfo)
            except Exception:
                gps = None
            if not gps:
                return None
            lat_ref = gps.get(1)
            lat_dms = gps.get(2)
            lon_ref = gps.get(3)
            lon_dms = gps.get(4)
            if not (lat_ref and lat_dms and lon_ref and lon_dms):
                return None
            def dms_to_deg(t):
                try:
                    d, m, s = [float(x) for x in t]
                    return d + m / 60 + s / 3600
                except Exception:
                    return None
            lat = dms_to_deg(lat_dms)
            lon = dms_to_deg(lon_dms)
            if lat is None or lon is None:
                return None
            if str(lat_ref).upper().startswith("S"):
                lat = -lat
            if str(lon_ref).upper().startswith("W"):
                lon = -lon
            return (round(lat, 6), round(lon, 6))
    except Exception:
        return None


def reverse_geocode(lat: float, lon: float, lang: str = "en"):
    params = urllib.parse.urlencode({
        "format": "json",
        "lat": f"{lat}",
        "lon": f"{lon}",
        "zoom": "10",
        "accept-language": lang,
    })
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "xiangyusu611-gallery/1.0 (personal academic homepage)"
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    addr = data.get("address", {}) or {}
    city = (addr.get("city") or addr.get("town") or addr.get("village")
            or addr.get("municipality") or addr.get("county")
            or addr.get("state_district") or addr.get("state"))
    country = addr.get("country")
    if city and country:
        return f"{city} · {country}"
    return city or country or ""


def cmd_geocode(args):
    """Fill empty location fields from EXIF GPS of original photos in ./gallery_inbox."""
    if not GALLERY_MD.exists():
        sys.exit("gallery.md not found")

    # Build ordered list of inbox originals by EXIF date to match plate numbering
    if not INBOX.exists():
        sys.exit(f"Inbox folder not found: {INBOX}")
    inbox_files = sorted(
        [p for p in INBOX.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    )
    if not inbox_files:
        sys.exit(f"No images in {INBOX}")
    dated = []
    for p in inbox_files:
        d = read_exif_date(p) or datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d")
        dated.append((d, p))
    dated.sort(key=lambda x: x[0])  # same ordering gallery.py ingest used

    # Match each plate-NN to the i-th inbox file
    plate_to_src = {}
    for i, (_d, src) in enumerate(dated, start=1):
        plate_to_src[f"plate-{i:02d}.jpg"] = src

    # Rewrite gallery.md
    text = GALLERY_MD.read_text(encoding="utf-8")
    blocks = re.split(r"(?=^\[\[photo\]\]$)", text, flags=re.MULTILINE)
    header, photo_blocks = blocks[0], blocks[1:]

    filled = 0
    skipped_no_gps = 0
    skipped_filled = 0
    new_blocks = []
    for i, b in enumerate(photo_blocks):
        src_m = re.search(r"^src:[ \t]*assets/gallery/(plate-\d+\.jpg)[ \t]*$", b, flags=re.MULTILINE)
        loc_m = re.search(r"^location:[ \t]*(.*)$", b, flags=re.MULTILINE)
        plate_file = src_m.group(1) if src_m else None
        current_loc = (loc_m.group(1).strip() if loc_m else "")
        if current_loc and not args.force:
            skipped_filled += 1
            new_blocks.append(b)
            continue
        original = plate_to_src.get(plate_file)
        if not original or not original.exists():
            new_blocks.append(b)
            continue
        gps = read_gps(original)
        if not gps:
            skipped_no_gps += 1
            print(f"  · {plate_file}  {original.name}  → no GPS")
            new_blocks.append(b)
            continue
        try:
            label = reverse_geocode(gps[0], gps[1], args.lang)
        except Exception as e:
            print(f"  ! {plate_file}  {original.name}  → geocode failed: {e}")
            new_blocks.append(b)
            time.sleep(1.0)
            continue
        if not label:
            print(f"  · {plate_file}  {original.name}  → empty result")
            new_blocks.append(b)
            time.sleep(1.0)
            continue
        # Replace the location line
        new_b = re.sub(r"^location:[ \t]*.*$", f"location: {label}", b, count=1, flags=re.MULTILINE)
        new_blocks.append(new_b)
        filled += 1
        print(f"  ✓ {plate_file}  {original.name}  → {label}")
        time.sleep(1.1)  # Nominatim usage policy: <= 1 req/sec

    new_text = header + "".join(new_blocks)
    GALLERY_MD.write_text(new_text, encoding="utf-8")
    print(f"\n✓ Filled {filled} location(s); {skipped_no_gps} without GPS, {skipped_filled} already set.")


def cmd_backfill_orient(args):
    """Read each plate on disk and inject an `orient:` field into its gallery.md entry."""
    if not GALLERY_MD.exists():
        sys.exit("gallery.md not found")
    text = GALLERY_MD.read_text(encoding="utf-8")

    def fix_block(block: str) -> str:
        src_m = re.search(r"^src:\s*(.+)$", block, flags=re.MULTILINE)
        if not src_m:
            return block
        src_path = ROOT / src_m.group(1).strip()
        if not src_path.exists():
            return block
        with Image.open(src_path) as img:
            orient = orient_of(img.size)
        if re.search(r"^orient:\s*.+$", block, flags=re.MULTILINE):
            return re.sub(r"^orient:\s*.+$", f"orient: {orient}", block, count=1, flags=re.MULTILINE)
        return re.sub(
            r"(^src:\s*.+\n^date:\s*.*\n)",
            lambda m: m.group(1) + f"orient: {orient}\n",
            block,
            count=1,
            flags=re.MULTILINE,
        )

    blocks = re.split(r"(?=^\[\[photo\]\]$)", text, flags=re.MULTILINE)
    header, photo_blocks = blocks[0], blocks[1:]
    new_text = header + "".join(fix_block(b) for b in photo_blocks)
    GALLERY_MD.write_text(new_text, encoding="utf-8")
    print(f"✓ Backfilled orient for {len(photo_blocks)} entr{'y' if len(photo_blocks) == 1 else 'ies'}")


def cmd_clear_placeholders(args):
    if not GALLERY_MD.exists():
        sys.exit("gallery.md not found")
    text = GALLERY_MD.read_text(encoding="utf-8")
    blocks = re.split(r"(?=^\[\[photo\]\]$)", text, flags=re.MULTILINE)
    header, photo_blocks = blocks[0], blocks[1:]
    kept = []
    removed = 0
    for b in photo_blocks:
        if re.search(r"^placeholder\s*:\s*(yes|true|1)\s*$", b, flags=re.MULTILINE | re.IGNORECASE):
            removed += 1
            continue
        kept.append(b)
    new_text = header.rstrip() + "\n\n" + "\n".join(b.rstrip() + "\n" for b in kept)
    new_text = re.sub(r"\n{3,}", "\n\n", new_text).rstrip() + "\n"
    GALLERY_MD.write_text(new_text, encoding="utf-8")
    print(f"✓ Removed {removed} placeholder entr{'y' if removed == 1 else 'ies'}")


def main():
    parser = argparse.ArgumentParser(description="Gallery helper")
    sub = parser.add_subparsers(dest="cmd", required=True)

    add_p = sub.add_parser("add", help="Compress a photo and append an entry to gallery.md")
    add_p.add_argument("path", help="Path to the source image")
    add_p.add_argument("--at", help="Location, e.g. 'Kyoto · Japan'")
    add_p.add_argument("--title", help="Title (shown in Fraunces over the caption)")
    add_p.add_argument("--caption", help="One-line italic caption")
    add_p.add_argument("--date", help="Override date (YYYY-MM-DD)")
    add_p.set_defaults(func=cmd_add)

    ing_p = sub.add_parser("ingest", help="Batch-process every image in a folder (default: ./gallery_inbox)")
    ing_p.add_argument("path", nargs="?", help="Folder to ingest from (default: ./gallery_inbox)")
    ing_p.add_argument("--at", help="Location applied to every ingested plate")
    ing_p.add_argument("--delete", action="store_true", help="Delete source files after ingesting")
    ing_p.set_defaults(func=cmd_ingest)

    sub.add_parser("list", help="List existing plates").set_defaults(func=cmd_list)
    sub.add_parser("reprocess", help="Re-encode all plates from inbox originals at current quality settings").set_defaults(func=cmd_reprocess)
    sub.add_parser("backfill-orient", help="Add orient: to existing gallery.md entries by reading image dimensions").set_defaults(func=cmd_backfill_orient)

    geo_p = sub.add_parser("geocode", help="Fill empty location fields from inbox EXIF GPS via Nominatim")
    geo_p.add_argument("--lang", default="en", help="Reverse-geocode language (default: en)")
    geo_p.add_argument("--force", action="store_true", help="Overwrite locations even if already set")
    geo_p.set_defaults(func=cmd_geocode)

    sub.add_parser("clear-placeholders", help="Remove placeholder: yes entries from gallery.md").set_defaults(func=cmd_clear_placeholders)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
