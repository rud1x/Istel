Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WProbe {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output ("screen=" + $s.Width + "x" + $s.Height)
$procs = Get-Process electron -ErrorAction SilentlyContinue
foreach ($p in $procs) {
  if ($p.MainWindowHandle -ne 0) {
    $r = New-Object WProbe+RECT
    [void][WProbe]::GetWindowRect($p.MainWindowHandle, [ref]$r)
    $vis = [WProbe]::IsWindowVisible($p.MainWindowHandle)
    Write-Output ("pid=" + $p.Id + " visible=" + $vis + " L=" + $r.Left + " T=" + $r.Top + " R=" + $r.Right + " B=" + $r.Bottom)
  }
}
