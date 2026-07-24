using System.Diagnostics;
using CUSTOM_PS2xOnline.Core.Interfaces;

namespace CUSTOM_PS2xOnline.PCSX2.Services;

public sealed class Pcsx2LauncherService : IPcsx2LauncherService
{
    public bool IsReady(string executablePath) =>
        !string.IsNullOrWhiteSpace(executablePath)
        && File.Exists(executablePath)
        && string.Equals(Path.GetExtension(executablePath), ".exe", StringComparison.OrdinalIgnoreCase);

    public void Launch(string executablePath, string gamePath, bool fullscreen)
    {
        if (!IsReady(executablePath))
        {
            throw new FileNotFoundException("PCSX2 executable was not found.", executablePath);
        }

        if (string.IsNullOrWhiteSpace(gamePath) || !File.Exists(gamePath))
        {
            throw new FileNotFoundException("The selected game was not found.", gamePath);
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = executablePath,
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(executablePath)!
        };

        if (fullscreen)
        {
            startInfo.ArgumentList.Add("-fullscreen");
        }

        startInfo.ArgumentList.Add(gamePath);
        Process.Start(startInfo);
    }
}
