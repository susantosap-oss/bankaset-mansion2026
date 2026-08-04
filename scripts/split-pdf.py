#!/usr/bin/env python3
"""
split-pdf.py — Split PDF besar menjadi chunk ≤40MB untuk diupload manual ke Gemini AI Studio.

Setelah split, script mencetak prompt siap-pakai yang bisa langsung dicopy ke Gemini.

Kebutuhan:
  pip install pypdf

Usage (interaktif — pilih file dari folder default):
  python scripts/split-pdf.py

Usage (path langsung):
  python scripts/split-pdf.py "D:\\Data AsetBank\\BRI_lelang.pdf"
  python scripts/split-pdf.py "D:\\Data AsetBank\\BRI_lelang.pdf" --label AYDA --max-mb 30

Label yang tersedia: CASSIE | LELANG | AYDA  (default: LELANG)

Folder default PDF : D:\\Data AsetBank  (atau set PDF_FOLDER di .env.local)
Hasil chunk        : <folder_pdf>\\<nama_pdf>_chunks\\
"""

import sys
import os
import math

# ── Install check ─────────────────────────────────────────────────────────────
try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    print("Error: pypdf belum terinstal.")
    print("Jalankan:  pip install pypdf")
    sys.exit(1)

# ── Default folder ─────────────────────────────────────────────────────────────
DEFAULT_PDF_FOLDER = r"D:\Data AsetBank"

# ── Baca PDF_FOLDER dari .env.local jika ada ─────────────────────────────────
def load_env_local() -> dict:
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    env = {}
    if os.path.isfile(env_path):
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' not in line:
                    continue
                key, _, val = line.partition('=')
                env[key.strip()] = val.strip()
    return env

# ── Prompt Gemini ─────────────────────────────────────────────────────────────
GEMINI_PROMPT = """\
Baca seluruh dokumen PDF ini dari awal sampai akhir.
Tugas: Cari dan ekstrak SEMUA data aset/properti/listing yang ada dalam dokumen ini. \
Ambil setiap entitas yang terdaftar tanpa ada yang terlewat. Setiap baris tabel = 1 aset.

Kembalikan HANYA JSON valid dengan format: {"assets": [...]}
Jika tidak ada data, kembalikan: {"assets": []}

Setiap objek aset harus memiliki field berikut (gunakan 0 atau "" jika tidak ada di dokumen):
- assetType   : kategori properti (RUMAH/LAHAN/RUKO/GUDANG/PABRIK/APARTEMEN/KANTOR/OTHER)
- city        : nama kota atau kabupaten dalam huruf kecil
- district    : nama kecamatan
- area        : nama kelurahan atau desa
- address     : alamat lengkap properti
- marketValue : nilai pasar atau NJOP dalam rupiah (integer)
- outstanding : baki debet atau total kewajiban dalam rupiah (integer)
- landArea    : luas tanah dalam m2 (angka)
- buildingArea: luas bangunan dalam m2 (angka)
- debtorName  : nama debitur atau pemilik
- principalOutstanding: pokok kredit dalam rupiah (integer)
- liquidationValue    : nilai likuidasi dalam rupiah (integer)
- limitPrice  : harga limit / harga dasar lelang / nilai jual AYDA dalam rupiah (integer)\
"""

# ── Pilih PDF dari folder secara interaktif ───────────────────────────────────
def pick_pdf_from_folder(folder: str) -> str:
    if not os.path.isdir(folder):
        print(f"Error: Folder tidak ditemukan: {folder}")
        print("Set PDF_FOLDER di .env.local atau berikan path file langsung.")
        sys.exit(1)

    files = sorted(f for f in os.listdir(folder) if f.lower().endswith('.pdf'))
    if not files:
        print(f"Error: Tidak ada file PDF di: {folder}")
        sys.exit(1)

    if len(files) == 1:
        path = os.path.join(folder, files[0])
        print(f"  → Auto-pilih: {files[0]}")
        return path

    print(f"\nFile PDF di {folder}:")
    for i, f in enumerate(files, 1):
        size_mb = os.path.getsize(os.path.join(folder, f)) / 1024 / 1024
        print(f"  [{i}] {f}  ({size_mb:.1f} MB)")
    print()

    while True:
        try:
            choice = input("Pilih nomor file: ").strip()
            idx = int(choice) - 1
            if 0 <= idx < len(files):
                return os.path.join(folder, files[idx])
        except (ValueError, KeyboardInterrupt):
            pass
        print("Pilihan tidak valid, coba lagi.")

# ── Tanya label interaktif ────────────────────────────────────────────────────
def pick_label() -> str:
    print("\nLabel Asset:")
    print("  1  LELANG  (Harga Limit = dari dokumen - Harga Lelang)")
    print("  2  CASSIE  (Harga Limit = Outstanding)")
    print("  3  AYDA    (Harga Limit = dari dokumen - Nilai Jual AYDA)")
    print()
    options = {'1': 'LELANG', '2': 'CASSIE', '3': 'AYDA'}
    while True:
        try:
            choice = input("Pilih 1, 2, atau 3 [default 1]: ").strip() or '1'
            if choice in options:
                return options[choice]
        except KeyboardInterrupt:
            sys.exit(0)
        print("Pilihan tidak valid.")

