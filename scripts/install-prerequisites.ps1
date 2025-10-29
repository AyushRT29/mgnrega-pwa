# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Please run PowerShell as Administrator" -ForegroundColor Red
    exit 1
}

# Function to check if a command exists
function Test-Command {
    param($Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

Write-Host "Starting environment setup for MGNREGA PWA..." -ForegroundColor Cyan
Write-Host ""

# 1. Install Chocolatey
if (-not (Test-Command choco)) {
    Write-Host "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
} else {
    Write-Host "Chocolatey already installed"
}

# 2. Install Git
if (-not (Test-Command git)) {
    Write-Host "Installing Git..."
    choco install git -y
} else {
    Write-Host "Git already installed: $(git --version)"
}

# 3. Install Node.js
if (-not (Test-Command node)) {
    Write-Host "Installing Node.js LTS..."
    choco install nodejs-lts -y
} else {
    Write-Host "Node.js already installed: $(node -v)"
}

# 4. Install Docker Desktop
if (-not (Test-Command docker)) {
    Write-Host "Installing Docker Desktop..."
    choco install docker-desktop -y
    Write-Host "Docker Desktop requires a restart after installation." -ForegroundColor Yellow
} else {
    Write-Host "Docker already installed: $(docker --version)"
}

# 5. Install Windows Terminal (optional)
if (-not (Test-Command wt)) {
    Write-Host "Installing Windows Terminal..."
    choco install microsoft-windows-terminal -y
} else {
    Write-Host "Windows Terminal already installed"
}

# 6. Check WSL installation
Write-Host ""
Write-Host "Checking Windows Subsystem for Linux (WSL)..."
$wslInstalled = (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux).State -eq "Enabled"
$vmPlatformInstalled = (Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform).State -eq "Enabled"

if (-not $wslInstalled -or -not $vmPlatformInstalled) {
    Write-Host "Enabling WSL2 and Virtual Machine Platform..."
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
    wsl --set-default-version 2
    Write-Host "WSL2 enabled successfully. Please restart your computer before continuing." -ForegroundColor Yellow
} else {
    Write-Host "WSL2 already enabled"
}

# 7. Install Ubuntu for WSL
Write-Host ""
Write-Host "Checking Ubuntu installation..."
$ubuntuList = wsl --list --online | Select-String "Ubuntu"

if (-not $ubuntuList) {
    Write-Host "Installing Ubuntu for WSL..."
    wsl --install -d Ubuntu
    Write-Host "Ubuntu installation started. Follow on-screen prompts."
} else {
    Write-Host "Ubuntu already available for WSL"
}

Write-Host ""
Write-Host "Environment setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Restart your computer (especially if Docker or WSL were installed)"
Write-Host "2. Clone your project:"
Write-Host "   git clone https://github.com/AyushRT29/mgnrega-pwa.git"
Write-Host "3. Follow setup guide in README.md"
Write-Host ""
Write-Host "All done!"
