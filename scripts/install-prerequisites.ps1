
# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  Please run PowerShell as Administrator" -ForegroundColor Red
    exit 1
}

# Function to check if command exists
function Test-Command {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# 1. Install Chocolatey (package manager)
if (-not (Test-Command choco)) {
    Write-Host "📦 Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
} else {
    Write-Host "✅ Chocolatey already installed"
}

# 2. Install Git
if (-not (Test-Command git)) {
    Write-Host "📦 Installing Git..."
    choco install git -y
} else {
    Write-Host "✅ Git already installed: $(git --version)"
}

# 3. Install Node.js
if (-not (Test-Command node)) {
    Write-Host "📦 Installing Node.js 20.x..."
    choco install nodejs-lts -y
} else {
    Write-Host "✅ Node.js already installed: $(node -v)"
}

# 4. Install Docker Desktop
if (-not (Test-Command docker)) {
    Write-Host "📦 Installing Docker Desktop..."
    choco install docker-desktop -y
    Write-Host "⚠️  Docker Desktop requires a restart. Please restart your computer." -ForegroundColor Yellow
} else {
    Write-Host "✅ Docker already installed: $(docker --version)"
}

# 5. Install Windows Terminal (optional but recommended)
if (-not (Test-Command wt)) {
    Write-Host "📦 Installing Windows Terminal..."
    choco install microsoft-windows-terminal -y
}

Write-Host ""
Write-Host "✅ Prerequisites installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Restart your computer if Docker was installed"
Write-Host "2. Enable WSL2 and install Ubuntu from Microsoft Store"
Write-Host "3. Clone repository: git clone <repo-url>"
Write-Host "4. Follow setup guide in README.md"