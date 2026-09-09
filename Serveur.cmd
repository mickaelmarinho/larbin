@echo off
title Le Larbin - serveur
cd /d "%~dp0"
echo Assemblage de la page...
call npm run build
echo.
echo Laissez cette fenetre ouverte tant que vous jouez.
echo.
node src/reseau/serveur.ts
pause
