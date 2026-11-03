"""vbaProject.bin schrijven zonder Excel: VBA-broncode in een OLE-bestand volgens MS-OVBA en MS-CFB.

Er staat alleen broncode in, geen gecompileerde p-code: `_VBA_PROJECT` heeft versie 0xFFFF, zodat Excel de modules bij
het openen opnieuw compileert. Gebruikt door scripts/build-opsplitsing-excel.py.

    from vbaproject import vba_project_bin
    data = vba_project_bin(modules=[("OpsplitsingModel", source)], documents=["ThisWorkbook", "Sheet1"])
"""

import random
import struct
import uuid

CODEPAGE = 1252
WORKBOOK_BASE = "0{00020819-0000-0000-C000-000000000046}"
SHEET_BASE = "0{00020820-0000-0000-C000-000000000046}"


# ---------------------------------------------------------------- MS-OVBA 2.4.1: compressie

def compress(data: bytes) -> bytes:
    """CompressedContainer: signatuurbyte 0x01 en chunks van hooguit 4096 bytes, met kopieertokens waar dat loont."""
    out = bytearray(b"\x01")
    for start in range(0, len(data), 4096):
        chunk = data[start:start + 4096]
        body = _compress_chunk(chunk)
        if len(chunk) == 4096 and len(body) >= 4096:
            # Ongecomprimeerde chunk: altijd precies 4096 bytes.
            body = chunk
            header = (4096 + 2 - 3) | (0b011 << 12)
        elif len(body) + 2 > 4098:
            raise ValueError("Laatste chunk comprimeert niet onder 4098 bytes.")   # komt bij broncode niet voor
        else:
            header = (len(body) + 2 - 3) | (0b011 << 12) | 0x8000
        out += struct.pack("<H", header) + body
    return bytes(out)


def _compress_chunk(chunk: bytes) -> bytes:
    out = bytearray()
    pos = 0
    index = {}   # drie bytes -> laatste posities, om overeenkomsten snel te vinden
    while pos < len(chunk):
        flag_at = len(out)
        out.append(0)
        flags = 0
        for bit in range(8):
            if pos >= len(chunk):
                break
            offset, length = _match(chunk, pos, index)
            if length >= 3:
                bit_count = max((pos - 1).bit_length(), 4)
                length_bits = 16 - bit_count
                token = ((offset - 1) << length_bits) | (length - 3)
                out += struct.pack("<H", token)
                flags |= 1 << bit
                for p in range(pos, pos + length):
                    _remember(chunk, p, index)
                pos += length
            else:
                out.append(chunk[pos])
                _remember(chunk, pos, index)
                pos += 1
        out[flag_at] = flags
    return bytes(out)


def _remember(chunk: bytes, p: int, index: dict) -> None:
    if p + 3 <= len(chunk):
        index.setdefault(chunk[p:p + 3], []).append(p)


def _match(chunk: bytes, pos: int, index: dict) -> tuple[int, int]:
    if pos == 0 or pos + 3 > len(chunk):
        return 0, 0
    bit_count = max((pos - 1).bit_length(), 4)
    max_length = (0xFFFF >> bit_count) + 3
    max_offset = 1 << bit_count
    best_len, best_off = 0, 0
    for candidate in reversed(index.get(chunk[pos:pos + 3], [])[-64:]):
        offset = pos - candidate
        if offset > max_offset:
            break
        length = 0
        while length < max_length and pos + length < len(chunk) and chunk[candidate + length] == chunk[pos + length]:
            length += 1
        if length > best_len:
            best_len, best_off = length, offset
            if length == max_length:
                break
    return best_off, best_len


def decompress(data: bytes) -> bytes:
    """Omgekeerde van compress(), voor de controle in de tests."""
    assert data[0] == 1
    out = bytearray()
    pos = 1
    while pos < len(data):
        header = struct.unpack_from("<H", data, pos)[0]
        size = (header & 0x0FFF) + 3
        end = pos + size
        pos += 2
        start = len(out)
        if not header & 0x8000:
            out += data[pos:pos + 4096]
            pos += 4096
            continue
        while pos < end:
            flags = data[pos]
            pos += 1
            for bit in range(8):
                if pos >= end:
                    break
                if flags >> bit & 1:
                    token = struct.unpack_from("<H", data, pos)[0]
                    pos += 2
                    bit_count = max((len(out) - start - 1).bit_length(), 4)
                    length = (token & (0xFFFF >> bit_count)) + 3
                    offset = (token >> (16 - bit_count)) + 1
                    for _ in range(length):
                        out.append(out[-offset])
                else:
                    out.append(data[pos])
                    pos += 1
    return bytes(out)


