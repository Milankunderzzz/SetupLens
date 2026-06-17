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
    New-Text $drawing "npx setuplens scan ." 112 112 "#F4F7F9" 24

    if ($stage -ge 1) {
        New-Text $drawing "Indexing repository..." 58 170 "#AFC0CC" 22
        New-Text $drawing "261 files" 840 170 "#F4F7F9" 22
    }
    if ($stage -ge 2) {
        New-Text $drawing "Detected stack" 58 214 "#AFC0CC" 22
        New-Text $drawing "node / python / docker" 320 214 "#57B7F2" 22
    }
    if ($stage -ge 3) {
        New-Text $drawing "FAIL" 58 276 "#FF7D73" 22
        New-Text $drawing "4 broken Docker Compose paths" 145 276 "#F4F7F9" 22
    }
    if ($stage -ge 4) {
        New-Text $drawing "FAIL" 58 320 "#FF7D73" 22
        New-Text $drawing "Makefile calls a missing npm script" 145 320 "#F4F7F9" 22
    }
    if ($stage -ge 5) {
        New-Text $drawing "WARN" 58 364 "#FFD166" 22
        New-Text $drawing "9 setup and dependency gaps" 145 364 "#F4F7F9" 22
    }
    if ($stage -ge 6) {
        New-Text $drawing "PASS" 58 408 "#43C78A" 22
        New-Text $drawing "No high-confidence credentials exposed" 145 408 "#F4F7F9" 22
        New-Text $drawing "Score" 58 482 "#AFC0CC" 22
        New-Text $drawing "60 / 100" 145 476 "#F4F7F9" 31
        New-Text $drawing "2 failed  |  9 warnings  |  15 passed" 320 482 "#AFC0CC" 22
        New-Text $drawing "Done in 810 ms. No repository data uploaded." 58 548 "#43C78A" 21
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
