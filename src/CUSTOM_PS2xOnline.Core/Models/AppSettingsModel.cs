namespace CUSTOM_PS2xOnline.Core.Models;

public sealed class AppSettingsModel
{
    public string ApplicationName { get; set; } = "CUSTOM PS2xOnline";
    public string Version { get; set; } = "1.0.0";
    public string Language { get; set; } = "th-TH";
    public string Theme { get; set; } = "Dark";
    public string Pcsx2ExecutablePath { get; set; } = string.Empty;
    public string BiosFolder { get; set; } = string.Empty;
    public string GameFolder { get; set; } = string.Empty;
    public bool DefaultFullscreen { get; set; }
}
