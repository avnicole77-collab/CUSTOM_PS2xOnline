using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.App.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private readonly IAppSettingsService _settingsService;
    private readonly IGameLibraryService _gameLibraryService;
    private readonly IPcsx2LauncherService _launcherService;
    private readonly INetworkStatusService _networkStatusService;
    private readonly IRoomSessionService _roomSessionService;
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
    private GameEntry? _selectedGame;
    private string _roomCode = string.Empty;
    private string _activeRoomCode = "None";
    private string _pcsx2Status = "PCSX2: Not configured";
    private string _biosStatus = "BIOS: Not configured";

    public MainViewModel(
        IAppSettingsService settingsService,
        IGameLibraryService gameLibraryService,
        IPcsx2LauncherService launcherService,
        INetworkStatusService networkStatusService,
        IRoomSessionService roomSessionService)
    {
        _settingsService = settingsService;
        _gameLibraryService = gameLibraryService;
        _launcherService = launcherService;
        _networkStatusService = networkStatusService;
        _roomSessionService = roomSessionService;

        LoadSettingsCommand = new RelayCommand(LoadSettings);
        SaveSettingsCommand = new RelayCommand(SaveSettings);
        ScanGamesCommand = new RelayCommand(ScanGames);
        LaunchSelectedGameCommand = new RelayCommand(LaunchSelectedGame, CanLaunchSelectedGame);
        CreateRoomCommand = new RelayCommand(CreateRoom);
        JoinRoomCommand = new RelayCommand(JoinRoom);
        RefreshStatusCommand = new AsyncRelayCommand(RefreshStatusAsync);
        DetectPcsx2Command = new RelayCommand(DetectPcsx2);

        LoadSettings();
        ScanGames();
        _ = RefreshStatusAsync();
    }

    public ObservableCollection<GameEntry> Games { get; } = [];

    public string StatusText { get => _statusText; set => SetProperty(ref _statusText, value); }
    public string HostStatus { get => _hostStatus; set => SetProperty(ref _hostStatus, value); }
    public string NetworkStatus { get => _networkStatus; set => SetProperty(ref _networkStatus, value); }
    public string Version { get => _version; set => SetProperty(ref _version, value); }
    public string Language { get => _language; set => SetProperty(ref _language, value); }
    public string Theme { get => _theme; set => SetProperty(ref _theme, value); }
    public string Pcsx2ExecutablePath { get => _pcsx2ExecutablePath; set => SetProperty(ref _pcsx2ExecutablePath, value); }
    public string BiosFolder { get => _biosFolder; set => SetProperty(ref _biosFolder, value); }
    public string GameFolder { get => _gameFolder; set => SetProperty(ref _gameFolder, value); }
    public bool DefaultFullscreen { get => _defaultFullscreen; set => SetProperty(ref _defaultFullscreen, value); }
    public string RoomCode { get => _roomCode; set => SetProperty(ref _roomCode, value); }
    public string ActiveRoomCode { get => _activeRoomCode; set => SetProperty(ref _activeRoomCode, value); }
    public string Pcsx2Status { get => _pcsx2Status; set => SetProperty(ref _pcsx2Status, value); }
    public string BiosStatus { get => _biosStatus; set => SetProperty(ref _biosStatus, value); }

    public GameEntry? SelectedGame
    {
        get => _selectedGame;
        set
        {
            if (SetProperty(ref _selectedGame, value))
            {
                (LaunchSelectedGameCommand as RelayCommand)?.NotifyCanExecuteChanged();
            }
        }
    }

    public ICommand LoadSettingsCommand { get; }
    public ICommand SaveSettingsCommand { get; }
    public ICommand ScanGamesCommand { get; }
    public ICommand LaunchSelectedGameCommand { get; }
    public ICommand CreateRoomCommand { get; }
    public ICommand JoinRoomCommand { get; }
    public ICommand RefreshStatusCommand { get; }
    public ICommand DetectPcsx2Command { get; }

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
        if (string.IsNullOrWhiteSpace(Pcsx2ExecutablePath))
        {
            Pcsx2ExecutablePath = _launcherService.FindInstalledExecutable() ?? string.Empty;
        }
        UpdatePcsx2Status();
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

        UpdatePcsx2Status();
        ScanGames();
        StatusText = "Settings saved";
    }

    private void ScanGames()
    {
        var selectedPath = SelectedGame?.FilePath;
        var games = _gameLibraryService.Scan(GameFolder);
        Games.Clear();
        foreach (var game in games)
        {
            Games.Add(game);
        }

        SelectedGame = Games.FirstOrDefault(game =>
            string.Equals(game.FilePath, selectedPath, StringComparison.OrdinalIgnoreCase))
            ?? Games.FirstOrDefault();
        StatusText = $"Found {Games.Count} game(s)";
    }

    private bool CanLaunchSelectedGame() =>
        SelectedGame is not null && _launcherService.IsReady(Pcsx2ExecutablePath);

    private void LaunchSelectedGame()
    {
        if (SelectedGame is null)
        {
            StatusText = "Select a game first";
            return;
        }

        try
        {
            _launcherService.Launch(Pcsx2ExecutablePath, SelectedGame.FilePath, DefaultFullscreen);
            StatusText = $"Launched {SelectedGame.Title}";
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            StatusText = exception.Message;
        }
    }

    private void CreateRoom()
    {
        ActiveRoomCode = _roomSessionService.CreateRoom();
        RoomCode = ActiveRoomCode;
        HostStatus = $"Host: {ActiveRoomCode}";
        StatusText = "Room created locally";
    }

    private void JoinRoom()
    {
        if (!_roomSessionService.TryJoin(RoomCode, out var normalizedCode))
        {
            StatusText = "Room code must contain 6-8 safe characters";
            return;
        }

        ActiveRoomCode = normalizedCode;
        HostStatus = $"Joined: {normalizedCode}";
        StatusText = "Room session joined locally";
    }

    private async Task RefreshStatusAsync()
    {
        var status = await _networkStatusService.CheckAsync();
        NetworkStatus = status.DisplayText;
        UpdatePcsx2Status();
        StatusText = "System status refreshed";
    }

    private void UpdatePcsx2Status()
    {
        Pcsx2Status = _launcherService.IsReady(Pcsx2ExecutablePath)
            ? "PCSX2: Ready"
            : "PCSX2: Not configured";
        (LaunchSelectedGameCommand as RelayCommand)?.NotifyCanExecuteChanged();
        BiosStatus = HasBiosFiles(BiosFolder)
            ? "BIOS: Detected"
            : "BIOS: Required";
    }

    private void DetectPcsx2()
    {
        var detectedPath = _launcherService.FindInstalledExecutable();
        if (detectedPath is null)
        {
            StatusText = "PCSX2 is not installed yet";
            return;
        }

        Pcsx2ExecutablePath = detectedPath;
        UpdatePcsx2Status();
        SaveSettings();
        StatusText = "PCSX2 detected and saved";
    }

    private static bool HasBiosFiles(string folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
        {
            return false;
        }

        try
        {
            return Directory.EnumerateFiles(folderPath)
                .Any(path =>
                    string.Equals(Path.GetExtension(path), ".bin", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(Path.GetExtension(path), ".rom", StringComparison.OrdinalIgnoreCase));
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }
}
