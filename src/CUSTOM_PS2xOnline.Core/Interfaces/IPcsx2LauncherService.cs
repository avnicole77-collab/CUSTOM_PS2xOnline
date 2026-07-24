namespace CUSTOM_PS2xOnline.Core.Interfaces;

public interface IPcsx2LauncherService
{
    bool IsReady(string executablePath);
    string? FindInstalledExecutable();
    void Launch(string executablePath, string gamePath, bool fullscreen);
}
