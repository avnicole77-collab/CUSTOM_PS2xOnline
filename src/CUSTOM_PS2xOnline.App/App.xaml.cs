using System.Windows;
using System.IO;
using CUSTOM_PS2xOnline.App.ViewModels;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Infrastructure.Data;
using CUSTOM_PS2xOnline.Infrastructure.Services;
using CUSTOM_PS2xOnline.Network.Services;
using CUSTOM_PS2xOnline.PCSX2.Services;
using CUSTOM_PS2xOnline.Streaming.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;

namespace CUSTOM_PS2xOnline.App;

public partial class App : Application
{
    private IHost? _host;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var applicationDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CUSTOM_PS2xOnline");
        Directory.CreateDirectory(applicationDataPath);
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .WriteTo.File(
                Path.Combine(applicationDataPath, "logs", "app-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 14)
            .CreateLogger();

        DispatcherUnhandledException += (_, args) =>
        {
            Log.Error(args.Exception, "Unhandled UI exception");
            MessageBox.Show(
                "The application encountered an unexpected error. Details were written to the log.",
                "CUSTOM PS2xOnline",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
        };

        var hostBuilder = Host.CreateDefaultBuilder()
            .UseSerilog()
            .ConfigureServices(services =>
            {
                var databasePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "CUSTOM_PS2xOnline",
                    "data",
                    "custom-ps2xonline.db");
                Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);

                services.AddDbContext<AppDbContext>(options =>
                    options.UseSqlite($"Data Source={databasePath}"));
                services.AddSingleton<IAppSettingsService, AppSettingsService>();
                services.AddSingleton<IGameLibraryService, GameLibraryService>();
                services.AddSingleton<IPcsx2LauncherService, Pcsx2LauncherService>();
                services.AddSingleton<INetworkStatusService, NetworkStatusService>();
                services.AddSingleton<IRoomSessionService, RoomSessionService>();
                services.AddSingleton<IRemotePlayService, ParsecRemotePlayService>();
                services.AddSingleton<MainViewModel>();
            });

        _host = hostBuilder.Build();
        _host.Start();

        using (var scope = _host.Services.CreateScope())
        {
            var database = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            database.Database.EnsureCreated();
        }

        var mainWindow = new MainWindow
        {
            DataContext = _host.Services.GetRequiredService<MainViewModel>()
        };

        mainWindow.Show();
        Log.Information("Application started");
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _host?.StopAsync().GetAwaiter().GetResult();
        _host?.Dispose();
        Log.Information("Application stopped");
        Log.CloseAndFlush();
        base.OnExit(e);
    }
}

