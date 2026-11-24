#!/usr/bin/env python3
"""Cuts the drawing for "הזיקית בורחת" (zikit.html) into game sprites.

    python3 scripts/zikit-cutouts.py [--debug DIR]

Needs numpy, opencv-python-headless and pillow. Reads the four photographs in drawings/
(never changes them) and writes src/assets/zikit/{chameleon,monster,forest}.webp, plus
src/zikit-rig.json, which says where every piece sits and where it hinges, and
design/zikit-parts.webp, a sheet showing the page next to every piece cut from it.

Nothing here is redrawn. Each sprite is the kid's own marker and pencil strokes:
  1. the photo's uneven light is divided out, so bare paper becomes one flat colour;
  2. a hand-traced polygon says which strokes belong to which piece (the page is full of
     other pencil lines that pass right next to the characters);
  3. ink keeps its own strength as transparency, and whatever the ink encloses becomes
     opaque paper, so a character is not see-through where the marker missed a spot;
  4. where one piece is hinged under another (a leg under the belly, the tail under the
     body) its hidden end is continued by mirroring its own strokes across the cut, so
     nothing gapes when it swings.
All coordinates below are pixels in the original photographs.
"""
import argparse, json
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DRAW = ROOT / 'drawings'
OUT = ROOT / 'src' / 'assets' / 'zikit'
PAPER = np.array([248, 245, 236], np.float32) / 255      # --paper in src/kit/shell.css


# ---------- reading the photographs ----------
def load(name):
    return np.asarray(Image.open(DRAW / name).convert('RGB')).astype(np.float32) / 255

def _poly_terms(h, w, deg, step=1):
    ys, xs = np.mgrid[0:h:step, 0:w:step].astype(np.float32)
    x = xs / w * 2 - 1; y = ys / h * 2 - 1
    return np.stack([x ** i * y ** j for i in range(deg + 1) for j in range(deg + 1 - i)], -1)

def normalize(img, deg=3, iters=6, sigma=40):
    """Divide out the photo's lighting: bare paper becomes (1, 1, 1) everywhere."""
    h, w, _ = img.shape
    step = 4
    small = img[::step, ::step]
    T = _poly_terms(h, w, deg, step)
    A = T.reshape(-1, T.shape[-1]); Y = small.reshape(-1, 3)
    lum = Y.mean(1)
    keep = lum > np.percentile(lum, 45)
    for _ in range(iters):
        coef, *_ = np.linalg.lstsq(A[keep], Y[keep], rcond=None)
        keep = np.abs(Y - A @ coef).max(1) < .035
    B = (_poly_terms(h, w, deg) @ coef).astype(np.float32)
    res = img - B
    paper = (np.abs(res).max(2) < .05).astype(np.float32)
    paper = cv2.erode(paper, np.ones((7, 7), np.uint8))
    num = cv2.GaussianBlur(res * paper[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(paper, (0, 0), sigma)
    corr = num / np.maximum(den, 1e-3)[..., None]
    corr *= np.clip(den * 6, 0, 1)[..., None]       # no bare paper nearby: trust the smooth fit
    return np.clip(img / np.clip(B + corr, .05, 1.5), 0, 1.25)


# ---------- masks ----------
def poly_mask(shape, poly):
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.round(np.array(poly, np.float32) * 8).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=3)
    return m.astype(np.float32) / 255

def union(shape, polys):
    m = np.zeros(shape[:2], np.float32)
    for p in polys: m = np.maximum(m, poly_mask(shape, p))
    return m

def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)

def grow(mask, px=2):
    """A piece that is drawn underneath its neighbour reaches a hair under it, so no seam shows."""
    return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px * 2 + 1, px * 2 + 1)))

def strip(points, half):
    """A band of the given half-width along a polyline (for rubbing out a stray pencil line)."""
    pts = np.array(points, np.float32); left = []; right = []
    for i, p in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        n = np.array([-d[1], d[0]]) / (np.hypot(*d) + 1e-6)
        left.append(p + n * half); right.append(p - n * half)
    return [tuple(p) for p in left] + [tuple(p) for p in right[::-1]]


