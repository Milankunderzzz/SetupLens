param(
    [string]$Output = "docs/assets/demo.gif"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$width = 1100
$height = 650
$culture = [Globalization.CultureInfo]::InvariantCulture
$typeface = New-Object Windows.Media.Typeface("Consolas")

function New-Text($drawing, $text, $x, $y, $color, $size = 23) {
    $brush = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString($color))
    $formatted = New-Object Windows.Media.FormattedText(
        $text,
        $culture,
        [Windows.FlowDirection]::LeftToRight,
        $typeface,
        $size,
        $brush,
        1.0
    )
    $drawing.DrawText($formatted, (New-Object Windows.Point($x, $y)))
}

function New-Frame($stage) {
    $visual = New-Object Windows.Media.DrawingVisual
    $drawing = $visual.RenderOpen()
    $background = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString("#101820"))
    $panel = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString("#17232D"))
    $line = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString("#30404D"))
    $drawing.DrawRectangle($background, $null, (New-Object Windows.Rect(0, 0, $width, $height)))
    $drawing.DrawRoundedRectangle($panel, $null, (New-Object Windows.Rect(26, 26, 1048, 598)), 8, 8)
    $drawing.DrawRectangle($line, $null, (New-Object Windows.Rect(26, 86, 1048, 1)))

    foreach ($dot in @(@(56, "#FF6B6B"), @(82, "#FFD166"), @(108, "#43C78A"))) {
        $brush = New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString($dot[1]))
        $drawing.DrawEllipse($brush, $null, (New-Object Windows.Point($dot[0], 56)), 8, 8)
    }
    New-Text $drawing "SetupLens terminal" 140 40 "#AFC0CC" 19

    New-Text $drawing "PS>" 58 112 "#43C78A" 24
    New-Text $drawing "docker compose up --build" 112 112 "#F4F7F9" 24
    New-Text $drawing "ERROR" 58 158 "#FF7D73" 22
    New-Text $drawing 'unable to prepare context: path "./backend" not found' 145 158 "#F4F7F9" 22

    if ($stage -ge 1) {
        New-Text $drawing "PS>" 58 222 "#43C78A" 24
        New-Text $drawing "npx --yes github:Milankunderzzz/SetupLens scan ." 112 222 "#F4F7F9" 22
    }
    if ($stage -ge 2) {
        New-Text $drawing "Indexed 261 files" 58 278 "#AFC0CC" 22
        New-Text $drawing "node / python / docker" 320 278 "#57B7F2" 22
    }
    if ($stage -ge 3) {
        New-Text $drawing "FAIL" 58 334 "#FF7D73" 22
        New-Text $drawing "4 broken Docker Compose paths" 145 334 "#F4F7F9" 22
    }
    if ($stage -ge 4) {
        New-Text $drawing "FAIL" 58 378 "#FF7D73" 22
        New-Text $drawing "Makefile calls a missing npm script" 145 378 "#F4F7F9" 22
    }
    if ($stage -ge 5) {
        New-Text $drawing "PASS" 58 422 "#43C78A" 22
        New-Text $drawing "No high-confidence credentials exposed" 145 422 "#F4F7F9" 22
    }
    if ($stage -ge 6) {
        New-Text $drawing "5 confirmed blockers" 58 474 "#FF7D73" 28
        New-Text $drawing "2 failed checks  |  9 warnings  |  15 passed" 58 516 "#AFC0CC" 20
        New-Text $drawing "Explained in 810 ms. Uploaded 0 bytes." 58 558 "#43C78A" 22
    }

    $drawing.Close()
    $bitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap($width, $height, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    return $bitmap
}

$frameDirectory = [IO.Path]::GetFullPath("docs/assets/demo-frames")
[IO.Directory]::CreateDirectory($frameDirectory) | Out-Null
for ($stage = 0; $stage -le 6; $stage++) {
    $source = New-Frame $stage
    $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($source))
    $framePath = [IO.Path]::Combine($frameDirectory, ("frame-{0}.png" -f $stage))
    $stream = [IO.File]::Open($framePath, [IO.FileMode]::Create)
    try {
        $encoder.Save($stream)
    } finally {
        $stream.Dispose()
    }
}

$absolute = [IO.Path]::GetFullPath($Output)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolute)) | Out-Null
node scripts/encode-demo-gif.js $frameDirectory $absolute
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
