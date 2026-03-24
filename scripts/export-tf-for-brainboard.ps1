$src = "platform\terraform"
$dest = "tf-import"
Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dest

Get-ChildItem -Path $src -Recurse -Filter "*.tf" |
  Where-Object { $_.FullName -notlike "*\.terraform\*" } |
  ForEach-Object {
    $rel = $_.FullName.Substring((Resolve-Path $src).Path.Length + 1)
    $flat = $rel -replace "\\", "_"
    Copy-Item $_.FullName -Destination "$dest\$flat"
  }

Write-Host "Exported $((Get-ChildItem $dest).Count) files to $dest\"
