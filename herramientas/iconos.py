# Genera los íconos PNG (gota/marcador con punto). Uso: python3 -I herramientas/iconos.py
from PIL import Image, ImageDraw
import os
ACENTO = (46, 125, 91); BLANCO = (250, 247, 240)
def icono(n, escala=1.0):
    S = n * 4
    im = Image.new("RGB", (S, S), ACENTO)
    d = ImageDraw.Draw(im)
    k = escala
    cx, cy, r = S / 2, S / 2 + (0.42 - 0.5) * S * k, S * 0.24 * k
    # cola del marcador: triángulo tangente al círculo hasta la punta
    d.polygon([(cx - r * 0.87, cy + r * 0.5), (cx + r * 0.87, cy + r * 0.5), (cx, S / 2 + (0.80 - 0.5) * S * k)], fill=BLANCO)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLANCO)
    d.ellipse([cx - r * 0.42, cy - r * 0.42, cx + r * 0.42, cy + r * 0.42], fill=ACENTO)
    return im.resize((n, n), Image.LANCZOS)
aqui = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
for nombre, n in [("icono-192.png", 192), ("icono-512.png", 512), ("apple-touch-icon.png", 180)]:
    icono(n).save(os.path.join(aqui, nombre))
# Maskable: el dibujo cabe en el círculo central (zona segura, 80 % del lado) para que ningún recorte lo corte.
icono(512, 0.62).save(os.path.join(aqui, "icono-maskable-512.png"))
