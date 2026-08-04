@echo off
setlocal enabledelayedexpansion
title Bankaset - Import PDF

echo.
echo =====================================================
echo   Bankaset Mansion 2026 - Import PDF ke Asset Engine
echo =====================================================
echo.

:: Cek Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js tidak ditemukan. Install dari https://nodejs.org
  pause
  exit /b 1
)

:: Default folder
set "DEFAULT_FOLDER=D:\Data AsetBank"
set "PDF_PATH="

:: PDF Path dari drag-and-drop atau input manual
if not "%~1"=="" (
  set "PDF_PATH=%~1"
  echo Input : !PDF_PATH!
  goto cek_path
)

:: Tidak ada drag-and-drop — cek apakah DEFAULT_FOLDER punya file PDF
set "PDF_COUNT=0"
for %%F in ("!DEFAULT_FOLDER!\*.pdf") do set /a PDF_COUNT+=1

if !PDF_COUNT!==0 (
  echo Drag folder/file PDF ke icon ini, atau ketik path di bawah.
  echo Default [Enter] : !DEFAULT_FOLDER!
  echo.
  set /p "PDF_PATH=Path PDF/Folder : "
  if "!PDF_PATH!"=="" set "PDF_PATH=!DEFAULT_FOLDER!"
  goto cek_path
)

if !PDF_COUNT!==1 (
  for %%F in ("!DEFAULT_FOLDER!\*.pdf") do set "PDF_PATH=%%F"
  echo Auto-pilih : !PDF_PATH!
  goto cek_bank
)

:: Ada beberapa PDF — tampilkan daftar pilihan
echo File PDF di !DEFAULT_FOLDER!:
echo.
set "IDX=0"
for %%F in ("!DEFAULT_FOLDER!\*.pdf") do (
  set /a IDX+=1
  set "FILE_!IDX!=%%F"
  echo   [!IDX!] %%~nxF
)
echo.
set /p "PICK=Pilih nomor file [1-!IDX!] : "

if "!PICK!"=="" (
  echo Pilihan tidak valid.
  pause
  exit /b 1
)
set "PDF_PATH=!FILE_%PICK%!"
if "!PDF_PATH!"=="" (
  echo Nomor tidak valid.
  pause
  exit /b 1
)
echo Dipilih : !PDF_PATH!
goto cek_bank

:cek_path
if "!PDF_PATH!"=="" (
  echo Path tidak boleh kosong.
  pause
  exit /b 1
)

:: Cek apakah path adalah folder
if exist "!PDF_PATH!\" (
  echo Folder : !PDF_PATH!
  goto cek_bank
)
if exist "!PDF_PATH!" (
  echo File   : !PDF_PATH!
  goto cek_bank
)
echo Path tidak ditemukan: !PDF_PATH!
pause
exit /b 1

:cek_bank
echo.
set /p "BANK_NAME=Nama Bank  : "
if "!BANK_NAME!"=="" (
  echo Nama bank tidak boleh kosong.
  pause
  exit /b 1
)

echo.
echo Label Asset:
echo   1  LELANG  (Harga Limit = dari dokumen - Harga Lelang)
echo   2  CASSIE  (Harga Limit = Outstanding)
echo   3  AYDA    (Harga Limit = dari dokumen - Nilai Jual AYDA)
echo.

:pilih_label
set /p "LABEL_CHOICE=Pilih 1, 2, atau 3 : "
if "!LABEL_CHOICE!"=="1" ( set "LABEL=LELANG" & goto mulai )
if "!LABEL_CHOICE!"=="2" ( set "LABEL=CASSIE" & goto mulai )
if "!LABEL_CHOICE!"=="3" ( set "LABEL=AYDA"   & goto mulai )
echo Pilihan tidak valid, ketik 1, 2, atau 3.
goto pilih_label

:mulai
echo.
echo =====================================================
echo   Memulai ekstraksi... jangan tutup window ini
echo =====================================================
echo.

:: Cek apakah path adalah folder (untuk batch processing)
if exist "!PDF_PATH!\" (
  set "COUNT=0"
  for %%F in ("!PDF_PATH!\*.pdf") do (
    echo [%%~nxF]
    node "%~dp0scripts\extract-pdf.js" "%%F" "!BANK_NAME!" !LABEL!
    set /a COUNT+=1
  )
  echo.
  echo Selesai memproses !COUNT! file PDF dari folder.
) else (
  node "%~dp0scripts\extract-pdf.js" "!PDF_PATH!" "!BANK_NAME!" !LABEL!
)

echo.
echo =====================================================
echo   Selesai. Tekan tombol apapun untuk tutup.
echo =====================================================
pause >nul
