@echo off
setlocal enabledelayedexpansion
title Bankaset - Split PDF

echo.
echo =====================================================
echo   Bankaset — Split PDF untuk Gemini AI Studio
echo   (Tanpa API - murni lokal, nol biaya)
echo =====================================================
echo.

:: ── Cek Python ───────────────────────────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python tidak ditemukan.
  echo         Install dari https://www.python.org/downloads/
  echo         Centang "Add Python to PATH" saat install.
  pause
  exit /b 1
)

:: ── Cek pypdf ────────────────────────────────────────────────────────────────
python -c "import pypdf" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Library pypdf belum terinstal. Menginstall sekarang...
  echo.
  pip install pypdf
  if errorlevel 1 (
    echo [ERROR] Gagal install pypdf. Jalankan manual: pip install pypdf
    pause
    exit /b 1
  )
  echo.
)

:: ── Resolve PDF path (dari drag-drop atau interaktif) ────────────────────────
set "PDF_PATH=%~1"

if not "!PDF_PATH!"=="" (
  echo File  : !PDF_PATH!
  echo.
  python "%~dp0scripts\split-pdf.py" "!PDF_PATH!"
) else (
  python "%~dp0scripts\split-pdf.py"
)

echo.
echo =====================================================
echo   Selesai. Tekan tombol apapun untuk tutup.
echo =====================================================
pause >nul
