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
set "IS_FOLDER=0"
set "PDF_PATH="

:: PDF Path: dari drag-and-drop, folder, atau file tunggal
if not "%~1"=="" (
  set "PDF_PATH=%~1"
  echo Input : !PDF_PATH!
) else (
  echo Drag folder/file PDF ke icon ini, atau ketik path di bawah.
  echo Default [Enter] : !DEFAULT_FOLDER!
  echo.
  set /p "PDF_PATH=Path PDF/Folder : "
)

if "!PDF_PATH!"=="" set "PDF_PATH=!DEFAULT_FOLDER!"

:: Cek apakah path adalah folder atau file
if exist "!PDF_PATH!\" (
  set "IS_FOLDER=1"
  echo Folder : !PDF_PATH!
) else if exist "!PDF_PATH!" (
  set "IS_FOLDER=0"
  echo File   : !PDF_PATH!
) else (
  echo Path tidak ditemukan: !PDF_PATH!
  pause
  exit /b 1
)

echo.
set /p "BANK_NAME=Nama Bank  : "
if "!BANK_NAME!"=="" (
  echo Nama bank tidak boleh kosong.
  pause
  exit /b 1
)

echo.
echo Label Asset:
echo   1  LELANG  (Harga Limit = dari dokumen)
echo   2  CASSIE  (Harga Limit = Outstanding)
echo.

:pilih_label
set /p "LABEL_CHOICE=Pilih 1 atau 2 : "
if "!LABEL_CHOICE!"=="1" ( set "LABEL=LELANG" & goto mulai )
if "!LABEL_CHOICE!"=="2" ( set "LABEL=CASSIE" & goto mulai )
echo Pilihan tidak valid, ketik 1 atau 2.
goto pilih_label

:mulai
echo.
echo =====================================================
echo   Memulai ekstraksi... jangan tutup window ini
echo =====================================================
echo.

if "!IS_FOLDER!"=="1" (
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