# ---------- cutting ----------
def cutout(N, mask, lo=.07, hi=.2, close=5, min_area=60, solid=(), hollow=(), fill=True):
    """RGBA of the drawing under `mask`: ink by its own strength, enclosed paper opaque."""
    h, w, _ = N.shape
    d = np.clip(1 - N.min(2), 0, 1)                   # 0 on bare paper, 1 under full ink
    a = smoothstep(lo, hi, d) * mask
    strong = (a > .35).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(strong, np.ones((5, 5), np.uint8)), connectivity=8)
    dust = np.isin(lab, np.where(stats[:, cv2.CC_STAT_AREA] < min_area)[0]) & (lab > 0)
    a[dust] = 0
    a = np.where(a < .04, 0, a)
    inside = np.zeros((h, w), np.float32)
    if fill:
        barrier = (a > .45).astype(np.uint8)
        if close:
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close * 2 + 1, close * 2 + 1))
            barrier = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE, k)
        free = (barrier == 0).astype(np.uint8)
        free[mask < .5] = 1
        ff = cv2.copyMakeBorder(free, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=1)
        cv2.floodFill(ff, None, (0, 0), 2)
        inside = ((ff[1:-1, 1:-1] != 2) & (mask >= .5)).astype(np.float32)
    for p in solid: inside = np.maximum(inside, poly_mask(N.shape, p) * (mask >= .5))
    for p in hollow: inside = inside * (1 - poly_mask(N.shape, p))
    alpha = np.maximum(a, cv2.GaussianBlur(inside, (0, 0), .7) * inside)
    safe = np.maximum(a, 1e-3)[..., None]
    ink = np.clip((N - (1 - safe)) / safe, 0, 1)      # the ink's own colour, without the paper behind it
    rgb = np.where(inside[..., None] > .5, np.clip(N, 0, 1), ink)
    return np.dstack([rgb, alpha]).astype(np.float32)

def mirror_under(part, a, b, depth, side, cover):
    """Continue a piece past its cut line a→b by mirroring its own strokes across the line.
    `side` (+1 / -1) picks which side of the line gets the continuation; it only goes where
    `cover` (the piece drawn on top) is opaque, so at rest none of it shows."""
    h, w, _ = part.shape
    a = np.array(a, np.float32); b = np.array(b, np.float32)
    t = (b - a) / np.hypot(*(b - a)); n = np.array([-t[1], t[0]]) * side
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    rel = np.stack([xs - a[0], ys - a[1]], -1)
    dist = rel @ n; along = rel @ t
    zone = (dist > 0) & (dist <= depth) & (along >= -2) & (along <= np.hypot(*(b - a)) + 2)
    sx = xs - 2 * dist * n[0]; sy = ys - 2 * dist * n[1]
    pm = part.copy(); pm[..., :3] *= pm[..., 3:4]
    src = cv2.remap(pm, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    src[..., :3] /= np.maximum(src[..., 3:4], 1e-4)
    out = part.copy()
    take = zone & (src[..., 3] > out[..., 3]) & (cover > .6)
    out[take] = src[take]
    return out

def split(rgba, mask):
    out = rgba.copy(); out[..., 3] *= mask
    return out

def bbox(alpha, pad=2, thr=.02):
    ys, xs = np.where(alpha > thr); h, w = alpha.shape
    return max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad), min(w, int(xs.max()) + 1 + pad), min(h, int(ys.max()) + 1 + pad)

