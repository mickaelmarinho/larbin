@echo off
title Le Larbin - serveur
cd /d "%~dp0"
echo Laissez cette fenetre ouverte tant que vous jouez.
echo.
node scripts/serveur.mjs
pause
