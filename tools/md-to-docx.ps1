# Converts a Markdown file to a minimal, valid Word .docx (Open XML) using only
# built-in .NET / PowerShell — no external modules. Supports: # / ## / ### headings,
# "- " bullets, "---" horizontal rules, and inline **bold**, `code`, and _italic_.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File tools/md-to-docx.ps1 `
#       -In DATA_SOURCES_SUMMARY.md -Out DATA_SOURCES_SUMMARY.docx
param(
    [string]$In = 'DATA_SOURCES_SUMMARY.md',
    [string]$Out = 'DATA_SOURCES_SUMMARY.docx'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$InPath = (Resolve-Path -LiteralPath $In).Path
$OutPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))

function XmlEsc([string]$s) {
    return ($s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;')
}

# Turn an inline string into a sequence of <w:r> runs, honouring **bold**, `code`, _italic_.
function Build-Runs([string]$text) {
    $sb = New-Object System.Text.StringBuilder
    $rx = [regex]'(\*\*(?<b>.+?)\*\*)|(`(?<c>.+?)`)|(_(?<i>.+?)_)|(?<t>(?:[^*`_]|(?<=\w)_(?=\w))+)'
    foreach ($m in $rx.Matches($text)) {
        if ($m.Groups['b'].Success) {
            $t = XmlEsc $m.Groups['b'].Value
            [void]$sb.Append("<w:r><w:rPr><w:b/></w:rPr><w:t xml:space='preserve'>$t</w:t></w:r>")
        }
        elseif ($m.Groups['c'].Success) {
            $t = XmlEsc $m.Groups['c'].Value
            [void]$sb.Append("<w:r><w:rPr><w:rFonts w:ascii='Consolas' w:hAnsi='Consolas'/><w:color w:val='B5179E'/></w:rPr><w:t xml:space='preserve'>$t</w:t></w:r>")
        }
        elseif ($m.Groups['i'].Success) {
            $t = XmlEsc $m.Groups['i'].Value
            [void]$sb.Append("<w:r><w:rPr><w:i/></w:rPr><w:t xml:space='preserve'>$t</w:t></w:r>")
        }
        else {
            $t = XmlEsc $m.Groups['t'].Value
            [void]$sb.Append("<w:r><w:t xml:space='preserve'>$t</w:t></w:r>")
        }
    }
    return $sb.ToString()
}

function Heading([string]$text, [int]$sz, [int]$before, [int]$after) {
    $t = XmlEsc $text
    return "<w:p><w:pPr><w:spacing w:before='$before' w:after='$after'/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val='$sz'/></w:rPr><w:t xml:space='preserve'>$t</w:t></w:r></w:p>"
}

# --- Parse markdown into blocks (folding wrapped continuation lines) ---
$lines = Get-Content -LiteralPath $InPath -Encoding UTF8
$blocks = New-Object System.Collections.ArrayList
$cur = $null
function Flush() {
    if ($script:cur) { [void]$script:blocks.Add($script:cur); $script:cur = $null }
}
foreach ($raw in $lines) {
    $line = $raw.TrimEnd()
    if ($line -eq '') { Flush; continue }
    if ($line -match '^<!--') { Flush; continue }  # skip HTML comment / auto-stats markers
    if ($line -eq '---') { Flush; [void]$blocks.Add(@{ type = 'hr'; text = '' }); continue }
    if ($line -match '^# ') { Flush; [void]$blocks.Add(@{ type = 'h1'; text = $line.Substring(2) }); continue }
    if ($line -match '^## ') { Flush; [void]$blocks.Add(@{ type = 'h2'; text = $line.Substring(3) }); continue }
    if ($line -match '^### ') { Flush; [void]$blocks.Add(@{ type = 'h3'; text = $line.Substring(4) }); continue }
    if ($line -match '^- ') { Flush; $cur = @{ type = 'bullet'; text = $line.Substring(2) }; continue }
    # continuation of the current block (wrapped line), or a fresh paragraph
    if ($cur) { $cur.text += ' ' + $line.Trim() }
    else { $cur = @{ type = 'para'; text = $line.Trim() } }
}
Flush

# --- Render blocks to OOXML paragraphs ---
$body = New-Object System.Text.StringBuilder
foreach ($b in $blocks) {
    switch ($b.type) {
        'h1' { [void]$body.Append((Heading $b.text 36 0 160)) }
        'h2' { [void]$body.Append((Heading $b.text 30 280 120)) }
        'h3' { [void]$body.Append((Heading $b.text 24 200 80)) }
        'hr' { [void]$body.Append("<w:p><w:pPr><w:pBdr><w:bottom w:val='single' w:sz='6' w:space='1' w:color='CCCCCC'/></w:pBdr></w:pPr></w:p>") }
        'bullet' {
            $runs = Build-Runs $b.text
            [void]$body.Append("<w:p><w:pPr><w:spacing w:after='60'/><w:ind w:left='360' w:hanging='220'/></w:pPr><w:r><w:t xml:space='preserve'>" + [char]0x2022 + "  </w:t></w:r>$runs</w:p>")
        }
        default {
            $runs = Build-Runs $b.text
            [void]$body.Append("<w:p><w:pPr><w:spacing w:after='120'/></w:pPr>$runs</w:p>")
        }
    }
}

$sect = "<w:sectPr><w:pgSz w:w='12240' w:h='15840'/><w:pgMar w:top='1440' w:bottom='1440' w:left='1440' w:right='1440'/></w:sectPr>"
$document = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>" +
"<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body>" +
$body.ToString() + $sect + "</w:body></w:document>"

$contentTypes = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>" +
"<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>" +
"<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>" +
"<Default Extension='xml' ContentType='application/xml'/>" +
"<Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/>" +
"</Types>"

$rels = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>" +
"<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>" +
"<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='word/document.xml'/>" +
"</Relationships>"

# --- Assemble the .docx (a ZIP of those parts, with OOXML-correct forward-slash paths) ---
$utf8 = New-Object System.Text.UTF8Encoding($false)
$tmpOut = Join-Path $env:TEMP ("out_" + [guid]::NewGuid().ToString("N") + ".docx")

function Add-ZipEntry($zip, [string]$name, [string]$content, $enc) {
    $entry = $zip.CreateEntry($name)
    $stream = $entry.Open()
    $bytes = $enc.GetBytes($content)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
}

$zip = [System.IO.Compression.ZipFile]::Open($tmpOut, [System.IO.Compression.ZipArchiveMode]::Create)
Add-ZipEntry $zip '[Content_Types].xml' $contentTypes $utf8
Add-ZipEntry $zip '_rels/.rels' $rels $utf8
Add-ZipEntry $zip 'word/document.xml' $document $utf8
$zip.Dispose()

Move-Item -LiteralPath $tmpOut -Destination $OutPath -Force

Write-Host "Wrote $OutPath ($((Get-Item -LiteralPath $OutPath).Length) bytes, $($blocks.Count) blocks)"
