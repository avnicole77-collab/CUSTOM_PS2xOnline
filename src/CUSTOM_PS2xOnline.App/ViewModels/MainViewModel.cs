using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.App.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private readonly IAppSettingsService _settingsService;
    private string _statusText = "Ready";
    private string _hostStatus = "Host: Offline";
    private string _networkStatus = "Network: Unknown";
    private string _version = "1.0.0";
    private string _language = "th-TH";
    private string _theme = "Dark";
    private string _pcsx2ExecutablePath = string.Empty;
    private string _biosFolder = string.Empty;
    private string _gameFolder = string.Empty;
    private bool _defaultFullscreen;

    public MainViewModel(IAppSettingsService settingsService)
    {
        _settingsService = settingsService;
        LoadSettingsCommand = new RelayCommand(LoadSettings);
        SaveSettingsCommand = new RelayCommand(SaveSettings);
        LoadSettings();
    }

    public string StatusText
    {
        get => _statusText;
        set => SetProperty(ref _statusText, value);
    }

    public string HostStatus
    {
        get => _hostStatus;
        set => SetProperty(ref _hostStatus, value);
    }

    public string NetworkStatus
    {
        get => _networkStatus;
        set => SetProperty(ref _networkStatus, value);
    }

    public string Version
    {
        get => _version;
        set => SetProperty(ref _version, value);
    }

    public string Language
    {
        get => _language;
        set => SetProperty(ref _language, value);
    }

    public string Theme
    {
        get => _theme;
        set => SetProperty(ref _theme, value);
    }

    public string Pcsx2ExecutablePath
    {
        get => _pcsx2ExecutablePath;
        set => SetProperty(ref _pcsx2ExecutablePath, value);
    }

    public string BiosFolder
    {
        get => _biosFolder;
        set => SetProperty(ref _biosFolder, value);
    }

    public string GameFolder
    {
        get => _gameFolder;
        set => SetProperty(ref _gameFolder, value);
    }

    public bool DefaultFullscreen
    {
        get => _defaultFullscreen;
        set => SetProperty(ref _defaultFullscreen, value);
    }

    public ICommand LoadSettingsCommand { get; }

    public ICommand SaveSettingsCommand { get; }

    private void LoadSettings()
    {
        var settings = _settingsService.Load();
        Version = settings.Version;
        Language = settings.Language;
        Theme = settings.Theme;
        Pcsx2ExecutablePath = settings.Pcsx2ExecutablePath;
        BiosFolder = settings.BiosFolder;
        GameFolder = settings.GameFolder;
        DefaultFullscreen = settings.DefaultFullscreen;
        StatusText = "Settings loaded";
    }

    private void SaveSettings()
    {
        _settingsService.Save(new AppSettingsModel
        {
            Version = Version,
            Language = Language,
            Theme = Theme,
            Pcsx2ExecutablePath = Pcsx2ExecutablePath,
            BiosFolder = BiosFolder,
            GameFolder = GameFolder,
            DefaultFullscreen = DefaultFullscreen
        });

        StatusText = "Settings saved";
    }
}
