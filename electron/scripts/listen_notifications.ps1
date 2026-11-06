Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

Function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[void][Windows.UI.Notifications.Management.UserNotificationListener,Windows.UI.Notifications,ContentType=WindowsRuntime]

$listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
if (-not $listener) {
  Write-Output '{"error":"listener not available"}'
  exit
}

$accessStatus = $listener.GetAccessStatus()
if ($accessStatus -ne 'Allowed') {
  Write-Output '{"error":"access not granted"}'
  exit
}

$lastId = 0
$initial = Await ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
if ($initial) {
  foreach ($n in $initial) {
    if ($n.Id -gt $lastId) { $lastId = $n.Id }
  }
}
while ($true) {
  $notifications = Await ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
  if ($notifications) {
    foreach ($n in $notifications) {
      if ($n.Id -gt $lastId) {
        $lastId = $n.Id
        $app = $n.AppInfo.DisplayInfo.DisplayName
        $title = ''
        $body = ''
        if ($n.Notification -and $n.Notification.Visual) {
          $bindings = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
          if (-not $bindings) {
            $bindings = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.ToastTemplateType]::ToastText01)
          }
          if (-not $bindings) {
            $bindings = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02)
          }
          if (-not $bindings) {
            $bindings = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText01)
          }
          if ($bindings) {
            $texts = $bindings.GetTextElements()
            if ($texts.Count -gt 0) { $title = $texts[0] }
            if ($texts.Count -gt 1) { $body = $texts[1] }
          }
        }
        $obj = @{ id = $n.Id; app = $app; title = $title; body = $body }
        Write-Output ($obj | ConvertTo-Json -Compress)
      }
    }
  }
  Start-Sleep -Milliseconds 500
}
