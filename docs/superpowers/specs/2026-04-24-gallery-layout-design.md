# Gallery Layout — B2 Chapter Rows

**Status:** Draft · awaiting user approval
**Date:** 2026-04-24
**Scope:** Rewrite gallery.html `renderGallery()` + gallery-related CSS to
replace the current 3-column asymmetric masonry with a chapter-row editorial
layout.

## Goal

Deliver a gallery that feels:

- **自由** — varied sizes, varied rhythms, no monotone grid
- **不稀疏** — tight 4px gaps, no big whitespace between chapters
- **有节奏感** — hero / flat / hero-right alternation drives the eye
- **整体规整** — rows align horizontally, container widths match across rows

Based on 4 rounds of brainstorming mockups ending on the **B2 faithful**
variant the user approved.

## Layout Model

### Chapter types

```
hero-left       flat-row        hero-right      flat-row
┌─────┬──┬──┐   ┌──┬──┬──┬──┐   ┌──┬──┬─────┐   ┌──┬──┬──┬──┐
│     │  │  │   │  │  │  │  │   │  │  │     │   │  │  │  │  │
│     ├──┼──┤   ├──┼──┼──┼──┤   ├──┼──┤     │   ├──┼──┼──┼──┤
│HERO │  │  │   │  │  │  │  │   │  │  │HERO │   │  │  │  │  │
└─────┴──┴──┘   └──┴──┴──┴──┘   └──┴──┴─────┘   └──┴──┴──┴──┘
   5 photos       4 photos         5 photos        4 photos
```

Two row templates (from CSS Grid):

1. **Hero row** · `grid-template-columns: 2fr 1fr 1fr` with hero taking
   `grid-row: span 2`. 5 photos total (1 hero + 4 thumbs).
   - Hero `aspect-ratio: 3/2`, thumbs `aspect-ratio: 4/3`
   - Variant: `hero-left` (hero in col 1) or `hero-right` (hero in col 3)
2. **Flat row** · `grid-template-columns: repeat(4, 1fr)`, 4 photos all at
   `aspect-ratio: 4/3`.

### Chapter sequence

Pattern cycles: `hero-left → flat → hero-right → flat → …`

- Photos per cycle: 5 + 4 + 5 + 4 = **18**
- 32 photos = 1 full cycle (18) + 1 partial cycle (14) = `hero-left, flat,
  hero-right, flat, hero-left, flat, hero-right`
  - Exactly **32 photos**, no leftover, no incomplete row.

### Hero selection

Within each hero row, the hero slot gets the **widest photo** from its 5-photo
chunk. This rule:

- Lets panoramic shots (plate-31 @ 1.778, plate-01 @ 1.5, plate-14 @ 1.411,
  plate-12 @ 1.468) earn hero status naturally
- Portraits (plates 11, 22, 32 @ 0.75) never become heroes (would crop badly)
- For a 5-photo chunk, pick the one with the highest ratio; shift remaining
  four to the thumb slots in their original order

### Shuffle

Fisher-Yates shuffle on page load (preserved from existing code). Hero
selection happens AFTER shuffle, so each load yields fresh sequence and
fresh heroes.

### Portrait handling

Portraits land in thumb slots (aspect-ratio 4/3, object-fit cover). They
crop to center 4/3 of the portrait — acceptable given the B2 geometry.
This matches what the user saw and approved in the B2 faithful mockup.

## Gaps and spacing

| Parameter               | Value |
| ----------------------- | ----- |
| Intra-row gap           | 4px   |
| Inter-chapter margin    | 4px   |
| Side padding            | 0     |
| Max-width               | unchanged from current gallery-container |

## Responsive behavior

- **≥ 800px:** full layout as specified
- **600-799px:** hero rows degrade to single column (hero on top, 4 thumbs in
  2×2 grid below); flat rows become 2×2 grid
- **< 600px:** everything collapses to single column, aspect ratios retained

## Files to change

1. `gallery.html` — replace `renderGallery()` function (~line 173-200) with
   chapter-based rendering
2. `style.css` — replace `.gallery-stream` + `.col` + `.plate` rules
   controlling the masonry with `.gallery-chapter`, `.hero-left`, `.hero-right`,
   `.flat-row`, `.plate-hero`, `.plate-thumb`
3. Bump `style.css?v=61` → `v=62` in `gallery.html`

## Out of scope

- Curation (reducing 32 → 12 photos)
- Color grading across plates
- Layout changes for other pages (index.html, note.html)

## Open questions

None — B2 faithful mockup was approved.