# ── Split PDF ─────────────────────────────────────────────────────────────────
def split_pdf(pdf_path: str, max_mb: float) -> list:
    size_mb = os.path.getsize(pdf_path) / 1024 / 1024
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    pdf_dir   = os.path.dirname(os.path.abspath(pdf_path))
    out_dir   = os.path.join(pdf_dir, base_name + "_chunks")

    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)

    print(f"\nFile    : {pdf_path}")
    print(f"Ukuran  : {size_mb:.1f} MB")
    print(f"Halaman : {total_pages}")

    if size_mb <= max_mb:
        print(f"Ukuran ≤ {max_mb} MB — tidak perlu dipecah.")
        print(f"Folder  : {pdf_dir}")
        return [pdf_path]

    num_chunks = math.ceil(size_mb / max_mb)
    pages_per_chunk = math.ceil(total_pages / num_chunks)
    os.makedirs(out_dir, exist_ok=True)

    print(f"Target  : ≤{max_mb} MB per chunk → {num_chunks} chunk")
    print(f"Output  : {out_dir}\n")

    output_paths = []
    actual = 0
    for i in range(num_chunks):
        start = i * pages_per_chunk
        end   = min(start + pages_per_chunk, total_pages)
        if start >= total_pages:
            break

        writer = PdfWriter()
        for pi in range(start, end):
            writer.add_page(reader.pages[pi])

        actual += 1
        chunk_name = f"{base_name}_chunk{actual}of{num_chunks}.pdf"
        chunk_path = os.path.join(out_dir, chunk_name)
        with open(chunk_path, "wb") as f:
            writer.write(f)

        cs = os.path.getsize(chunk_path) / 1024 / 1024
        print(f"  Chunk {actual}/{num_chunks}: hal. {start+1}–{end} "
              f"({end-start} hal.) | {cs:.1f} MB  →  {chunk_name}")
        output_paths.append(chunk_path)

    return output_paths

# ── Print instruksi + prompt ──────────────────────────────────────────────────
def print_instructions(paths: list, label: str):
    total    = len(paths)
    is_split = total > 1
    sep = "═" * 64

    print(f"\n{sep}")
    print("  SELESAI")
    print(sep)

    if is_split:
        print(f"\n  {total} chunk tersimpan di:")
        chunk_dir = os.path.dirname(paths[0])
        print(f"  {chunk_dir}")
        print(f"\n  Proses 1 chunk per sesi Gemini AI Studio.")
    else:
        print(f"\n  File siap diupload (tidak perlu dipecah):")
        print(f"  {paths[0]}")

    print(f"\n  Label  : {label}")
    label_hint = {
        'LELANG': 'Harga Limit dari dokumen (Harga Lelang)',
        'CASSIE': 'Harga Limit = Outstanding',
        'AYDA'  : 'Harga Limit dari dokumen (Nilai Jual AYDA)',
    }
    print(f"  Catatan: {label_hint.get(label, '')}")

    print(f"\n{sep}")
    print("  PROMPT GEMINI  ── copy semua teks di bawah ini")
    print(sep)
    print()
    print(GEMINI_PROMPT)
    print()
    print(sep)
    print("  LANGKAH-LANGKAH DI GEMINI AI STUDIO")
    print(sep)
    steps = [
        "Buka  https://aistudio.google.com/",
        "Klik  [+ New prompt]",
        "Model : Gemini 2.0 Flash  (atau 1.5 Flash)",
        "Klik ikon lampiran (📎) → upload 1 file PDF/chunk",
    ]
    if is_split:
        for idx, p in enumerate(paths, 1):
            steps.append(f"        Chunk {idx}: {os.path.basename(p)}")
    else:
        steps.append(f"        File: {os.path.basename(paths[0])}")
    steps += [
        "Paste prompt di atas ke kolom teks → klik [Run]",
        'Copy seluruh hasil JSON  (format: {"assets": [...]})',
        "Simpan sebagai file .json  (mis: chunk1.json, chunk2.json)",
    ]
    if is_split:
        steps.append(f"Ulangi langkah 4–7 untuk setiap chunk ({total} chunk total)")
    steps += [
        "",
        "Di aplikasi → halaman PDF Import:",
        f"  • Mode: Import JSON  |  Label: {label}",
        "  • Upload .json → Proses JSON → Simpan Asset",
    ]
    if is_split:
        steps.append("  • Ulangi untuk setiap file chunk")

    for i, s in enumerate(steps, 1):
        if s == "":
            print()
        elif s.startswith(" "):
            print(f"       {s}")
        else:
            print(f"  {i:2d}. {s}")

    print(f"\n{sep}\n")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Split PDF → chunk ≤40MB + prompt Gemini siap pakai",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Contoh:\n"
            "  python scripts/split-pdf.py\n"
            "  python scripts/split-pdf.py \"D:\\Data AsetBank\\BRI.pdf\"\n"
            "  python scripts/split-pdf.py \"D:\\Data AsetBank\\BRI.pdf\" --label AYDA\n"
        )
    )
    parser.add_argument(
        "pdf", nargs="?", default=None,
        help="Path file PDF (opsional — jika kosong akan tampil daftar pilihan)"
    )
    parser.add_argument(
        "--max-mb", type=float, default=40.0,
        help="Ukuran maksimal per chunk dalam MB (default: 40)"
    )
    parser.add_argument(
        "--label", choices=["CASSIE", "LELANG", "AYDA"], default=None,
        help="Label asset: CASSIE / LELANG / AYDA (default: tanya interaktif)"
    )
    args = parser.parse_args()

    # Resolve PDF path
    if args.pdf:
        pdf_path = os.path.abspath(args.pdf)
        if not os.path.isfile(pdf_path):
            print(f"Error: File tidak ditemukan: {pdf_path}")
            sys.exit(1)
    else:
        env = load_env_local()
        folder = env.get("PDF_FOLDER", DEFAULT_PDF_FOLDER)
        print(f"\nFolder PDF : {folder}")
        pdf_path = pick_pdf_from_folder(folder)

    # Resolve label
    label = args.label if args.label else pick_label()

    print(f"\nLabel  : {label}")

    output_paths = split_pdf(pdf_path, args.max_mb)
    print_instructions(output_paths, label)


if __name__ == "__main__":
    main()
