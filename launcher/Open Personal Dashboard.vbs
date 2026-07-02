Option Explicit

Dim fileSystem, shell, scriptDirectory, powerShellScript, command

Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
powerShellScript = fileSystem.BuildPath(scriptDirectory, "Start-PersonalDashboard.ps1")

If Not fileSystem.FileExists(powerShellScript) Then
    MsgBox "The dashboard launcher is incomplete. Start-PersonalDashboard.ps1 was not found.", _
        vbCritical, "Personal Dashboard"
    WScript.Quit 1
End If

command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass " & _
    "-WindowStyle Hidden -File " & Chr(34) & powerShellScript & Chr(34)

shell.Run command, 0, False

