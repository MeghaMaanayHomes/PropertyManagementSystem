@echo off
setlocal enabledelayedexpansion

:: Default variables
set IMAGE_NAME=property-management-system
set IMAGE_TAG=latest
set PORT=4000

:: If no arguments, default to help
if "%~1"=="" goto help

:: Route targets
if "%~1"=="help" goto help
if "%~1"=="install" goto install
if "%~1"=="pre-dev" goto predev
if "%~1"=="dev" goto dev
if "%~1"=="build" goto build
if "%~1"=="lint" goto lint
if "%~1"=="preview" goto preview
if "%~1"=="clean" goto clean
if "%~1"=="docker-build" goto docker-build
if "%~1"=="docker-run" goto docker-run

echo Unknown target: %~1
echo Run "make.bat help" to see available targets.
exit /b 1

:help
echo Megha Maanay Homes Portal
echo.
echo Available targets:
echo   help             Show available commands
echo   install          Install project dependencies
echo   dev              Start the development server (Vite)
echo   build            Build production assets
echo   lint             Run linter (oxlint)
echo   preview          Preview the production build locally
echo   clean            Remove build artifacts and node_modules
echo   docker-build     Build the Docker image
echo   docker-run       Run the Docker container
goto :eof

:install
echo Installing dependencies...
call npm install
goto :eof

:predev
echo Running pre-dev...
echo Installing dependencies...
call npx -y npm install
goto :eof

:dev
call :predev
echo Starting Vite development server...
call npm run dev
goto :eof

:build
echo Building production package...
call npm run build
goto :eof

:lint
echo Running linter...
call npm run lint
goto :eof

:preview
echo Starting local preview server...
call npm run preview
goto :eof

:clean
echo Cleaning project...
if exist dist rmdir /s /q dist
if exist node_modules rmdir /s /q node_modules
goto :eof

:docker-build
echo Building Docker image %IMAGE_NAME%:%IMAGE_TAG%...
call docker build -t %IMAGE_NAME%:%IMAGE_TAG% .
goto :eof

:docker-run
echo Running Docker container on port %PORT%...
call docker run --rm -it -p %PORT%:4000 --name %IMAGE_NAME%-container %IMAGE_NAME%:%IMAGE_TAG%
goto :eof
