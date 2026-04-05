# escape=`
ARG BASE_IMAGE=nationalinstruments/labview:2026q1-windows
FROM ${BASE_IMAGE}

SHELL ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]

ARG BASE_IMAGE
ARG NODE_VERSION=24.10.0
ARG MINGIT_VERSION=2.53.0

LABEL org.opencontainers.image.title="vi-history-suite-github-windows-dashboard-benchmark"
LABEL org.opencontainers.image.description="Host-runnable Windows dashboard benchmark image for vi-history-suite"
LABEL io.vihs.base-image="${BASE_IMAGE}"
LABEL io.vihs.runtime-plane="github-windows-dashboard-benchmark"

RUN $ErrorActionPreference = 'Stop'; `
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; `
    New-Item -ItemType Directory -Path C:\tools -Force | Out-Null; `
    $nodeZip = ('C:\tools\node-v' + $env:NODE_VERSION + '.zip'); `
    Invoke-WebRequest -Uri ('https://nodejs.org/dist/v' + $env:NODE_VERSION + '/node-v' + $env:NODE_VERSION + '-win-x64.zip') -OutFile $nodeZip; `
    Expand-Archive -LiteralPath $nodeZip -DestinationPath C:\tools -Force; `
    Move-Item -Path ('C:\tools\node-v' + $env:NODE_VERSION + '-win-x64') -Destination C:\tools\node -Force; `
    Remove-Item $nodeZip -Force; `
    $gitZip = ('C:\tools\MinGit-' + $env:MINGIT_VERSION + '-64-bit.zip'); `
    Invoke-WebRequest -Uri ('https://github.com/git-for-windows/git/releases/download/v' + $env:MINGIT_VERSION + '.windows.1/MinGit-' + $env:MINGIT_VERSION + '-64-bit.zip') -OutFile $gitZip; `
    Expand-Archive -LiteralPath $gitZip -DestinationPath C:\tools\git -Force; `
    Remove-Item $gitZip -Force

ENV PATH="C:\\tools\\node;C:\\tools\\git\\cmd;C:\\tools\\git\\mingw64\\bin;${PATH}"
ENV LV_RTE_HEADLESS=1

WORKDIR C:/workspace

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY docker/github-windows-dashboard-benchmark ./docker/github-windows-dashboard-benchmark

RUN npm ci; `
    if ($LASTEXITCODE -ne 0) { `
      throw 'Failed to install the prebuilt Windows benchmark workspace dependencies.' `
    }; `
    npm run compile; `
    if ($LASTEXITCODE -ne 0) { `
      throw 'Failed to compile the prebuilt Windows benchmark workspace.' `
    }; `
    New-Item -ItemType Directory -Path C:\workspace\.cache -Force | Out-Null

CMD ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Start-Sleep -Seconds 3600"]
