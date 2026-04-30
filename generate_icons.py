from PIL import Image, ImageDraw
import os

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    s = size

    vial_w = s * 0.28
    vial_h = s * 0.52
    vial_x = (s - vial_w) / 2
    vial_y = s * 0.28

    neck_w = vial_w * 0.55
    neck_h = vial_h * 0.15
    neck_x = (s - neck_w) / 2
    neck_y = vial_y - neck_h

    cap_w = vial_w * 0.7
    cap_h = vial_h * 0.12
    cap_x = (s - cap_w) / 2
    cap_y = neck_y - cap_h

    blue = (24, 95, 165, 255)
    dark_blue = (12, 68, 124, 255)
    blue_light = (24, 95, 165, 38)
    blue_mid = (24, 95, 165, 128)
    blue_full = (24, 95, 165, 230)

    r = vial_w * 0.28

    d.rounded_rectangle([vial_x, vial_y, vial_x+vial_w, vial_y+vial_h], radius=r, fill=blue_light, outline=blue, width=max(1, int(s*0.025)))

    liquid_top = vial_y + vial_h * 0.45
    liquid_bottom = vial_y + vial_h - r
    d.rectangle([vial_x+2, liquid_top, vial_x+vial_w-2, liquid_bottom], fill=blue_full)

    mid_top = vial_y + vial_h * 0.28
    d.rectangle([vial_x+2, mid_top, vial_x+vial_w-2, liquid_top], fill=blue_mid)

    d.rounded_rectangle([vial_x, vial_y+vial_h-r*2, vial_x+vial_w, vial_y+vial_h], radius=r, fill=blue_full)

    d.rounded_rectangle([vial_x, vial_y, vial_x+vial_w, vial_y+vial_h], radius=r, fill=None, outline=blue, width=max(1, int(s*0.025)))

    neck_r = neck_w * 0.3
    d.rounded_rectangle([neck_x, neck_y, neck_x+neck_w, neck_y+neck_h], radius=neck_r, fill=(255,255,255,255), outline=blue, width=max(1, int(s*0.02)))

    cap_r = cap_h * 0.45
    d.rounded_rectangle([cap_x, cap_y, cap_x+cap_w, cap_y+cap_h], radius=cap_r, fill=dark_blue)

    shine_x = vial_x + vial_w * 0.22
    d.line([(shine_x, vial_y + vial_h*0.08), (shine_x, vial_y + vial_h*0.38)], fill=(255,255,255,160), width=max(1, int(s*0.018)))

    return img

assets_path = os.path.expanduser('~/Desktop/DoseTrace/assets')

sizes = {
    'icon.png': 1024,
    'adaptive-icon.png': 1024,
    'favicon.png': 48,
}

for filename, size in sizes.items():
    img = draw_icon(size)
    img.save(os.path.join(assets_path, filename))
    print(f'saved {filename} at {size}x{size}')

splash_icon = draw_icon(200)
splash = Image.new('RGBA', (1284, 2778), (255, 255, 255, 255))
icon_pos = ((1284 - 200) // 2, (2778 - 200) // 2)
splash.paste(splash_icon, icon_pos)
splash.save(os.path.join(assets_path, 'splash-icon.png'))
print('saved splash-icon.png at 1284x2778')

print('all done')
