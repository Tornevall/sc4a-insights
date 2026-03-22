from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

BASE = Path(__file__).resolve().parent
ICONS = BASE / 'icons'
ICONS.mkdir(exist_ok=True)

SVG = """<svg width=\"128\" height=\"128\" viewBox=\"0 0 128 128\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">
  <defs>
    <linearGradient id=\"scxBg\" x1=\"14\" y1=\"10\" x2=\"110\" y2=\"116\" gradientUnits=\"userSpaceOnUse\">
      <stop stop-color=\"#FFB067\"/>
      <stop offset=\"0.55\" stop-color=\"#FF7A22\"/>
      <stop offset=\"1\" stop-color=\"#FF5500\"/>
    </linearGradient>
  </defs>
  <rect x=\"6\" y=\"6\" width=\"116\" height=\"116\" rx=\"30\" fill=\"url(#scxBg)\"/>
  <ellipse cx=\"37\" cy=\"31\" rx=\"34\" ry=\"24\" fill=\"#FFD1A8\" fill-opacity=\"0.34\"/>
  <g>
    <rect x=\"27\" y=\"54\" width=\"74\" height=\"38\" rx=\"16\" fill=\"white\" fill-opacity=\"0.96\"/>
    <circle cx=\"40\" cy=\"60\" r=\"15\" fill=\"white\" fill-opacity=\"0.96\"/>
    <circle cx=\"60\" cy=\"50\" r=\"19\" fill=\"white\" fill-opacity=\"0.96\"/>
    <circle cx=\"84\" cy=\"57\" r=\"16\" fill=\"white\" fill-opacity=\"0.96\"/>
  </g>
  <rect x=\"40\" y=\"73\" width=\"9\" height=\"21\" rx=\"4.5\" fill=\"#FF6A1A\"/>
  <rect x=\"57\" y=\"62\" width=\"9\" height=\"32\" rx=\"4.5\" fill=\"#FF6A1A\"/>
  <rect x=\"74\" y=\"50\" width=\"9\" height=\"44\" rx=\"4.5\" fill=\"#FF6A1A\"/>
  <path d=\"M36 72.5L54 66.5L70 58L88 46\" stroke=\"#7E2D00\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>
  <circle cx=\"36\" cy=\"72.5\" r=\"3.8\" fill=\"#7E2D00\"/>
  <circle cx=\"54\" cy=\"66.5\" r=\"3.8\" fill=\"#7E2D00\"/>
  <circle cx=\"70\" cy=\"58\" r=\"3.8\" fill=\"#7E2D00\"/>
  <circle cx=\"88\" cy=\"46\" r=\"3.8\" fill=\"#7E2D00\"/>
</svg>
"""

(BASE / 'scx-insights-mark.svg').write_text(SVG, encoding='utf-8')

for size in (16, 32, 48, 128):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bgd = ImageDraw.Draw(bg)
    radius = max(4, int(size * 0.25))
    bgd.rounded_rectangle((2, 2, size - 2, size - 2), radius=radius, fill=(255, 90, 18, 255))

    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glowd = ImageDraw.Draw(glow)
    glowd.ellipse((-int(size * 0.15), -int(size * 0.05), int(size * 0.85), int(size * 0.75)), fill=(255, 170, 85, 135))
    glow = glow.filter(ImageFilter.GaussianBlur(max(1, int(size * 0.08))))

    img.alpha_composite(bg)
    img.alpha_composite(glow)
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle((size * 0.21, size * 0.43, size * 0.80, size * 0.73), radius=max(2, int(size * 0.12)), fill=(255, 255, 255, 245))
    draw.ellipse((size * 0.20, size * 0.34, size * 0.44, size * 0.58), fill=(255, 255, 255, 245))
    draw.ellipse((size * 0.34, size * 0.24, size * 0.61, size * 0.56), fill=(255, 255, 255, 245))
    draw.ellipse((size * 0.52, size * 0.30, size * 0.78, size * 0.58), fill=(255, 255, 255, 245))

    bar_color = (255, 106, 26, 255)
    dark = (126, 45, 0, 230)
    bar_w = max(2, int(size * 0.08))
    for rect in [
        (size * 0.31, size * 0.58, size * 0.31 + bar_w, size * 0.74),
        (size * 0.44, size * 0.50, size * 0.44 + bar_w, size * 0.74),
        (size * 0.57, size * 0.41, size * 0.57 + bar_w, size * 0.74),
    ]:
        draw.rounded_rectangle(rect, radius=max(1, int(size * 0.02)), fill=bar_color)

    points = [
        (size * 0.28, size * 0.57),
        (size * 0.42, size * 0.52),
        (size * 0.55, size * 0.45),
        (size * 0.69, size * 0.35),
    ]
    draw.line(points, fill=dark, width=max(1, int(size * 0.035)), joint='curve')
    for x, y in points:
        r = max(1, int(size * 0.025))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=dark)

    img.save(ICONS / f'icon{size}.png')

print('Generated', ', '.join(sorted(p.name for p in ICONS.iterdir())))

