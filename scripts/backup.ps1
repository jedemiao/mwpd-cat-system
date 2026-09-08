# Encrypted backup of Postgres + MinIO, for Windows Task Scheduler.
#
# Why this exists alongside backup.sh:
#
# backup.sh works perfectly from a terminal but was killed part-way through
# whenever Task Scheduler ran it — exit 0xC000013A (STATUS_CONTROL_C_EXIT),
# leaving 15-byte .gpg files that looked like backups for days. The cause is not
# any one command: Git Bash emulates fork() through Cygwin, that emulation is
# unreliable in a scheduled non-interactive session (the log carries
# "couldn't create signal pipe, Win32 error 5"), and each docker call is another
# fork. Editing the script only moved the point at which it died.
#
# So the scheduled path uses no bash at all. PowerShell is native here, and
# every external process is launched directly.
#
# backup.sh remains the documented way to back up by hand, and on Linux.
#
# Usage:
#   $env:BACKUP_PASSPHRASE_FILE = "$HOME\.mwpd-backup-passphrase"
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1 [backupDir]

param([string]$BackupDir = "$PSScriptRoot\..\backups")

$ErrorActionPreference = 'Stop'

# Binary data never goes through a PowerShell pipeline: 5.1 re-encodes it and
# would silently corrupt both the dump and the archive. Every step writes a real
# file, and the next step reads that file.
$gpg  = 'C:\Program Files\Git\usr\bin\gpg.exe'
$gzip = 'C:\Program Files\Git\usr\bin\gzip.exe'
foreach ($exe in @($gpg, $gzip)) {
  if (-not (Test-Path $exe)) { throw "Required tool not found: $exe" }
}

$timestamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }
$BackupDir = (Resolve-Path $BackupDir).Path

# Task Scheduler cannot set environment variables for an action, so the
# conventional location is the default rather than something the caller must
# remember to pass.
$passphraseFile = if ($env:BACKUP_PASSPHRASE_FILE) { $env:BACKUP_PASSPHRASE_FILE }
                  else { Join-Path $env:USERPROFILE '.mwpd-backup-passphrase' }
if (Test-Path $passphraseFile) {
  $passphrase = (Get-Content $passphraseFile -Raw).Trim()
} else {
  $passphrase = $env:BACKUP_PASSPHRASE
}
if (-not $passphrase) { throw 'Set BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE before running this script' }

# Runs an executable with stdout captured straight to a file, no pipeline.
function Invoke-ToFile {
  param([string]$Exe, [string[]]$ArgList, [string]$OutFile)
  $p = Start-Process -FilePath $Exe -ArgumentList $ArgList -NoNewWindow -Wait -PassThru `
       -RedirectStandardOutput $OutFile -RedirectStandardError "$OutFile.err"
  if ($p.ExitCode -ne 0) {
    $err = if (Test-Path "$OutFile.err") { Get-Content "$OutFile.err" -Raw } else { '' }
    throw "$Exe exited $($p.ExitCode): $err"
  }
  Remove-Item "$OutFile.err" -ErrorAction SilentlyContinue
}

# A minimum plausible size. The number is not the point: an empty or truncated
# artifact must FAIL rather than sit in the backup directory looking like a
# backup. A 15-byte .gpg is gpg faithfully encrypting nothing.
function Assert-Size {
  param([string]$Path, [int]$Min, [string]$What)
  $size = (Get-Item $Path).Length
  if ($size -lt $Min) {
    Remove-Item $Path -Force
    throw "BACKUP FAILED: $What is only $size bytes (expected at least $Min). Deleted so it cannot be mistaken for a good backup."
  }
}

# Containers are found by compose label, so a checkout in a differently-named
# directory still resolves — the same approach backup.sh uses for the volume.
$volume = (& docker volume ls -q --filter 'label=com.docker.compose.volume=minio_data' | Select-Object -First 1)
if (-not $volume) { throw 'Could not find the minio_data volume — is the stack running?' }
# Derived from the volume name rather than a --format template: PowerShell
# rewrites the quoting inside a Go template before docker ever sees it, and
# compose always names volumes "<project>_<key>".
$project = $volume -replace '_minio_data$', ''

function Get-ComposeContainer {
  param([string]$Service)
  $id = (& docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$Service" | Select-Object -First 1)
  if (-not $id) { throw "Could not find the running '$Service' container for project $project — is the stack up?" }
  return $id
}

$dbContainer    = Get-ComposeContainer 'db'
$minioContainer = Get-ComposeContainer 'minio'

# The host pg_dump, and the password compose hands the container.
$pgRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
$hostPgDump = (Get-ChildItem $pgRoot -Recurse -Filter 'pg_dump.exe' -ErrorAction SilentlyContinue |
               Sort-Object FullName -Descending | Select-Object -First 1).FullName
if (-not $hostPgDump) { throw "No pg_dump.exe found under $pgRoot" }
$envFile = Join-Path $PSScriptRoot '..\.env'
$pgPassword = ((Get-Content $envFile | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -split '=', 2)[1].Trim()
if (-not $pgPassword) { throw "POSTGRES_PASSWORD not found in $envFile" }

$tmp = Join-Path $env:TEMP "mwpd-backup-$timestamp"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
  Write-Output "[$timestamp] Dumping Postgres..."
  $sql = Join-Path $tmp 'db.sql'
  # Dumped over the published port with the HOST pg_dump, not `docker exec`.
  #
  # Attaching docker commands (exec, run, compose) are delivered a spurious
  # console control event under Task Scheduler and exit STATUS_CONTROL_C_EXIT -
  # the captured log literally shows "^C" mid-run. Non-attaching ones (ps,
  # volume ls, cp) are unaffected, which is why this script now uses only
  # those. docker-compose.yml publishes the database on 127.0.0.1:5433, so the
  # dump needs no attach at all.
  $env:PGPASSWORD = $pgPassword
  try {
    Invoke-ToFile $hostPgDump @('-h', '127.0.0.1', '-p', '5433', '-U', 'mwpd', 'mwpd_tracker') $sql
  } finally {
    $env:PGPASSWORD = $null
  }
  $dbOut = Join-Path $BackupDir "db-$timestamp.sql.gpg"
  & $gpg --batch --yes --passphrase $passphrase --symmetric --cipher-algo AES256 --output $dbOut $sql
  if ($LASTEXITCODE -ne 0) { throw "gpg failed encrypting the Postgres dump (exit $LASTEXITCODE)" }
  Assert-Size $dbOut 2000 'the Postgres dump'

  Write-Output "[$timestamp] Archiving MinIO data ($volume)..."
  # "/data/." keeps members relative to the directory, which is the layout
  # restore.sh extracts with `tar -xzf - -C /data`.
  $tar = Join-Path $tmp 'minio.tar'
  Invoke-ToFile 'docker' @('cp', "${minioContainer}:/data/.", '-') $tar
  & $gzip -f $tar                       # produces minio.tar.gz
  if ($LASTEXITCODE -ne 0) { throw "gzip failed compressing the MinIO archive (exit $LASTEXITCODE)" }
  $minioOut = Join-Path $BackupDir "minio-$timestamp.tar.gz.gpg"
  & $gpg --batch --yes --passphrase $passphrase --symmetric --cipher-algo AES256 --output $minioOut "$tar.gz"
  if ($LASTEXITCODE -ne 0) { throw "gpg failed encrypting the MinIO archive (exit $LASTEXITCODE)" }
  Assert-Size $minioOut 100 'the MinIO archive'

  Write-Output "[$timestamp] Done: $dbOut, $minioOut"
}
finally {
  # The plaintext dump must not outlive the run, whatever happened.
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
