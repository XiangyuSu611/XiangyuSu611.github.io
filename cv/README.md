# CV

Source for Xiangyu Su's curriculum vitae.

## Build

Requires a LaTeX distribution with the Libertinus fonts (TeX Live 2020+,
MacTeX). Compile with `xelatex` (or `lualatex`) — `pdflatex` will not work
because the file uses `fontspec`.

```bash
cd cv
xelatex cv.tex
```

Output: `cv.pdf`.

## Fonts

The default fonts are `Libertinus Serif` and `Libertinus Sans`, which are
available in most modern TeX distributions. To match the website more
closely, install
[Fraunces](https://fonts.google.com/specimen/Fraunces) and
[Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans),
then edit the `\setmainfont` / `\setsansfont` / `\newfontfamily` lines near
the top of `cv.tex`.

## Editing

The content mirrors the homepage's `content.md` — when you update a
publication, internship, or award there, sync the corresponding entry in
`cv.tex`. Each block is wrapped in a single macro (`\pub`, `\role`,
`\honor`) to keep the source tidy.
