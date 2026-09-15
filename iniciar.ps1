# Arranque do PYE Flight Planner a partir do atalho do ambiente de trabalho.
#
# Serve a versao construida na porta 5173, que tem de ser a mesma do servidor de
# desenvolvimento: os projetos e as rotas vivem na IndexedDB, que e por origem, e
# servir noutra porta abria a aplicacao vazia como se o trabalho se tivesse
# perdido.
#
# Reconstroi apenas quando ha codigo mais recente do que a ultima construcao, o
# que faz o arranque normal ser imediato.

$ErrorActionPreference = 'Stop'

$projeto = Split-Path -Parent $MyInvocation.MyCommand.Definition
$registo = Join-Path $projeto 'iniciar.log'
$url = 'http://localhost:5173'

function Escrever($texto) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $texto" | Add-Content -Path $registo -Encoding utf8
}

function Avisar($texto) {
  Escrever "FALHA: $texto"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "$texto`n`nO registo fica em:`n$registo",
    'PYE Flight Planner',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

# Pergunta por HTTP, e nao por uma ligacao a 127.0.0.1.
#
# O `vite preview` escuta em `localhost`, que no Windows resolve para ::1: uma
# tentativa de ligacao a 127.0.0.1 e recusada mesmo com o servidor de pe. Foi o
# que fez a primeira versao deste script esperar os 40 segundos todos e depois
# declarar falha, com o servidor a responder ao lado. Perguntar por HTTP ao mesmo
# nome que o browser usa evita a questao e ainda confirma que ja responde, e nao
# so que a porta esta aberta.
function ServidorPronto {
  try {
    $resposta = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    return $resposta.StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  Set-Location $projeto

  # Ja ha servidor a responder: abre e sai, sem levantar um segundo.
  if (ServidorPronto) {
    Escrever 'servidor ja estava de pe, so abriu o browser'
    Start-Process $url
    exit 0
  }

  $indice = Join-Path $projeto 'dist\index.html'
  $construido = if (Test-Path $indice) { (Get-Item $indice).LastWriteTimeUtc } else { [DateTime]::MinValue }

  # Codigo mais recente do que a construcao? Entao reconstroi.
  $maisRecente = Get-ChildItem -Path (Join-Path $projeto 'src'), (Join-Path $projeto 'index.html') -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1

  if ($null -eq $maisRecente -or $maisRecente.LastWriteTimeUtc -gt $construido) {
    Escrever 'a reconstruir, ha codigo mais recente do que a ultima construcao'
    $saida = & cmd /c 'npx vite build 2>&1'
    if ($LASTEXITCODE -ne 0) {
      if (Test-Path $indice) {
        # Com uma construcao anterior de pe, mais vale abrir essa do que nada.
        Escrever "construcao falhou, segue com a anterior: $saida"
      } else {
        Avisar "A construcao falhou e nao ha nenhuma anterior para abrir.`n`n$saida"
        exit 1
      }
    } else {
      Escrever 'construcao pronta'
    }
  }

  Escrever 'a levantar o servidor'
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npx vite preview' `
    -WorkingDirectory $projeto `
    -WindowStyle Hidden

  # Espera ate 40 s pelo servidor antes de desistir.
  $limite = (Get-Date).AddSeconds(40)
  while (-not (ServidorPronto)) {
    if ((Get-Date) -gt $limite) {
      Avisar 'O servidor nao chegou a responder na porta 5173. Verifica se ha outro programa a ocupa-la.'
      exit 1
    }
    Start-Sleep -Milliseconds 250
  }

  Escrever 'servidor de pe, a abrir o browser'
  Start-Process $url
  exit 0
} catch {
  Avisar $_.Exception.Message
  exit 1
}
