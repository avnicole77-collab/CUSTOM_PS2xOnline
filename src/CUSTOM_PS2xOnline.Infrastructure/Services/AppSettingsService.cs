using System.Text.Json;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.Infrastructure.Services;

public sealed class AppSettingsService : IAppSettingsService
{
    private readonly string _path;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public AppSettingsService()
        : this(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CUSTOM_PS2xOnline",
            "appsettings.json"))
    {
    }

    public AppSettingsService(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        _path = Path.GetFullPath(path);
    }

    public AppSettingsModel Load()
    {
        if (!File.Exists(_path))
        {
            return new AppSettingsModel();
        }

        try
        {
            var json = File.ReadAllText(_path);
            return JsonSerializer.Deserialize<AppSettingsModel>(json, JsonOptions)
                ?? new AppSettingsModel();
        }
        catch (JsonException)
        {
            return new AppSettingsModel();
        }
        catch (IOException)
        {
            return new AppSettingsModel();
        }
    }

    public void Save(AppSettingsModel settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var directory = Path.GetDirectoryName(_path)
            ?? throw new InvalidOperationException("The settings path has no parent directory.");
        Directory.CreateDirectory(directory);

        var temporaryPath = _path + ".tmp";
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        File.WriteAllText(temporaryPath, json);
        File.Move(temporaryPath, _path, true);
    }
}
