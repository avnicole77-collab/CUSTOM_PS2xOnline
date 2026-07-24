using System.Diagnostics;
using CUSTOM_PS2xOnline.Core.Interfaces;

namespace CUSTOM_PS2xOnline.Streaming.Services;

public sealed class ParsecRemotePlayService : IRemotePlayService
{
    public bool IsInstalled() => FindExecutable() is not null;

    public string? FindExecutable()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Parsec", "parsecd.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Parsec", "parsecd.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Parsec", "parsecd.exe")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    public void Open()
    {
        var executable = FindExecutable()
            ?? throw new FileNotFoundException("Parsec is not installed.");

        Process.Start(new ProcessStartInfo
        {
            FileName = executable,
            UseShellExecute = true
        });
    }
}
