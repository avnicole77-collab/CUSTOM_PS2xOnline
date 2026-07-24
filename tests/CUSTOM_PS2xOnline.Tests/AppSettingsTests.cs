using CUSTOM_PS2xOnline.App.ViewModels;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Core.Models;
using CUSTOM_PS2xOnline.Infrastructure.Services;
using CUSTOM_PS2xOnline.Network.Services;
using FluentAssertions;

namespace CUSTOM_PS2xOnline.Tests;

public sealed class AppSettingsTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "CUSTOM_PS2xOnline.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public void SaveAndLoad_ShouldRoundTripSettings()
    {
        var path = Path.Combine(_directory, "settings.json");
        var service = new AppSettingsService(path);
        var expected = new AppSettingsModel
        {
            Language = "en-US",
            Theme = "Light",
            Pcsx2ExecutablePath = @"C:\PCSX2\pcsx2-qt.exe",
            BiosFolder = @"C:\PCSX2\bios",
            GameFolder = @"D:\Games",
            DefaultFullscreen = true
        };

        service.Save(expected);
        var actual = service.Load();

        actual.Should().BeEquivalentTo(expected);
    }

    [Fact]
    public void Load_WithInvalidJson_ShouldReturnDefaults()
    {
        Directory.CreateDirectory(_directory);
        var path = Path.Combine(_directory, "settings.json");
        File.WriteAllText(path, "{ invalid json");

        var actual = new AppSettingsService(path).Load();

        actual.ApplicationName.Should().Be("CUSTOM PS2xOnline");
        actual.Language.Should().Be("th-TH");
    }

    [Fact]
    public void ViewModel_ShouldLoadAndSaveThroughService()
    {
        var service = new InMemorySettingsService
        {
            Settings = new AppSettingsModel { Language = "en-US" }
        };
        var viewModel = new MainViewModel(
            service,
            new GameLibraryService(),
            new FakeLauncherService(),
            new FakeNetworkStatusService(),
            new RoomSessionService());

        viewModel.Language.Should().Be("en-US");
        viewModel.GameFolder = @"D:\Games";
        viewModel.SaveSettingsCommand.Execute(null);

        service.Settings.GameFolder.Should().Be(@"D:\Games");
        viewModel.StatusText.Should().Be("Settings saved");
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, true);
        }
    }

    private sealed class InMemorySettingsService : IAppSettingsService
    {
        public AppSettingsModel Settings { get; set; } = new();

        public AppSettingsModel Load() => Settings;

        public void Save(AppSettingsModel settings) => Settings = settings;
    }

    private sealed class FakeLauncherService : IPcsx2LauncherService
    {
        public bool IsReady(string executablePath) => false;
        public string? FindInstalledExecutable() => null;
        public void Launch(string executablePath, string gamePath, bool fullscreen) { }
    }

    private sealed class FakeNetworkStatusService : INetworkStatusService
    {
        public Task<NetworkStatus> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new NetworkStatus(true, 10));
    }
}
