#!/usr/bin/env bash
# Rebuild the existing demo excerpts from their original videos, not old GIFs.
# Usage: bash scripts/build-publication-videos.sh IMR_OVERVIEW_MP4 HAPG_SUPPLEMENT_MP4
set -euo pipefail

if [[ $# -ne 2 || ! -f "$1" || ! -f "$2" ]]; then
  printf '%s\n' 'Supply the original IMR overview and HAPG supplementary MP4 files.' >&2
  exit 1
fi

publication_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
publication_assets="$publication_root/assets/publications"
for publication_output in imr-llm-hd.mp4 hapg-hd.mp4 imr-llm-preview.mp4 hapg-preview.mp4 imr-llm-hd-poster.jpg hapg-hd-poster.jpg; do
  if [[ -e "$publication_assets/$publication_output" ]]; then
    printf 'Output already exists; preserve it or choose a new version: %s\n' "$publication_output" >&2
    exit 1
  fi
done

# Preserve the original preview's approximately 2x-speed, complete overview.
# Native 1920x1080 source; no upscaling, sharpening, or invented frames.
ffmpeg -hide_banner -loglevel error -n -i "$1" -an \
  -vf 'setpts=(PTS-STARTPTS)/2,fps=30' \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart \
  "$publication_assets/imr-llm-hd.mp4"

# Same Minecraft correction sequence as the old 33-second preview, at 3x speed.
ffmpeg -hide_banner -loglevel error -n -ss 82 -t 99 -i "$2" -an \
  -vf 'setpts=(PTS-STARTPTS)/3,fps=30' \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart \
  "$publication_assets/hapg-hd.mp4"

# Inline previews retain 30 fps and are downsampled directly from the sources.
# 720p covers the approximately 386-CSS-pixel card at 2x/3x display density.
ffmpeg -hide_banner -loglevel error -n -i "$1" -an \
  -vf 'setpts=(PTS-STARTPTS)/2,fps=30,scale=1280:720:flags=lanczos' \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart \
  "$publication_assets/imr-llm-preview.mp4"
ffmpeg -hide_banner -loglevel error -n -ss 82 -t 99 -i "$2" -an \
  -vf 'setpts=(PTS-STARTPTS)/3,fps=30,scale=1280:720:flags=lanczos' \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart \
  "$publication_assets/hapg-preview.mp4"

for publication_clip in imr-llm hapg; do
  ffmpeg -hide_banner -loglevel error -n -i "$publication_assets/$publication_clip-hd.mp4" \
    -frames:v 1 -q:v 2 "$publication_assets/$publication_clip-hd-poster.jpg"
done