def resize_rgba(rgba, scale):
    if scale == 1: return rgba
    pm = rgba.copy(); pm[..., :3] *= pm[..., 3:4]
    h, w = rgba.shape[:2]
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    pm = cv2.resize(pm, size, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    pm = np.clip(pm, 0, 1)
    pm[..., :3] /= np.maximum(pm[..., 3:4], 1e-4)
    return np.clip(pm, 0, 1)


# ---------- the chameleon: drawings/zikit-4-chameleon.webp ----------
CHAM = dict(
    whole=[(106,480),(108,440),(118,398),(132,362),(150,326),(172,300),(196,276),(222,254),(250,240),(290,230),(335,216),
           (560,216),(640,222),(720,228),(770,236),(800,246),(850,262),(900,280),(945,298),
           (952,296),(975,265),(1000,235),(1030,205),(1065,170),(1102,145),(1148,124),(1200,116),(1255,121),(1298,140),(1335,176),(1366,224),(1384,276),(1394,330),(1396,385),(1390,440),(1380,505),(1366,565),(1356,600),(1338,598),
           (1322,540),(1300,470),(1290,440),(1296,395),(1318,372),(1322,330),(1318,290),(1305,258),(1285,234),(1255,212),(1200,198),(1155,202),(1120,222),(1097,252),(1090,262),
           (1120,268),(1160,298),(1198,343),(1226,385),(1236,430),(1232,468),(1215,482),
           (1195,482),(1150,470),(1100,450),(1050,427),(1000,404),(960,387),(930,374),(900,362),(875,354),
           (870,358),(858,400),(864,470),(864,525),(848,550),(825,574),(778,574),(752,548),(735,532),(700,544),(676,530),(678,500),(722,478),(742,455),(750,400),(748,345),(725,322),(700,312),
           (650,298),(625,292),(624,330),(602,372),(600,400),(592,418),(594,452),(574,477),(545,474),(526,447),(505,442),(480,438),(472,420),(495,400),(513,385),(508,340),(516,300),
           (470,294),(430,287),(390,280),(350,290),(318,305),(290,320),(268,345),(250,372),(238,405),(232,435),(240,455),(268,462),(292,480),(308,510),(310,550),(296,585),(270,606),(238,616),(205,616),(170,605),(142,585),(122,558),(110,525)],
    # the colourful hair: everything above the top of the head
    hair=[(952,300),(952,296),(975,265),(1000,235),(1030,205),(1065,170),(1102,145),(1148,124),(1200,116),(1255,121),(1298,140),(1335,176),(1366,224),(1384,276),(1394,330),(1396,385),(1390,440),(1380,505),(1366,565),(1356,600),(1338,598),
          (1322,540),(1300,470),(1290,440),(1296,395),(1318,372),(1322,330),(1318,290),(1305,258),(1285,234),(1255,212),(1200,198),(1155,202),(1120,222),(1097,252),(1090,262),(1075,256),(1040,264),(1000,284),(958,301)],
    hair_root=((958, 301), (1090, 259)),               # the cut along the top of the head
    # the hair bends at three places along its arc: (outer edge, inner edge) of each cut
    hair_cuts=[((1118,140),(1132,222)), ((1322,168),(1272,222)), ((1396,345),(1312,345))],
    hair_tip=(1346, 590),
    leg_back=[(512,280),(548,279),(580,287),(628,299),(624,330),(602,372),(600,400),(592,418),(594,452),(574,477),(545,474),(526,447),(505,442),(480,438),(472,420),(495,400),(513,385),(508,340),(514,300)],
    leg_back_cut=((540, 281), (622, 297)), leg_back_hip=(578, 286),
    leg_front=[(745,322),(780,331),(820,342),(872,358),(858,400),(864,470),(864,525),(848,550),(825,574),(778,574),(752,548),(735,532),(700,544),(676,530),(678,500),(722,478),(742,455),(750,400),(748,345)],
    leg_front_cut=((770, 328), (866, 356)), leg_front_hip=(815, 340),
    tail_x=338, tail_pivot=(338, 262),
    ground=(790, 562),                                  # under the front foot: the sprite's origin
    mouth=(1178, 446), eye=(1072, 362),
    scale=.5,
)

def build_chameleon(dbg):
    N = normalize(load('zikit-4-chameleon.webp'))
    C = CHAM; shape = N.shape
    whole = cutout(N, poly_mask(shape, C['whole']), close=6)
    hair_m = poly_mask(shape, C['hair'])
    legb_m = poly_mask(shape, C['leg_back']); legf_m = poly_mask(shape, C['leg_front'])
    xs = np.arange(shape[1], dtype=np.float32)[None, :].repeat(shape[0], 0)
    tail_m = np.clip(C['tail_x'] - xs + .5, 0, 1)
    body_m = (1 - hair_m) * (1 - legb_m) * (1 - legf_m) * (1 - tail_m)
    parts = {}
    parts['body'] = dict(img=split(whole, body_m), pivot=C['ground'])
    tail = split(whole, np.clip(C['tail_x'] + 14 - xs + .5, 0, 1) * (1 - legb_m))   # 14 px tucked under the body
    parts['tail'] = dict(img=tail, pivot=C['tail_pivot'])
    over = parts['body']['img'][..., 3]
    lb = mirror_under(split(whole, grow(legb_m)), *C['leg_back_cut'], depth=22, side=-1, cover=over)
    lf = mirror_under(split(whole, grow(legf_m)), *C['leg_front_cut'], depth=22, side=-1, cover=over)
    parts['legBack'] = dict(img=lb, pivot=C['leg_back_hip'])
    parts['legFront'] = dict(img=lf, pivot=C['leg_front_hip'])
    hair = mirror_under(split(whole, grow(hair_m)), *C['hair_root'], depth=14, side=1, cover=over)
    # four overlapping lengths of hair, each hinged on the one before
    ys, xs2 = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    P = np.stack([xs2, ys], -1); ov = 9
    mids = [np.mean(c, 0) for c in C['hair_cuts']] + [np.array(C['hair_tip'], np.float32)]
    def along(i):
        a, b = np.array(C['hair_cuts'][i][0], np.float32), np.array(C['hair_cuts'][i][1], np.float32)
        d = np.array([-(b - a)[1], (b - a)[0]]) / np.hypot(*(b - a))
        if (mids[i + 1] - mids[i]) @ d < 0: d = -d
        return (P - a) @ d                             # > 0 towards the tip
    dist = [along(i) for i in range(3)]
    edges = [np.full(shape[:2], 1e9, np.float32)] + dist + [np.full(shape[:2], -1e9, np.float32)]
    root_mid = tuple(np.mean(C['hair_root'], 0))
    pivots = [root_mid] + [tuple(np.mean(c, 0)) for c in C['hair_cuts']]
    for i in range(4):
        m = (edges[i] > -ov) & (edges[i + 1] < ov) if i else (edges[1] < ov)
        if i == 3: m = dist[2] > -ov
        parts[f'hair{i}'] = dict(img=split(hair, m.astype(np.float32)), pivot=pivots[i])
    order = ['tail', 'legBack', 'legFront', 'hair3', 'hair2', 'hair1', 'hair0', 'body']
    marks = dict(mouth=C['mouth'], eye=C['eye'])
    if dbg is not None: dbg['chameleon'] = (N, whole)
    return dict(name='chameleon', parts=parts, order=order, origin=C['ground'], scale=C['scale'], marks=marks)


# ---------- the monster: drawings/zikit-2-monster.webp ----------
MON = dict(
    big=[(655,765),(660,722),(676,700),(702,690),(722,690),(722,600),(728,540),(745,490),(766,455),(788,438),(806,420),(834,398),(880,362),(930,336),(985,322),
         (1010,310),(1100,300),(1200,300),(1225,400),(1232,440),(1618,340),(1655,336),(1668,352),(1676,420),(1680,520),(1674,600),(1650,690),(1612,770),(1560,848),(1508,910),(1462,950),(1430,968),(1420,985),(1404,1022),
         (1404,1034),(1500,1060),(1500,1205),(1490,1215),(1470,1238),(1440,1250),(1352,1250),(1360,1486),(1300,1490),(1240,1475),(1205,1462),(1196,1478),(1160,1492),(1140,1490),(1128,1494),(1100,1503),(1065,1514),(1052,1518),(1030,1524),(1012,1524),(1000,1522),(975,1518),(950,1514),(936,1512),(900,1510),(860,1492),(835,1462),(812,1440),
         (760,1436),(700,1438),(664,1440),(664,1165),(640,1168),(612,1150),(606,1120),(625,1096),(680,1086),(728,1083),(748,1070),(742,1000),(752,960),(775,945),(740,950),(700,958),(652,968),(655,925),(658,890),(684,880),(680,850),(672,812),(668,790)],
    # the page's long pencil line runs down through her pencil loops into her head: rub it out above and below the loops
    stray=[[(680,686),(706,686),(707,733),(686,733)], [(688,787),(716,787),(716,872),(690,878)]],
    clown=[(1626,112),(1665,108),(1705,140),(1722,125),(1752,140),(1795,150),(1808,178),(1826,222),(1828,262),(1818,290),(1826,330),(1815,356),(1790,362),(1755,345),(1700,348),(1660,340),(1618,340),(1598,362),(1582,395),(1568,425),(1558,455),(1554,478),(1552,505),(1548,540),(1530,572),(1500,600),(1478,632),(1464,668),(1452,702),(1412,716),(1355,704),(1318,668),(1296,625),(1284,598),(1290,560),(1262,548),(1238,520),(1230,480),(1232,440),(1250,418),(1285,424),(1300,448),(1340,438),(1395,413),(1440,390),(1470,366),(1510,333),(1548,306),(1566,286),(1590,262),(1604,236),(1598,205),(1606,172)],
    clown_pivot=(1552, 495),
    arm_horn=[(668,790),(650,768),(628,740),(606,702),(578,662),(540,625),(500,592),(458,548),(428,508),(386,486),(340,488),(318,520),(340,570),(385,632),(430,685),(462,712),(488,745),(505,780),(535,820),(560,850),(565,880),(545,905),(538,872),(505,872),(440,895),(425,925),(432,960),(400,985),(365,1012),(330,1035),(290,1062),(250,1088),(215,1078),(170,1090),(142,1125),(138,1175),(160,1215),(200,1240),(250,1242),(285,1225),(300,1190),(305,1150),(335,1128),(380,1095),(430,1070),(480,1062),(505,1075),(545,1082),(585,1062),(612,1040),(604,1000),(600,985),(652,968),(655,925),(658,890),(684,880),(680,850),(672,812)],
    arm_horn_cut=((658, 890), (652, 968)), arm_horn_pivot=(655, 928),
    arm_low=[(660,1165),(660,1262),(640,1268),(622,1262),(618,1290),(590,1300),(565,1290),(560,1262),(530,1262),(526,1300),(520,1335),(505,1350),(470,1348),(440,1340),(436,1310),(420,1300),(408,1260),(412,1215),(432,1190),(448,1150),(455,1115),(480,1100),(515,1102),(530,1130),(532,1165),(560,1165),(580,1150),(612,1152),(625,1168)],
    arm_low_cut=((660, 1168), (660, 1260)), arm_low_pivot=(660, 1216),
    stick=[(664,1346),(640,1342),(600,1348),(560,1362),(520,1352),(480,1338),(440,1338),(400,1352),(360,1375),(320,1392),(280,1395),(255,1400),(248,1430),(256,1462),(285,1470),(320,1462),(360,1445),(400,1425),(440,1412),(480,1425),(520,1445),(560,1455),(600,1452),(640,1440),(664,1436)],
    stick_cut=((664, 1350), (664, 1434)), stick_pivot=(664, 1390),
    ear=[(1404,1022),(1440,1005),(1500,972),(1560,952),(1640,936),(1700,936),(1760,952),(1800,985),(1826,1040),(1836,1100),(1822,1170),(1770,1204),(1700,1200),(1620,1180),(1570,1162),(1530,1148),(1508,1136),(1493,1114),(1465,1100),(1401,1100),(1401,1034)],
    ear_pivot=(1404, 1042),
    tail=[(1352,1250),(1440,1250),(1470,1238),(1486,1215),(1496,1205),(1496,1150),(1530,1140),(1568,1152),(1598,1200),(1622,1260),(1640,1320),(1700,1330),(1740,1300),(1780,1240),(1815,1200),(1852,1190),(1890,1205),(1908,1250),(1905,1310),(1888,1350),(1880,1372),(1920,1392),(1955,1420),(1976,1470),(1976,1545),(1950,1582),(1900,1592),(1850,1575),(1815,1540),(1800,1560),(1805,1620),(1780,1670),(1740,1689),(1640,1689),(1600,1650),(1585,1600),(1575,1540),(1560,1492),(1500,1490),(1420,1492),(1352,1486)],
    tail_cut=((1352, 1252), (1352, 1484)), tail_pivot=(1352, 1368),
    # the poop on her head (the bell with the knob on top); the orange unicorn horn runs up in front of it
    poop=[(1122,335),(1135,318),(1156,312),(1176,320),(1186,342),(1184,372),(1182,408),(1205,418),(1220,455),(1244,520),(1266,590),(1284,650),(1296,714),(1275,708),(1262,705),(1250,698),(1215,698),(1198,692),(1146,692),(1140,676),(1100,680),(1065,680),(1050,668),(1004,664),(984,652),(986,610),(1000,555),(1022,505),(1055,462),(1090,435),(1118,420),(1124,385)],
    horn_stem=[(1186,420),(1204,420),(1207,470),(1202,560),(1200,640),(1198,692),(1146,692),(1146,660),(1150,600),(1156,540),(1166,500),(1176,462)],
    poop_pivot=(1140, 690), poop_clone=52,
    leg_l=[(934,1440),(1016,1432),(1014,1578),(932,1578)], leg_l_solid=[(952,1452),(1008,1445),(998,1562),(946,1562)], leg_l_pivot=(975, 1506),
    leg_r=[(1050,1436),(1138,1420),(1138,1574),(1048,1574)], leg_r_solid=[(1066,1446),(1126,1432),(1130,1566),(1058,1556)], leg_r_pivot=(1095, 1498),
    feet=(1037, 1568),                                   # between her shoes: the sprite's origin
    bug=[(78,836),(206,836),(238,930),(238,1010),(78,1010)],
    scale=.6,
)

def build_monster(dbg):
    N = normalize(load('zikit-2-monster.webp'))
    M = MON; shape = N.shape
    m = {k: poly_mask(shape, M[k]) for k in ['clown', 'arm_horn', 'arm_low', 'stick', 'ear', 'tail', 'poop', 'horn_stem', 'leg_l', 'leg_r']}
    dome = m['poop'] * (1 - m['horn_stem'])
    core_m = poly_mask(shape, M['big']) * (1 - union(shape, M['stray']))
    for k in ['clown', 'arm_horn', 'arm_low', 'stick', 'ear', 'tail']: core_m = core_m * (1 - m[k])
    core_m = np.maximum(core_m * (1 - dome), m['horn_stem'])
    parts = {}
    parts['core'] = dict(img=cutout(N, core_m, close=5), pivot=M['feet'])
    under = {k: grow(m[k]) for k in ['arm_horn', 'arm_low', 'stick', 'tail', 'ear']}
    parts['clown'] = dict(img=cutout(N, m['clown'], close=4), pivot=M['clown_pivot'])
    over = parts['core']['img'][..., 3]
    parts['armHorn'] = dict(img=mirror_under(cutout(N, under['arm_horn'], close=4), *M['arm_horn_cut'], depth=14, side=-1, cover=over), pivot=M['arm_horn_pivot'])
    parts['armLow'] = dict(img=mirror_under(cutout(N, under['arm_low'], close=4), *M['arm_low_cut'], depth=14, side=-1, cover=over), pivot=M['arm_low_pivot'])
    parts['stick'] = dict(img=mirror_under(cutout(N, under['stick'], close=4), *M['stick_cut'], depth=14, side=-1, cover=over), pivot=M['stick_pivot'])
    parts['ear'] = dict(img=cutout(N, under['ear'], close=5), pivot=M['ear_pivot'])
    parts['tail'] = dict(img=mirror_under(cutout(N, under['tail'], close=4), *M['tail_cut'], depth=56, side=1, cover=over), pivot=M['tail_pivot'])
    # the poop: rub the unicorn horn out of it, so it is whole when she throws it
    stem = cv2.GaussianBlur(cv2.dilate(m['horn_stem'], np.ones((9, 9), np.uint8)), (0, 0), 2.5)[..., None]
    Np = N * (1 - stem) + np.roll(N, M['poop_clone'], axis=1) * stem      # the crayon lump beside it, moved over
    core_of_poop = cv2.erode(m['poop'], np.ones((25, 25), np.uint8))
    poop = cutout(Np, m['poop'], close=6)
    poop[..., 3] = np.maximum(poop[..., 3], core_of_poop)
    poop[..., :3] = np.where(core_of_poop[..., None] > poop[..., 3:4] - 1e-3, np.clip(Np, 0, 1), poop[..., :3])
    parts['poop'] = dict(img=poop, pivot=M['poop_pivot'])
    parts['legL'] = dict(img=cutout(N, m['leg_l'], close=3, solid=[M['leg_l_solid']]), pivot=M['leg_l_pivot'])
    parts['legR'] = dict(img=cutout(N, m['leg_r'], close=3, solid=[M['leg_r_solid']]), pivot=M['leg_r_pivot'])
    order = ['tail', 'ear', 'legL', 'legR', 'stick', 'armLow', 'armHorn', 'clown', 'poop', 'core']
    bug = cutout(N, poly_mask(shape, M['bug']), lo=.06, hi=.17, close=3, min_area=30)
    if dbg is not None: dbg['monster'] = (N, None)
    return dict(name='monster', parts=parts, order=order, origin=M['feet'], scale=M['scale'], marks={}), bug


# ---------- the forest: drawings/zikit-3-trees.png ----------
TREES = dict(
    ground=[(0,500),(140,491),(270,484),(400,466),(520,452),(600,432),(800,403),(940,387),(1100,376),(1190,366),(1250,341),(1340,318),(1408,298)],
    pad_top=30,                                         # the photo cuts the top off the third tree's crown
    cap=(881, 27, 16),                                  # where that crown is rounded off again: x, half-width, height
    trees=dict(
        treeA=dict(poly=[(52,150),(60,108),(98,58),(140,56),(175,62),(200,54),(252,56),(288,108),(324,138),(334,180),(312,218),(274,230),(274,480),(266,508),(248,510),(232,506),(200,500),(190,524),(160,524),(140,498),(134,400),(134,240),(120,222),(70,214)], base=(205, 492)),
        treeB=dict(poly=[(356,218),(370,195),(393,180),(383,120),(408,86),(446,80),(470,106),(500,94),(538,102),(548,158),(592,168),(624,194),(622,228),(588,254),(532,262),(530,300),(517,362),(500,422),(490,458),(470,488),(440,488),(400,478),(380,464),(386,400),(393,330),(400,270),(368,258)], base=(440, 466)),
        treeC=dict(poly=[(728,100),(742,60),(770,36),(810,20),(848,-18),(915,-18),(930,30),(960,36),(990,60),(996,110),(972,160),(940,178),(946,260),(952,360),(950,424),(925,424),(905,400),(860,398),(820,392),(796,400),(792,300),(788,190),(770,150),(738,126)], base=(868, 398)),
        bush=dict(poly=[(1066,186),(1098,170),(1150,162),(1200,146),(1250,140),(1302,146),(1338,172),(1356,220),(1376,270),(1370,300),(1352,306),(1348,330),(1332,350),(1300,366),(1250,370),(1202,384),(1186,400),(1138,400),(1118,384),(1108,368),(1090,352),(1070,330),(1080,290),(1066,240)], base=(1210, 372)),
    ),
)

def build_forest(dbg):
    img = load('zikit-3-trees.png')
    N = normalize(img)
    T = TREES; pad = T['pad_top']
    # the pencil ground line runs through every trunk: rub it out, the game draws its own ground
    line = np.zeros(N.shape[:2], np.uint8)
    cv2.polylines(line, [np.array(T['ground'], np.int32)], False, 255, 11)
    inside = union(N.shape, [[(x, y) for x, y in t['poly']] for t in T['trees'].values()])
    d = np.clip(1 - N.min(2), 0, 1)
    grey = ((N.max(2) - N.min(2)) < .16) & (N.min(2) > .3)   # pencil: not brown marker, not the near-black green
    rub = ((line > 0) & (inside > .5) & grey & (d > .08)).astype(np.uint8) * 255
    rub = cv2.dilate(rub, np.ones((3, 3), np.uint8))
    N8 = cv2.inpaint(np.clip(N * 255, 0, 255).astype(np.uint8), rub, 6, cv2.INPAINT_TELEA)
    N = N8.astype(np.float32) / 255
    # give the third tree's crown its top back: mirror the rows under the cut edge into a rounded cap
    N = np.vstack([N[pad - 1::-1] if pad else N[:0], N])
    cx, hw, ch = T['cap']
    ys, xs = np.mgrid[0:N.shape[0], 0:N.shape[1]].astype(np.float32)
    cap = (((xs - cx) / hw) ** 2 + ((ys - pad) / ch) ** 2 <= 1) | (ys >= pad)
    N[~cap] = 1
    parts = {}
    for name, t in T['trees'].items():
        poly = [(x, y + pad) for x, y in t['poly']]
        parts[name] = dict(img=cutout(N, poly_mask(N.shape, poly), close=6, min_area=40), pivot=(t['base'][0], t['base'][1] + pad))
    if dbg is not None: dbg['forest'] = (N, None)
    return parts


# ---------- packing ----------
def pack(sprites, max_w):
    """Shelf-pack [(name, rgba)] tallest first; returns the atlas and {name: (x, y, w, h)}."""
    gap = 2; x = y = gap; row = 0; place = {}
    for name, im in sorted(sprites, key=lambda s: -s[1].shape[0]):
        h, w = im.shape[:2]
        if x + w + gap > max_w: x = gap; y += row + gap; row = 0
        place[name] = (x, y, w, h); x += w + gap; row = max(row, h)
    H = y + row + gap
    atlas = np.zeros((H, max_w, 4), np.float32)
    for name, im in sprites:
        px, py, w, h = place[name]; atlas[py:py + h, px:px + w] = im
    used = max(px + w for px, _, w, _ in place.values()) + gap
    return atlas[:, :used], place

def save_webp(path, rgba, quality=90):
    out = rgba.copy()
    out[..., :3] = out[..., :3] * PAPER                 # paper white becomes the game's paper
    a8 = np.clip(out * 255 + .5, 0, 255).astype(np.uint8)
    Image.fromarray(a8, 'RGBA').save(path, 'WEBP', quality=quality, method=6, alpha_quality=95)

def export(char, atlas_w):
    ox, oy = char['origin']; s = char['scale']; sprites = []; meta = {}
    for name, p in char['parts'].items():
        x0, y0, x1, y1 = bbox(p['img'][..., 3])
        im = resize_rgba(p['img'][y0:y1, x0:x1], s)
        sprites.append((name, im))
        meta[name] = dict(at=[round((x0 - ox) * s, 2), round((y0 - oy) * s, 2)],
                          pivot=[round((p['pivot'][0] - ox) * s, 2), round((p['pivot'][1] - oy) * s, 2)])
    atlas, place = pack(sprites, atlas_w)
    for name in meta: meta[name]['rect'] = list(place[name])
    marks = {k: [round((v[0] - ox) * s, 2), round((v[1] - oy) * s, 2)] for k, v in char.get('marks', {}).items()}
    return atlas, dict(parts=meta, order=char.get('order', list(meta)), marks=marks)

def checker(h, w, s=16):
    ys, xs = np.mgrid[0:h, 0:w]
    c = (((ys // s) + (xs // s)) % 2).astype(np.float32)
    return np.dstack([.55 + .12 * c, .62 + .12 * c, .78 + .1 * c])

def on_checker(rgba):
    a = rgba[..., 3:4]
    return rgba[..., :3] * a + checker(*rgba.shape[:2]) * (1 - a)

def save_png(path, rgb):
    Image.fromarray(np.clip(rgb * 255 + .5, 0, 255).astype(np.uint8)).save(path)

def assemble(rig, atlas):
    """Every piece back where it was cut from: must look like the drawing."""
    xs = [p['at'][0] for p in rig['parts'].values()] + [p['at'][0] + p['rect'][2] for p in rig['parts'].values()]
    ys = [p['at'][1] for p in rig['parts'].values()] + [p['at'][1] + p['rect'][3] for p in rig['parts'].values()]
    x0, y0 = int(np.floor(min(xs))), int(np.floor(min(ys)))
    W, H = int(np.ceil(max(xs))) - x0, int(np.ceil(max(ys))) - y0
    out = np.zeros((H, W, 4), np.float32)
    for name in rig['order']:
        p = rig['parts'][name]; ax, ay, w, h = p['rect']
        src = atlas[ay:ay + h, ax:ax + w]
        dx, dy = int(round(p['at'][0])) - x0, int(round(p['at'][1])) - y0
        dst = out[dy:dy + h, dx:dx + w]; a = src[..., 3:4]
        dst[..., :3] = src[..., :3] * a + dst[..., :3] * (1 - a)
        dst[..., 3:4] = a + dst[..., 3:4] * (1 - a)
    return out


NAMES = dict(
    chameleon=dict(body='body and head', tail='tail', legBack='back leg', legFront='front leg',
                   hair0='hair: root', hair1='hair: blue', hair2='hair: bend', hair3='hair: red tip'),
    monster=dict(core='body, face and horns', clown='the yellow clown', armHorn='arm and striped horn',
                 armLow='lower arm, bracelets', stick='walking stick', ear='elephant ear', tail='tail',
                 poop='the poop on her head', legL='left leg', legR='right leg'),
    forest=dict(treeA='tree 1', treeB='tree 2', treeC='tree 3 (top rounded off)', bush='tree 4, the bush', bug='the pencil bug'),
)

def contact_sheet(path, rig, atlases):
    """design/zikit-parts.webp: the page as drawn, and beside it every piece it was cut into."""
    from PIL import ImageDraw, ImageFont
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15); big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 19)
    except OSError: font = big = ImageFont.load_default()
    page = Image.open(DRAW / 'zikit-1-page.webp').convert('RGB')
    left = 560; page = page.resize((left, round(page.height * left / page.width)), Image.LANCZOS)
    cell, cols = 196, 6
    groups = [('The chameleon', 'chameleon'), ('The monster', 'monster'), ('The forest', 'forest')]
    rows = sum(-(-len(NAMES[g]) // cols) for _, g in groups)
    W = left + 40 + cols * cell + 20; H = max(page.height + 40, 30 + len(groups) * 34 + rows * (cell + 26))
    sheet = Image.new('RGB', (W, H), tuple(int(c * 255) for c in PAPER))
    sheet.paste(page, (20, 20))
    d = ImageDraw.Draw(sheet); y = 20
    for title, g in groups:
        d.text((left + 40, y), title, fill=(42, 33, 24), font=big); y += 30
        parts = rig[g].get('parts', rig[g]); atlas = atlases[g]
        for i, (name, label) in enumerate(NAMES[g].items()):
            ax, ay, w, h = parts[name]['rect']
            im = Image.fromarray(np.clip(atlas[ay:ay + h, ax:ax + w] * np.append(PAPER, 1) * 255 + .5, 0, 255).astype(np.uint8), 'RGBA')
            k = min((cell - 24) / w, (cell - 24) / h, 1.25)
            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            cx = left + 40 + (i % cols) * cell; cy = y + (i // cols) * (cell + 26)
            d.rounded_rectangle([cx + 2, cy + 2, cx + cell - 6, cy + cell - 6], 10, fill=(226, 232, 240))
            sheet.paste(im, (cx + (cell - 4 - im.width) // 2, cy + (cell - 4 - im.height) // 2), im)
            d.text((cx + 6, cy + cell - 4), label, fill=(60, 52, 44), font=font)
        y += -(-len(NAMES[g]) // cols) * (cell + 26) + 8
    sheet.save(path, 'WEBP', quality=86, method=6)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--debug', help='also write preview PNGs into this folder')
    args = ap.parse_args()
    dbg = {} if args.debug else None
    OUT.mkdir(parents=True, exist_ok=True)
    rig = {}
    cham = build_chameleon(dbg)
    atlas_c, rig['chameleon'] = export(cham, 760)
    save_webp(OUT / 'chameleon.webp', atlas_c)
    mon, bug = build_monster(dbg)
    atlas_m, rig['monster'] = export(mon, 1500)
    save_webp(OUT / 'monster.webp', atlas_m, quality=88)
    forest = build_forest(dbg)
    forest['bug'] = dict(img=bug, pivot=(155, 962))
    sprites = []; fmeta = {}
    for name, p in forest.items():
        x0, y0, x1, y1 = bbox(p['img'][..., 3])
        sprites.append((name, p['img'][y0:y1, x0:x1]))
        fmeta[name] = dict(pivot=[round(p['pivot'][0] - x0, 2), round(p['pivot'][1] - y0, 2)])   # where it stands
    atlas_f, place = pack(sprites, 1100)
    for name in fmeta: fmeta[name]['rect'] = list(place[name])
    save_webp(OUT / 'forest.webp', atlas_f)
    rig['forest'] = fmeta
    (ROOT / 'src' / 'zikit-rig.json').write_text(json.dumps(rig, separators=(',', ':')) + '\n')
    contact_sheet(ROOT / 'design' / 'zikit-parts.webp', rig, dict(chameleon=atlas_c, monster=atlas_m, forest=atlas_f))
    for f in sorted(OUT.glob('*.webp')) + [ROOT / 'design' / 'zikit-parts.webp']: print(f.relative_to(ROOT), f.stat().st_size // 1024, 'KB', Image.open(f).size)
    if args.debug:
        D = Path(args.debug); D.mkdir(parents=True, exist_ok=True)
        for name, atlas in [('chameleon', atlas_c), ('monster', atlas_m), ('forest', atlas_f)]:
            save_png(D / f'atlas-{name}.png', on_checker(atlas))
        for name, atlas in [('chameleon', atlas_c), ('monster', atlas_m)]:
            save_png(D / f'assembled-{name}.png', on_checker(assemble(rig[name], atlas)))
            np.save(D / f'atlas-{name}.npy', atlas)
        for name, (N, _) in dbg.items(): save_png(D / f'normalized-{name}.png', np.clip(N, 0, 1))

if __name__ == '__main__':
    main()
