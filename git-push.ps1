Set-Location "C:\Users\Rayder\Desktop\ComicOrbit"

if (Test-Path ".git\index.lock") {
    Remove-Item ".git\index.lock" -Force
    Write-Host "Removed stale git lock" -ForegroundColor Yellow
}

git add -A
git commit -m "Chapter dropdown fix, custom cover upload

- Chapter dropdown: use position:fixed + getBoundingClientRect so it
  never gets clipped by overflow:hidden ancestors or z-index stacking
- Dashboard/Library: add Upload Cover button per series row
  - Opens file picker, reads image as base64 data URL
  - POST /api/series/[id]/cover saves file and updates cover_path in DB
  - Cover reflects immediately via existing /api/cover/[id] proxy"

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nGitHub push OK" -ForegroundColor Green
} else {
    Write-Host "`nGitHub push FAILED" -ForegroundColor Red
}

Read-Host "`nPress Enter to close"