# ---------------------------------------------------------------- MS-OVBA 2.4.3: CMG, DPB en GC in de PROJECT-stream

def encrypt(project_id: str, data: bytes, rng: random.Random) -> str:
    seed = rng.randrange(256)
    version = 2
    key = sum(project_id.encode("ascii")) & 0xFF
    out = bytearray([seed, seed ^ version, seed ^ key])
    unencrypted1, encrypted1, encrypted2 = key, seed ^ key, seed ^ version

    def push(byte):
        nonlocal unencrypted1, encrypted1, encrypted2
        enc = byte ^ ((encrypted2 + unencrypted1) & 0xFF)
        out.append(enc)
        encrypted2, encrypted1, unencrypted1 = encrypted1, enc, byte

    for _ in range((seed & 6) // 2):
        push(rng.randrange(256))
    for byte in struct.pack("<I", len(data)) + data:
        push(byte)
    return out.hex().upper()


def decrypt(project_id: str, text: str) -> bytes:
    raw = bytes.fromhex(text)
    seed, version_enc, key_enc = raw[0], raw[1], raw[2]
    assert seed ^ version_enc == 2 and seed ^ key_enc == sum(project_id.encode("ascii")) & 0xFF
    unencrypted1, encrypted1, encrypted2 = seed ^ key_enc, key_enc, version_enc
    plain = []
    for enc in raw[3:]:
        byte = enc ^ ((encrypted2 + unencrypted1) & 0xFF)
        plain.append(byte)
        encrypted2, encrypted1, unencrypted1 = encrypted1, enc, byte
    ignored = (seed & 6) // 2
    length = struct.unpack("<I", bytes(plain[ignored:ignored + 4]))[0]
    return bytes(plain[ignored + 4:ignored + 4 + length])


# ---------------------------------------------------------------- MS-OVBA 2.3.4.2: dir-stream

def _record(rid: int, payload: bytes) -> bytes:
    return struct.pack("<HI", rid, len(payload)) + payload


def _mbcs(text: str) -> bytes:
    return text.encode("cp1252")


def _dir_stream(project_name: str, modules: list[tuple[str, int]]) -> bytes:
    d = bytearray()
    d += _record(0x0001, struct.pack("<I", 1))                        # SYSKIND: Win32
    d += _record(0x0002, struct.pack("<I", 0x0409))                   # LCID
    d += _record(0x0014, struct.pack("<I", 0x0409))                   # LCIDINVOKE
    d += _record(0x0003, struct.pack("<H", CODEPAGE))                 # CODEPAGE
    d += _record(0x0004, _mbcs(project_name))                         # NAME
    d += _record(0x0005, b"") + _record(0x0040, b"")                  # DOCSTRING
    d += _record(0x0006, b"") + _record(0x003D, b"")                  # HELPFILEPATH
    d += _record(0x0007, struct.pack("<I", 0))                        # HELPCONTEXT
    d += _record(0x0008, struct.pack("<I", 0))                        # LIBFLAGS
    d += struct.pack("<HIIH", 0x0009, 4, 1, 0)                        # VERSION: Reserved = 4, major, minor
    d += _record(0x000C, b"") + _record(0x003C, b"")                  # CONSTANTS
    # Verwijzing naar OLE Automation, zoals elk door Excel gemaakt project.
    libid = _mbcs("*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\System32\\stdole2.tlb#OLE Automation")
    d += _record(0x0016, b"stdole") + _record(0x003E, "stdole".encode("utf-16-le"))
    d += _record(0x000D, struct.pack("<I", len(libid)) + libid + struct.pack("<IH", 0, 0))
    d += _record(0x000F, struct.pack("<H", len(modules)))             # PROJECTMODULES
    d += _record(0x0013, struct.pack("<H", 0xFFFF))                   # PROJECTCOOKIE
    for name, kind in modules:
        d += _record(0x0019, _mbcs(name))
        d += _record(0x0047, name.encode("utf-16-le"))
        d += _record(0x001A, _mbcs(name)) + _record(0x0032, name.encode("utf-16-le"))
        d += _record(0x001C, b"") + _record(0x0048, b"")
        d += _record(0x0031, struct.pack("<I", 0))                    # MODULEOFFSET: broncode vanaf het begin
        d += _record(0x001E, struct.pack("<I", 0))
        d += _record(0x002C, struct.pack("<H", 0xFFFF))
        d += _record(kind, b"")                                       # 0x0021 standaardmodule, 0x0022 document
        d += _record(0x002B, b"")                                     # einde module
    d += _record(0x0010, b"")                                         # einde dir
    return bytes(d)


# ---------------------------------------------------------------- MS-CFB: OLE-bestand

FREESECT, ENDOFCHAIN, FATSECT, NOSTREAM = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD, 0xFFFFFFFF
SECTOR, MINI, CUTOFF = 512, 64, 4096


class _Entry:
    def __init__(self, name, kind, data=b""):
        self.name, self.kind, self.data = name, kind, data   # kind: 1 storage, 2 stream, 5 root
        self.children = []
        self.left = self.right = self.child = NOSTREAM
        self.start, self.size = ENDOFCHAIN, 0


def _key(entry):
    return (len(entry.name), entry.name.upper())


def compound_file(tree: dict) -> bytes:
    """tree: {naam: bytes (stream) of dict (storage)}. Kinderen als gesorteerde keten van rechterbroers (geldige boom)."""
    entries = [_Entry("Root Entry", 5)]

    def add(parent, items):
        for name, value in items.items():
            entry = _Entry(name, 1 if isinstance(value, dict) else 2, b"" if isinstance(value, dict) else value)
            entries.append(entry)
            parent.children.append(len(entries) - 1)
            if isinstance(value, dict):
                add(entry, value)

    add(entries[0], tree)
    for entry in entries:
        order = sorted(entry.children, key=lambda i: _key(entries[i]))
        if order:
            # Middelste als wortel, links en rechts als ketens: geldig en ondiep genoeg.
            mid = len(order) // 2
            entry.child = order[mid]
            for a, b in zip(order[:mid], order[1:mid]):
                entries[b].left = a
            if mid:
                entries[order[mid]].left = order[mid - 1]
            for a, b in zip(order[mid:], order[mid + 1:]):
                entries[a].right = b

    # Kleine streams in de ministream, grote in gewone sectoren.
    mini, mini_fat = bytearray(), []
    big = []
    for entry in entries[1:]:
        if entry.kind != 2:
            continue
        entry.size = len(entry.data)
        if entry.size == 0:
            entry.start = ENDOFCHAIN
        elif entry.size < CUTOFF:
            first = len(mini) // MINI
            count = -(-entry.size // MINI)
            entry.start = first
            mini_fat += [first + i + 1 for i in range(count - 1)] + [ENDOFCHAIN]
            mini += entry.data + b"\x00" * (count * MINI - entry.size)
        else:
            big.append(entry)

    sectors, fat = [], []

    def place(data: bytes) -> int:
        if not data:
            return ENDOFCHAIN
        first = len(sectors)
        count = -(-len(data) // SECTOR)
        for i in range(count):
            sectors.append(data[i * SECTOR:(i + 1) * SECTOR].ljust(SECTOR, b"\x00"))
            fat.append(first + i + 1 if i < count - 1 else ENDOFCHAIN)
        return first

    for entry in big:
        entry.start = place(entry.data)
    root = entries[0]
    root.start, root.size = place(bytes(mini)), len(mini)
    mini_fat_bytes = b"".join(struct.pack("<I", v) for v in mini_fat)
    mini_fat_bytes += struct.pack("<I", FREESECT) * ((-len(mini_fat)) % (SECTOR // 4))
    mini_fat_start = place(mini_fat_bytes) if mini_fat else ENDOFCHAIN
    mini_fat_sectors = len(mini_fat_bytes) // SECTOR if mini_fat else 0

    def dir_entry(e: _Entry) -> bytes:
        name = e.name.encode("utf-16-le") + b"\x00\x00"
        return (name.ljust(64, b"\x00") + struct.pack("<HBB", len(name), e.kind, 1)   # kleur: zwart
                + struct.pack("<III", e.left, e.right, e.child) + b"\x00" * 16 + struct.pack("<I", 0)
                + b"\x00" * 16 + struct.pack("<IIII", e.start, e.size & 0xFFFFFFFF, 0, 0)[:8] + struct.pack("<I", 0))

    directory = b"".join(dir_entry(e) for e in entries)
    directory += b"\x00" * ((-len(directory)) % SECTOR)
    # Lege directory-plaatsen: naam leeg, alle verwijzingen NOSTREAM.
    empty = b"\x00" * 64 + struct.pack("<HBB", 0, 0, 0) + struct.pack("<III", NOSTREAM, NOSTREAM, NOSTREAM) + b"\x00" * 48
    directory = directory[:len(entries) * 128] + empty * ((len(directory) - len(entries) * 128) // 128)
    dir_start = place(directory)

    # FAT-sectoren zelf: groei tot alles past (109 in de kop is ruim genoeg voor deze bestanden).
    fat_count = 1
    while (len(fat) + fat_count) > fat_count * (SECTOR // 4):
        fat_count += 1
    assert fat_count <= 109
    fat_start = len(sectors)
    fat += [FATSECT] * fat_count
    fat += [FREESECT] * (fat_count * (SECTOR // 4) - len(fat))
    fat_bytes = b"".join(struct.pack("<I", v) for v in fat)
    for i in range(fat_count):
        sectors.append(fat_bytes[i * SECTOR:(i + 1) * SECTOR])
    difat = [fat_start + i for i in range(fat_count)] + [FREESECT] * (109 - fat_count)

    header = (bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 16 + struct.pack("<HHHHH", 0x003E, 0x0003, 0xFFFE, 9, 6)
              + b"\x00" * 6 + struct.pack("<IIIIIIIII", 0, fat_count, dir_start, 0, CUTOFF, mini_fat_start, mini_fat_sectors,
                                          ENDOFCHAIN, 0)
              + b"".join(struct.pack("<I", v) for v in difat))
    assert len(header) == SECTOR
    return header + b"".join(sectors)


# ---------------------------------------------------------------- vbaProject.bin

def vba_project_bin(modules: list[tuple[str, str]], documents: list[str], project_name: str = "VBAProject",
                    seed: int = 0) -> bytes:
    """modules: (naam, broncode) van standaardmodules; documents: ThisWorkbook en de werkbladnamen van VBA (Sheet1, ...).

    De broncode van een standaardmodule begint met Attribute VB_Name; regels worden CRLF, tekens cp1252."""
    rng = random.Random(seed)
    project_id = "{" + str(uuid.UUID(int=rng.getrandbits(128))).upper() + "}"
    sources = []
    for name in documents:
        base = WORKBOOK_BASE if name == "ThisWorkbook" else SHEET_BASE
        sources.append((name, 0x0022, "\n".join([
            f'Attribute VB_Name = "{name}"', f'Attribute VB_Base = "{base}"', "Attribute VB_GlobalNameSpace = False",
            "Attribute VB_Creatable = False", "Attribute VB_PredeclaredId = True", "Attribute VB_Exposed = True",
            "Attribute VB_TemplateDerived = False", "Attribute VB_Customizable = True", ""])))
    for name, source in modules:
        if not source.lstrip().startswith(f'Attribute VB_Name = "{name}"'):
            raise ValueError(f"Module {name} moet beginnen met Attribute VB_Name = \"{name}\".")
        sources.append((name, 0x0021, source))
    vba = {"_VBA_PROJECT": b"\xCC\x61\xFF\xFF\x00\x00\x00",
           "dir": compress(_dir_stream(project_name, [(n, k) for n, k, _ in sources]))}
    for name, _, source in sources:
        text = source.replace("\r\n", "\n").replace("\n", "\r\n")
        vba[name] = compress(text.encode("cp1252"))   # UnicodeEncodeError: teken buiten cp1252 in de VBA-bron
    lines = [f'ID="{project_id}"']
    lines += [f"Document={name}/&H00000000" for name, kind, _ in sources if kind == 0x0022]
    lines += [f"Module={name}" for name, kind, _ in sources if kind == 0x0021]
    lines += [f'Name="{project_name}"', 'HelpContextID="0"', 'VersionCompatible32="393222000"',
              f'CMG="{encrypt(project_id, struct.pack("<I", 0), rng)}"',
              f'DPB="{encrypt(project_id, bytes([0]), rng)}"',
              f'GC="{encrypt(project_id, bytes([0xFF]), rng)}"', "",
              "[Host Extender Info]", "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000", "",
              "[Workspace]"] + [f"{name}=0, 0, 0, 0, C" for name, _, _ in sources]
    project = ("\r\n".join(lines) + "\r\n").encode("cp1252")
    projectwm = b"".join(_mbcs(name) + b"\x00" + name.encode("utf-16-le") + b"\x00\x00" for name, _, _ in sources) + b"\x00\x00"
    return compound_file({"PROJECT": project, "PROJECTwm": projectwm, "VBA": vba})
