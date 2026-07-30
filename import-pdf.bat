@echo off
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

:: PDF Path: dari drag-and-drop ATAU input manual
if not "%~1"=="" (
  set "PDF_PATH=%~1"
  echo File  : %PDF_PATH%
) else (
  echo Drag file PDF ke icon import-pdf.bat, atau ketik path di bawah:
  echo.
  set /p "PDF_PATH=Path PDF : "
)

if "%PDF_PATH%"=="" (
  echo Path tidak boleh kosong.
  pause & exit /b 1
)
if not exist "%PDF_PATH%" (
  echo File tidak ditemukan: %PDF_PATH%
  pause & exit /b 1
)

echo.
set /p "BANK_NAME=Nama Bank  : "
if "%BANK_NAME%"=="" (
  echo Nama bank tidak boleh kosong.
  pause & exit /b 1
)

echo.
echo Label Asset:
echo   1  LELANG  (Harga Limit = dari dokumen)
echo   2  CASSIE  (Harga Limit = Outstanding)
echo.

:pilih_label
set /p "LABEL_CHOICE=Pilih 1 atau 2 : "
if "%LABEL_CHOICE%"=="1" ( set "LABEL=LELANG" & goto mulai )
if "%LABEL_CHOICE%"=="2" ( set "LABEL=CASSIE" & goto mulai )
echo Pilihan tidak valid, ketik 1 atau 2.
goto pilih_label

:mulai
echo.
echo =====================================================
echo   Memulai ekstraksi... jangan tutup window ini
echo =====================================================
echo.

node "%~dp0scripts\extract-pdf.js" "%PDF_PATH%" "%BANK_NAME%" %LABEL%

echo.
echo =====================================================
echo   Selesai. Tekan tombol apapun untuk tutup.
echo =====================================================
pause >nul